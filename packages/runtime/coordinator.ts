import { randomUUID, createHmac, randomBytes } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { Piscina } from 'piscina';
import { PythonClient } from './python-client';
import { Assets, compileAssets, loadAssets, publishAssets } from '../core/assets';
import type { GenerationRequest, GenerationResult, QuotePlan } from '../contracts';
import type { GenerationOptions } from '../core/engine';
import type { HistoryEntry } from '../core/evaluation';
import { hash } from '../core/source';
import { BoundedCache } from './bounded-cache';
import type { Analysis } from '../contracts';
import { semanticAnalyses } from './semantic-verification';

export type JobState = 'queued' | 'analyzing' | 'planning' | 'generating' | 'validating' | 'evaluating' | 'cancel_requested' | 'completed' | 'cancelled' | 'failed';
export type Job = { id: string; session: string; state: JobState; request: GenerationRequest; createdAt: number; startedAt?: number; finishedAt?: number; touched: number; result?: GenerationResult; error?: string; assetPath: string; datasetId: string; history: HistoryEntry[]; options: GenerationOptions; control: Int32Array; abort: AbortController; elapsedMs?: number };
const terminal = new Set<JobState>(['completed', 'failed', 'cancelled']);
export class Coordinator {
  private pool: Piscina;
  readonly python: PythonClient;
  readonly jobs = new Map<string, Job>();
  private queue: Job[] = [];
  private running?: Job;
  private secret = randomBytes(32);
  private analysisCache = new BoundedCache<Analysis>(100, 16 * 1024 * 1024, 30 * 60000);
  private closing = false;
  private sweeper: NodeJS.Timeout;
  assets: Assets;
  assetPath: string;
  ready = false;
  constructor(private root = process.cwd(), private deadlineMs = 30000) {
    this.assets = compileAssets(root);
    const pointerFile = path.join(root, '.runtime/assets/active.json');
    let existingPath: string | undefined;
    if (fs.existsSync(pointerFile)) {
      const pointer = JSON.parse(fs.readFileSync(pointerFile, 'utf8'));
      if (!/^[a-f0-9]{64}$/u.test(pointer.datasetId ?? '')) throw new Error('ASSET_INCOMPATIBLE');
      const candidatePath = path.join(root, '.runtime/assets', `${pointer.datasetId}.json`), previous = loadAssets(candidatePath);
      if (previous.manifest.engine?.sourceHash === this.assets.manifest.engine?.sourceHash) { this.assets = previous; existingPath = candidatePath; }
    }
    this.assetPath = existingPath ?? publishAssets(this.assets, root);
    this.python = new PythonClient(root);
    this.pool = new Piscina({ filename: path.join(__dirname, 'worker.js'), minThreads: 1, maxThreads: 1, maxQueue: 8, idleTimeout: 60000 });
    this.sweeper = setInterval(() => this.sweep(), 60000); this.sweeper.unref();
  }
  async start() {
    await Promise.all([this.python.start(), this.pool.run({ warmup: true, assetPath: this.assetPath })]);
    this.ready = true;
  }
  enqueue(session: string, request: GenerationRequest, history: HistoryEntry[] = [], options: GenerationOptions = {}): Job {
    this.sweep();
    this.refreshAssets();
    if (!this.ready || this.closing || !this.python.available) throw new Error('CAPABILITY_UNAVAILABLE');
    if (this.queue.length >= 8 || [...this.jobs.values()].some(job => job.session === session && !terminal.has(job.state))) throw new Error('QUEUE_FULL');
    if (request.backend !== 'structured') throw new Error('CAPABILITY_UNAVAILABLE');
    const job: Job = { id: randomUUID(), session, state: 'queued', request: structuredClone(request), createdAt: Date.now(), touched: Date.now(),
      assetPath: this.assetPath, datasetId: this.assets.datasetId, history: structuredClone(history), options: { ...options, engineVersion: JSON.parse(fs.readFileSync(path.join(this.root, 'build-info.json'), 'utf8')).sourceHash }, control: new Int32Array(new SharedArrayBuffer(8)), abort: new AbortController() };
    this.jobs.set(job.id, job); this.queue.push(job); void this.pump(); return job;
  }
  get(session: string, id: string) { const job = this.jobs.get(id); if (job?.session !== session) return undefined; job.touched = Date.now(); return job; }
  view(job: Job) {
    if (this.running === job && !terminal.has(job.state) && job.state !== 'cancel_requested') {
      const stage = ['analyzing', 'planning', 'generating', 'validating', 'evaluating'][Atomics.load(job.control, 1)];
      const order = ['queued', 'analyzing', 'planning', 'generating', 'validating', 'evaluating'];
      if (order.indexOf(stage) > order.indexOf(job.state)) job.state = stage as JobState;
    }
    return { jobId: job.id, state: job.state, clientRevision: job.request.clientRevision, inputHash: hash(job.request.source), createdAt: job.createdAt, startedAt: job.startedAt, finishedAt: job.finishedAt, elapsedMs: job.elapsedMs, error: job.error, result: job.result };
  }
  cancel(session: string, id: string) {
    const job = this.get(session, id); if (!job) return undefined;
    if (terminal.has(job.state)) return job;
    job.state = 'cancel_requested'; Atomics.store(job.control, 0, 1); job.abort.abort();
    this.queue = this.queue.filter(queued => queued !== job);
    this.finish(job, 'cancelled'); return job;
  }
  private finish(job: Job, state: 'completed' | 'failed' | 'cancelled', result?: GenerationResult, error?: string) {
    if (terminal.has(job.state)) return false;
    job.state = state; job.finishedAt = Date.now(); job.touched = Date.now(); job.elapsedMs = job.startedAt ? job.finishedAt - job.startedAt : 0; job.result = result; job.error = error;
    if (result) result.analysisId = `${job.id}.${createHmac('sha256', this.secret).update(`${job.session}:${job.id}:${job.datasetId}:${result.inputHash}`).digest('hex')}`;
    try {
      const log = path.join(this.root, '.runtime/diagnostics.jsonl');
      if (fs.existsSync(log) && fs.statSync(log).size > 2 * 1024 * 1024) fs.renameSync(log, log + '.previous');
      fs.appendFileSync(log, JSON.stringify({ jobId: job.id, state, elapsedMs: job.elapsedMs, queueMs: job.startedAt ? job.startedAt - job.createdAt : null, error, shortfall: result?.shortfallReason, candidateCount: result?.candidates.length, datasetId: job.datasetId }) + '\n');
    } catch { /* A diagnostic write failure must not change a terminal job result. */ }
    this.sweep(); return true;
  }
  verifyAnalysis(job: Job, id: string) { return job.result?.analysisId === id && job.datasetId === this.assets.datasetId; }
  private async pump() {
    if (this.running || this.closing) return;
    const job = this.queue.shift(); if (!job) return;
    this.running = job; job.state = 'analyzing'; job.startedAt = Date.now();
    const deadline = job.startedAt + this.deadlineMs;
    const timer = setTimeout(() => { if (!terminal.has(job.state)) { this.finish(job, 'failed', undefined, 'DEADLINE_EXCEEDED'); Atomics.store(job.control, 0, 1); job.abort.abort(); } }, this.deadlineMs);
    try {
      const analysisKey = hash([job.request.source, this.python.versions, job.datasetId]);
      const analysis = this.analysisCache.get(analysisKey) ?? await this.python.analyze(job.request.source, deadline, job.abort.signal);
      this.analysisCache.set(analysisKey, analysis);
      if (job.abort.signal.aborted) throw new Error('CANCELLED');
      job.state = 'planning';
      const result = await this.pool.run({ request: job.request, analysis, assetPath: job.assetPath, control: job.control.buffer, options: { ...job.options, history: job.history, deadline } }, { signal: job.abort.signal });
      const analyses = await semanticAnalyses(result, this.python, analysis, deadline, job.abort.signal);
      const verified = await this.pool.run({ result, analyses }, { signal: job.abort.signal });
      this.finish(job, 'completed', verified);
    } catch (error) { this.finish(job, job.abort.signal.aborted ? 'cancelled' : 'failed', undefined, error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'GENERATION_FAILED'); }
    finally { clearTimeout(timer); this.running = undefined; void this.pump(); }
  }
  sweep() {
    const retained = new Map<string, Job[]>(); let bytes = 0;
    for (const job of this.jobs.values()) {
      if (!terminal.has(job.state)) continue;
      if (Date.now() - job.touched > 30 * 60000) { this.jobs.delete(job.id); continue; }
      const list = retained.get(job.session) ?? []; list.push(job); retained.set(job.session, list);
    }
    for (const jobs of retained.values()) for (const job of jobs.sort((a, b) => b.createdAt - a.createdAt).slice(20)) this.jobs.delete(job.id);
    const all = [...this.jobs.values()].filter(job => terminal.has(job.state)).sort((a, b) => b.touched - a.touched);
    for (const job of all) { bytes += Buffer.byteLength(JSON.stringify(this.view(job))); if (bytes > 64 * 1024 * 1024) this.jobs.delete(job.id); }
  }
  activate(filename: string) { const assets = loadAssets(filename); if (assets.manifest.engine?.safetyContract !== 'v1') throw new Error('ASSET_INCOMPATIBLE'); this.assetPath = filename; this.assets = assets; }
  refreshAssets() { const pointer = JSON.parse(fs.readFileSync(path.join(this.root, '.runtime/assets/active.json'), 'utf8')); if (!/^[a-f0-9]{64}$/u.test(pointer.datasetId ?? '')) throw new Error('ASSET_INCOMPATIBLE'); if (pointer.datasetId !== this.assets.datasetId) this.activate(path.join(this.root, '.runtime/assets', `${pointer.datasetId}.json`)); }
  deleteSession(session: string) { for (const job of this.jobs.values()) if (job.session === session) { this.cancel(session, job.id); this.jobs.delete(job.id); } this.analysisCache.clear(); }
  async close() { this.closing = true; this.ready = false; clearInterval(this.sweeper); for (const job of this.jobs.values()) this.cancel(job.session, job.id); this.analysisCache.clear(); this.python.close(); await this.pool.destroy(); }
}
