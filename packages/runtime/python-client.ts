import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Analysis } from '../contracts';
import { validateAnalysis } from '../contracts';
export class PythonClient {
  private child?: ChildProcessWithoutNullStreams;
  private readyPromise?: Promise<Record<string, unknown>>;
  private pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout; cleanup: () => void }>();
  private buffer = Buffer.alloc(0);
  private restarts = 0;
  private closed = false;
  public versions: Record<string, unknown> = {};
  constructor(private root = process.cwd()) {}
  start(): Promise<Record<string, unknown>> {
    if (this.closed) return Promise.reject(new Error('ANALYZER_CLOSED'));
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = new Promise((resolve, reject) => {
      const executable = process.env.BURONT_PYTHON || path.join(this.root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
      const child = spawn(executable, [path.join(this.root, 'services/japanese-analysis/service.py')], { windowsHide: true, stdio: 'pipe', env: { ...process.env, PYTHONUTF8: '1' } });
      this.child = child;
      this.buffer = Buffer.alloc(0);
      const timer = setTimeout(() => this.abortProcess('ANALYZER_STARTUP_TIMEOUT'), 45000);
      this.pending.set('ready', { resolve: value => { this.versions = value; resolve(value); }, reject, timer, cleanup: () => {} });
      child.stderr.on('data', () => {}); // Analyzer logs contain no request text; callers expose error codes.
      child.stdout.on('data', (chunk: Buffer) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        if (this.buffer.length > 1_000_000) { this.abortProcess('INVALID_ANALYZER_FRAME'); return; }
        let end: number;
        while ((end = this.buffer.indexOf(10)) >= 0) {
          const line = this.buffer.subarray(0, end); this.buffer = this.buffer.subarray(end + 1);
          try {
            const frame = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line));
            if (frame.protocolVersion !== 1 || typeof frame.requestId !== 'string' || typeof frame.ok !== 'boolean') throw new Error();
            const pending = this.pending.get(frame.requestId);
            if (!pending) throw new Error();
            this.pending.delete(frame.requestId); clearTimeout(pending.timer); pending.cleanup();
            frame.ok ? pending.resolve(frame.result) : pending.reject(new Error(frame.error || 'ANALYSIS_FAILED'));
          } catch { this.abortProcess('INVALID_ANALYZER_FRAME'); return; }
        }
      });
      child.on('error', () => this.abortProcess('ANALYZER_UNAVAILABLE'));
      child.on('exit', () => { if (this.child === child) this.abortProcess('ANALYZER_EXITED'); });
    });
    return this.readyPromise;
  }
  async request(operation: string, payload: unknown, deadline: number, signal?: AbortSignal): Promise<any> {
    if (this.restarts > 2) throw new Error('ANALYZER_RESTART_LIMIT');
    if (signal?.aborted) throw new Error('CANCELLED');
    if (Date.now() >= deadline) throw new Error('DEADLINE_EXCEEDED');
    // Cancellation must also release a coordinator waiting for a restarted
    // analyzer's ready frame. Waiting for start() first can block its queue for
    // the full model load even after the job has already been cancelled.
    const startup = this.start();
    await new Promise<void>((resolve, reject) => {
      const fail = (code: string) => { cleanup(); this.abortProcess(code); reject(new Error(code)); };
      const onAbort = () => fail('CANCELLED');
      const timer = setTimeout(() => fail('DEADLINE_EXCEEDED'), Math.max(1, deadline - Date.now()));
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); };
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
      startup.then(() => { cleanup(); resolve(); }, error => { cleanup(); reject(error); });
    });
    if (signal?.aborted) throw new Error('CANCELLED');
    if (Date.now() >= deadline) throw new Error('DEADLINE_EXCEEDED');
    const requestId = randomUUID();
    const frame = JSON.stringify({ protocolVersion: 1, requestId, operation, payload, deadline }) + '\n';
    if (Buffer.byteLength(frame) > 1_000_000) throw new Error('FRAME_TOO_LARGE');
    return new Promise((resolve, reject) => {
      // This coordinator is the sole owner of stdin. A hung native parser is killed.
      const onAbort = () => this.abortProcess('CANCELLED');
      const timer = setTimeout(() => this.abortProcess('DEADLINE_EXCEEDED'), Math.max(1, deadline - Date.now()));
      signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.set(requestId, { resolve, reject, timer, cleanup: () => signal?.removeEventListener('abort', onAbort) });
      this.child!.stdin.write(frame, error => { if (error) this.abortProcess('ANALYZER_WRITE_FAILED'); });
    });
  }
  async analyze(source: string, deadline = Date.now() + 30000, signal?: AbortSignal): Promise<Analysis> { const result = await this.request('analyze', { source }, deadline, signal); validateAnalysis(result, source); return result; }
  private abortProcess(code: string) {
    const child = this.child; this.child = undefined; this.readyPromise = undefined;
    if (child) { if (!['CANCELLED', 'ANALYZER_CLOSED'].includes(code)) this.restarts++; child.kill(); }
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.cleanup(); pending.reject(new Error(code)); }
    this.pending.clear();
  }
  close() { this.closed = true; this.abortProcess('ANALYZER_CLOSED'); }
  get available() { return !this.closed && this.restarts <= 2; }
}
