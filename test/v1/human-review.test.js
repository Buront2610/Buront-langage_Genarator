'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Fastify = require('fastify');
const { hash } = require('../../dist/packages/core/source');
const { ReviewStore } = require('../../dist/packages/runtime/review-store');
const { reviewRoutes } = require('../../dist/packages/runtime/review-routes');
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buront-review-test-'));
  const folder = path.join(root, 'artifacts/vector-style-audit'); fs.mkdirSync(folder, { recursive: true });
  const body = { schemaVersion: 1, title: 'TEST FIXTURE', engineHash: 'test', datasetId: 'test', vectorReportHash: 'test',
    items: [0, 1].map(i => ({ id: `case-${i}`, source: '試験用原文', left: '試験用の左', right: '試験用の右', private: { method: 'SECRET_METHOD', vector: .123, split: 'pilot' } })), manifest: { fixture: true } };
  const pack = { ...body, batchId: hash(body) }; fs.writeFileSync(path.join(folder, 'review-pack.json'), JSON.stringify(pack));
  return { root, pack, clean() { assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(root, { recursive: true, force: true }); } };
}
const rating = (pack, itemId = 'case-0') => ({ batchId: pack.batchId, itemId, annotatorId: 'test-only', ratings: { S: 'both_bad', Q: 'tie', C: 'cannot_judge' }, reason: '自動テストの架空データ。人間の評価ではない。' });
test('blind review reads have no default answers or private diagnostics; all dimensions require an explicit value', () => {
  const f = fixture(); try {
    const store = new ReviewStore(f.root), view = store.read('test-only');
    assert.deepEqual(view.answers, []); assert.equal(view.humanApproval, 'pending');
    assert.doesNotMatch(JSON.stringify(view), /SECRET_METHOD|vector|private|rank/);
    assert.equal(fs.existsSync(path.join(f.root, '.runtime/reviews')), false);
    assert.throws(() => store.save({ ...rating(f.pack), ratings: { S: 'left' } }), /INVALID_REVIEW_ANSWER/);
    assert.throws(() => store.save({ ...rating(f.pack), ratings: { S: 'left', Q: 'right', C: 'yes' } }), /INVALID_REVIEW_ANSWER/);
    assert.throws(() => store.save({ ...rating(f.pack), batchId: 'old' }), /REVIEW_BATCH_CHANGED/);
    assert.throws(() => store.export('test-only'), /REVIEW_INCOMPLETE/);
  } finally { f.clean(); }
});
test('explicit ratings survive a new store instance; revisions preserve disagreements without automatic approval', () => {
  const f = fixture(); try {
    const store = new ReviewStore(f.root); store.save(rating(f.pack));
    const fresh = new ReviewStore(f.root); assert.equal(fresh.read('test-only').answers.length, 1); assert.equal(fresh.read('someone-else').answers.length, 0);
    fresh.save({ ...rating(f.pack), ratings: { S: 'right', Q: 'both_bad', C: 'tie' } });
    assert.equal(fresh.read('test-only').answers.length, 1);
    fresh.save(rating(f.pack, 'case-1'));
    const exported = fresh.export('test-only');
    assert.equal(exported.answers.length, 2); assert.equal(exported.history.length, 3); assert.equal(exported.releaseApproved, false);
    assert.equal(exported.answers[0].origin, 'explicit_user'); assert.equal(exported.history[0].ratings.S, 'both_bad');
  } finally { f.clean(); }
});
test('review HTTP routes keep diagnostics hidden and reject incomplete or stale submissions', async () => {
  const f = fixture(), app = Fastify(); reviewRoutes(app, f.root);
  try {
    assert.equal((await app.inject('/api/v1/review')).statusCode, 200);
    assert.doesNotMatch((await app.inject('/api/v1/review')).body, /SECRET_METHOD/);
    assert.equal((await app.inject('/api/v1/review/export')).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/review/ratings', payload: { ...rating(f.pack), batchId: 'stale' } })).statusCode, 409);
    const response = await app.inject({ method: 'POST', url: '/api/v1/review/ratings', payload: rating(f.pack) });
    assert.equal(response.statusCode, 200); assert.equal(response.json().completed, 1);
  } finally { await app.close(); f.clean(); }
});
test('changing reviewed text invalidates the frozen batch instead of attaching old answers', () => {
  const f = fixture(); try {
    f.pack.items[0].left = '改変'; fs.writeFileSync(path.join(f.root, 'artifacts/vector-style-audit/review-pack.json'), JSON.stringify(f.pack));
    assert.throws(() => new ReviewStore(f.root).read(), /INVALID_REVIEW_PACK/);
  } finally { f.clean(); }
});
