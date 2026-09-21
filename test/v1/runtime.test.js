"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { PythonClient } = require('../../dist/packages/runtime/python-client');
const { createApp } = require('../../dist/apps/server/index');
const { publicFile } = require('../../dist/packages/runtime/public-files');
const { compileAssets, publishAssets, loadAssets } = require('../../dist/packages/core/assets');
const { hash } = require('../../dist/packages/core/source');
function temporary() { return fs.mkdtempSync(path.join(os.tmpdir(), 'buront-runtime-')); }
function clean(directory) { assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(directory, { recursive: true, force: true }); }
test('T-22 an assets directory junction cannot escape the public root', () => {
  const directory = temporary();
  try { const inside = path.join(directory, 'web'), outside = path.join(directory, 'private'); fs.mkdirSync(inside); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'secret.js'), 'not public'); fs.symlinkSync(outside, path.join(inside, 'assets'), process.platform === 'win32' ? 'junction' : 'dir'); assert.equal(publicFile(inside, 'assets/secret.js'), undefined); assert.equal(publicFile(inside, '../private/secret.js'), undefined); }
  finally { clean(directory); }
});
test('T-23 immutable content-addressed snapshots support atomic activation and rollback', () => {
  const directory = temporary();
  try { const a = compileAssets(), first = publishAssets(a, directory); const b = structuredClone(a); b.evidence[0].text += ' 版更新'; b.manifest.compiledEvidence = hash(b.evidence); b.datasetId = hash(b.manifest); const second = publishAssets(b, directory); assert.notEqual(first, second); assert.equal(loadAssets(first).evidence[0].text, a.evidence[0].text); assert.equal(loadAssets(second).evidence[0].text, b.evidence[0].text); publishAssets(a, directory); assert.equal(JSON.parse(fs.readFileSync(path.join(directory, '.runtime/assets/active.json'))).datasetId, a.datasetId); }
  finally { clean(directory); }
});
// This test includes two model starts (each has its own 45-second bound).
test('T-21 invalid analyzer stdout is rejected and the persistent process can restart', { timeout: 120000 }, async () => {
  const client = new PythonClient();
  try { await client.start(); client.child.stdout.emit('data', Buffer.from('not-json\n')); await client.start(); const analysis = await client.analyze('猫が魚を食べた。'); assert.ok(analysis.tokens.some(token => token.text === '猫')); }
  finally { client.close(); }
});
// Startup/index preparation is outside the actual 10-millisecond job deadline.
test('T-20/21 deadline fails once while status remains available; retained results obey count and TTL', { timeout: 120000 }, async () => {
  const { app, coordinator, startup } = await createApp({ deadlineMs: 10 });
  try {
    await app.ready(); await startup;
    const request = { source: '田中が確認した。'.repeat(400), task: 'rewrite', contextMode: 'faithful', noveltyMode: 'invent', intensity: 2, series: 'all', backend: 'structured', clientRevision: 1, seed: 'deadline' };
    const job = coordinator.enqueue('deadline-session', request);
    for (let i = 0; i < 100 && !['completed', 'failed', 'cancelled'].includes(job.state); i++) await delay(20);
    assert.equal(job.state, 'failed'); assert.equal(job.error, 'DEADLINE_EXCEEDED'); coordinator.cancel(job.session, job.id); assert.equal(job.state, 'failed');
    for (let i = 0; i < 25; i++) coordinator.jobs.set(`retained-${i}`, { ...job, id: `retained-${i}`, session: 'retention', createdAt: Date.now() + i, touched: Date.now() });
    coordinator.sweep(); assert.equal([...coordinator.jobs.values()].filter(job => job.session === 'retention').length, 20);
    for (const item of coordinator.jobs.values()) item.touched = Date.now() - 31 * 60000;
    coordinator.sweep(); assert.equal(coordinator.jobs.size, 0);
  } finally { await app.close(); }
});
