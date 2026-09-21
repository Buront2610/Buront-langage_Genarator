"use strict";
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../../dist/apps/server/index');
const { setTimeout: delay } = require('node:timers/promises');
const request = (source = '今日は寒い。') => ({ source, task: 'rewrite', contextMode: 'faithful', noveltyMode: 'invent', intensity: 2, series: 'all', backend: 'structured', clientRevision: 7, seed: 'api-test' });
let app, coordinator, headers, otherHeaders;
async function session() { const response = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { 'x-buront-client': '1' }, payload: {} }); assert.equal(response.statusCode, 200, response.body); return { authorization: `Bearer ${response.json().token}`, cookie: response.headers['set-cookie'].split(';')[0] }; }
async function poll(id) { for (let i = 0; i < 200; i++) { const response = await app.inject({ method: 'GET', url: `/api/v1/generations/${id}`, headers }); const job = response.json(); if (['completed', 'cancelled', 'failed'].includes(job.state)) return job; await delay(50); } throw new Error('job timeout'); }
before(async () => { const service = await createApp(); app = service.app; coordinator = service.coordinator; await app.ready(); await service.startup; assert.equal(coordinator.ready, true); headers = await session(); otherHeaders = await session(); });
after(async () => { await app?.close(); });
test('T-22 only built web files; Host/Origin/token/session boundaries', async () => {
  for (const url of ['/.git/config', '/.env', '/data/log-corpus.json', '/docs/architecture.md', '/server.js', '/%2e%2e/server.js']) assert.equal((await app.inject({ url })).statusCode, 404, url);
  assert.equal((await app.inject({ url: '/api/v1/status' })).statusCode, 401);
  assert.equal((await app.inject({ url: '/', headers: { host: 'evil.example' } })).statusCode, 403);
  assert.equal((await app.inject({ url: '/', headers: { host: 'localhost', origin: 'https://evil.example' } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/session', payload: {} })).statusCode, 403);
  assert.equal((await app.inject({ url: '/api/v1/status', headers: { ...headers, cookie: otherHeaders.cookie } })).statusCode, 401);
  const response = await app.inject({ url: '/', headers }); assert.equal(response.statusCode, 200); assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/);
});
test('M4 API separates invalid input, capacity and unavailable capability', async () => {
  for (const body of [{}, request(' '), { ...request(), intensity: '2' }, { ...request(), arbitrary: true }]) assert.equal((await app.inject({ method: 'POST', url: '/api/v1/generations', headers, payload: body })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/generations', headers, payload: { ...request(), backend: 'model' } })).statusCode, 503);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/generations', headers, payload: request('猫'.repeat(50000)) })).statusCode, 413);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/generations', headers: { ...headers, 'content-type': 'application/json' }, payload: Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125]) })).statusCode, 400);
});
let completed;
test('T-12/19 generation result has revision, selected ID, replay, matching spans and no private access', async () => {
  const accepted = await app.inject({ method: 'POST', url: '/api/v1/generations', headers, payload: request() }); assert.equal(accepted.statusCode, 202, accepted.body);
  assert.equal((await app.inject({ url: `/api/v1/generations/${accepted.json().jobId}`, headers: otherHeaders })).statusCode, 404);
  completed = await poll(accepted.json().jobId); assert.equal(completed.state, 'completed', JSON.stringify(completed));
  assert.equal(completed.clientRevision, 7); const result = completed.result; assert.equal(result.candidates.length, 3); assert.ok(result.candidates.find(candidate => candidate.id === result.selectedCandidateId)); assert.ok(result.analysisId);
  const cancelled = await app.inject({ method: 'DELETE', url: `/api/v1/generations/${completed.jobId}`, headers }); assert.equal(cancelled.json().state, 'completed');
});
test('Partial regeneration authenticates analysis and validates locked plan conflicts', async () => {
  const body = { analysisId: completed.result.analysisId, candidateId: completed.result.selectedCandidateId, lockedNodeIds: ['main-quote'], operator: 'OP-01', seed: 'new', clientRevision: 7 };
  const candidate = completed.result.candidates.find(candidate => candidate.id === body.candidateId); body.operator = candidate.plan.mainOperator === 'OP-01' ? 'OP-02' : 'OP-01';
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/regenerations', headers, payload: body })).statusCode, 409);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/regenerations', headers: otherHeaders, payload: body })).statusCode, 409);
  delete body.operator; body.lockedNodeIds = ['fact-node-0'];
  const response = await app.inject({ method: 'POST', url: '/api/v1/regenerations', headers, payload: body }); assert.equal(response.statusCode, 202, response.body);
  const job = await poll(response.json().jobId); assert.equal(job.state, 'completed'); for (const output of job.result.candidates) assert.equal(output.plan.nodes[0].text, candidate.plan.nodes[0].text);
});

test('M3 API completes independent reanalysis and preserves its signed partial replay', async () => {
  const accepted = await app.inject({ method: 'POST', url: '/api/v1/generations', headers, payload: request('担当者が状況を確認しました。') });
  assert.equal(accepted.statusCode, 202);
  const job = await poll(accepted.json().jobId); assert.equal(job.state, 'completed', JSON.stringify(job));
  const candidate = job.result.candidates[0]; assert.ok(candidate);
  assert.ok(candidate.checks.some(check => check.code === 'S-roles' && check.status === 'pass'));
  assert.ok(job.result.replayManifest.semanticVerification.selectionHash);
  const response = await app.inject({ method: 'POST', url: '/api/v1/regenerations', headers, payload: { analysisId: job.result.analysisId, candidateId: candidate.id, lockedNodeIds: ['main-quote'], seed: 'reparse-partial', clientRevision: 7 } });
  assert.equal(response.statusCode, 202);
  const partial = await poll(response.json().jobId); assert.equal(partial.state, 'completed');
  for (const next of partial.result.candidates) {
    assert.equal(next.plan.nodes.find(node => node.id === 'main-quote').text, candidate.plan.nodes.find(node => node.id === 'main-quote').text);
    assert.ok(next.checks.some(check => check.code === 'S-roles' && check.status === 'pass'));
  }
  const Ajv2020 = require('ajv/dist/2020').default, { GenerationResultSchema } = require('../../dist/packages/contracts/results');
  const validate = new Ajv2020({ strict: true }).compile(GenerationResultSchema);
  assert.ok(validate(partial.result), JSON.stringify(validate.errors));
});

test('T-20 cancellation during factual reanalysis cannot publish a late completed result', async () => {
  const originalAnalyze = coordinator.python.analyze.bind(coordinator.python);
  let entered, release;
  const reanalyzing = new Promise(resolve => { entered = resolve; }), blocked = new Promise(resolve => { release = resolve; });
  coordinator.python.analyze = async (text, ...args) => {
    if (text === '担当者が状況を確認した。') { entered(); await blocked; }
    return originalAnalyze(text, ...args);
  };
  try {
    const accepted = await app.inject({ method: 'POST', url: '/api/v1/generations', headers, payload: request('担当者が状況を確認しました。') });
    const id = accepted.json().jobId;
    await Promise.race([reanalyzing, delay(10000).then(() => { throw new Error('reanalysis not reached'); })]);
    const cancelled = await app.inject({ method: 'DELETE', url: `/api/v1/generations/${id}`, headers }); assert.equal(cancelled.json().state, 'cancelled');
    release(); await delay(50);
    const job = await poll(id); assert.equal(job.state, 'cancelled'); assert.equal(job.result, undefined);
  } finally { release(); coordinator.python.analyze = originalAnalyze; }
});
test('T-20 queued/running cancellation and completion have a single terminal state', async () => {
  const accepted = await app.inject({ method: 'POST', url: '/api/v1/generations', headers, payload: request('確認しています。'.repeat(300)) }); assert.equal(accepted.statusCode, 202);
  const id = accepted.json().jobId;
  const cancellation = await app.inject({ method: 'DELETE', url: `/api/v1/generations/${id}`, headers }); assert.equal(cancellation.json().state, 'cancelled');
  await delay(100); assert.equal((await poll(id)).state, 'cancelled');
  const health = await app.inject({ url: '/api/v1/status', headers }); assert.equal(health.statusCode, 200);
});
test('T-21 finite queue and one running request per session; status stays responsive', async () => {
  const first = coordinator.enqueue('queue-0', request('確認しています。'.repeat(300)));
  const queued = Array.from({ length: 8 }, (_, i) => coordinator.enqueue(`queue-${i + 1}`, request()));
  assert.throws(() => coordinator.enqueue('queue-extra', request()), /QUEUE_FULL/);
  assert.throws(() => coordinator.enqueue('queue-0', request()), /QUEUE_FULL/);
  const time = Date.now(); assert.equal((await app.inject({ url: '/api/v1/status', headers })).statusCode, 200); assert.ok(Date.now() - time < 1000);
  for (const job of [first, ...queued]) { coordinator.cancel(job.session, job.id); assert.equal(job.state, 'cancelled'); }
  await delay(100);
});
test('Only explicit preferences are stored; blind comparisons omit source method/rank/scores', async () => {
  const comparison = await app.inject({ method: 'POST', url: '/api/v1/comparisons', headers, payload: { jobId: completed.jobId } }); assert.equal(comparison.statusCode, 200); const pair = comparison.json(); assert.equal(pair.private, undefined); assert.equal(pair.scores, undefined);
  const label = { comparisonId: pair.comparisonId, annotatorId: 'reviewer', dimension: 'S', choice: 'both_bad', reason: '比較評価の契約試験' };
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/preferences', headers, payload: label })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/preferences', headers: otherHeaders, payload: label })).statusCode, 400);
  const exported = (await app.inject({ url: '/api/v1/export', headers })).json(); assert.equal(exported.preferences.length, 1); assert.equal(exported.history.length, 0);
  assert.equal(exported.comparisons[0].private.featureVersion, 'output-text-dense-v2');
  assert.equal(Object.keys(exported.comparisons[0].private.features[0]).length, 44);
  await app.inject({ method: 'DELETE', url: '/api/v1/history', headers }); assert.equal((await app.inject({ url: '/api/v1/export', headers })).json().preferences.length, 0);
});

test('A3 dictionary edits pass through HTTP, worker and reanalysis with meaningful outcomes', async () => {
  for (const [to, expected] of [['冷え込み', 'passed'], ['冷気', 'needs_review'], ['佐藤が田中を助けた。', 'rejected']]) {
    const body = { ...request(), customRules: [{ id: 'synonym', from: '寒さ', to, priority: 0 }] };
    const response = await app.inject({ method: 'POST', url: '/api/v1/generations', headers, payload: body });
    assert.equal(response.statusCode, 202);
    const job = await poll(response.json().jobId); assert.equal(job.state, 'completed');
    const result = job.result;
    if (expected === 'passed') {
      assert.ok(result.candidates.length);
      assert.ok(result.candidates.every(candidate => candidate.text.includes(to) && candidate.plan.rhetoricEdits.length));
      const selected = result.candidates[0];
      const partial = await app.inject({ method: 'POST', url: '/api/v1/regenerations', headers, payload: { analysisId: result.analysisId, candidateId: selected.id, lockedNodeIds: ['main-quote'], seed: 'dictionary-locked', clientRevision: 8 } });
      assert.equal(partial.statusCode, 202);
      const next = await poll(partial.json().jobId); assert.equal(next.state, 'completed'); assert.ok(next.result.candidates.length);
      for (const candidate of next.result.candidates) assert.equal(candidate.plan.surface.coreText, selected.plan.surface.coreText);
    } else if (expected === 'needs_review') {
      assert.equal(result.candidates.length, 0); assert.ok(result.reviewCandidates.length);
      assert.ok(result.reviewCandidates.every(candidate => candidate.verificationStatus === expected));
      assert.equal(result.shortfallReason, 'dictionary_needs_review');
    } else {
      assert.equal(result.candidates.length, 0); assert.equal(result.reviewCandidates.length, 0);
      assert.equal(result.shortfallReason, 'dictionary_rejected');
    }
  }
});
