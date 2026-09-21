'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { StyleVectorAudit, vectorText, normalize, cosine, auc } = require('../../dist/packages/evaluation/style-vector');
const refs = ['田中の盾は重いんだが、強いだけならそれでいいのか？', '佐藤の剣は重いんだが、強いだけでは決まらないだろう。', '勝てると思ったか？それだけで決まる訳がないんだが。'].map((text, i) => ({ id: String(i), text, thread: String(i), postId: String(i) }));
test('vector cosine is normalized, symmetric, finite; absent vocabulary is not zero-quality evidence', () => {
  const a = normalize(new Map([['a', 3], ['b', 4]])), b = normalize(new Map([['a', 1]]));
  assert.ok(Math.abs(cosine(a, a) - 1) < 1e-12); assert.equal(cosine(a, b), cosine(b, a));
  const model = new StyleVectorAudit(refs, 'raw');
  assert.equal(model.measure('🛰️🦀').cosine, null); assert.equal(model.measure('🛰️🦀').coverage, 0);
  assert.ok(model.measure(refs[0].text).neighbors.some(item => item.id === '0' && Math.abs(item.cosine - 1) < 1e-12));
});
test('a frozen vector basis cannot learn from candidates; script ablation declares its kana limitation', () => {
  const model = new StyleVectorAudit(refs, 'script_masked'), id = model.modelId, vocabulary = [...model.vocabulary];
  const left = '田中の盾は重いんだが', right = '鈴木の資料は軽いんだが';
  assert.equal(vectorText(left, 'script_masked'), vectorText(right, 'script_masked'));
  assert.deepEqual(model.measure(left), model.measure(right));
  assert.notEqual(vectorText('まことだろう', 'script_masked'), vectorText('ゆうこだろう', 'script_masked'));
  model.measure('新規候補だけに出る未知語彙があっても特徴空間を更新しない');
  assert.equal(model.modelId, id); assert.deepEqual([...model.vocabulary], vocabulary);
});
test('phrase ablation removes known slogans and AUC counts ties without inventing labels', () => {
  assert.doesNotMatch(vectorText('おいィ？確定的に明らか。それほどでもない。', 'phrase_masked'), /おい|それほどでもない/);
  assert.equal(auc([.9, .8], [.1, .2]), 1); assert.equal(auc([.1], [.9]), 0); assert.equal(auc([.5], [.5]), .5); assert.equal(auc([], [.5]), null);
});
