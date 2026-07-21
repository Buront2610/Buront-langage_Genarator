"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { CorpusEngine } = require("../lib/corpus-engine");

const engine = new CorpusEngine();

test("ベクトル検索・系列重心・近傍帯の一様抽選を状態として公開する", () => {
  const status = engine.status();
  assert.equal(status.retrievalMetric, "tfidf-cosine");
  assert.equal(status.seriesStyleMetric, "tfidf-centroid-and-knn-cosine");
  assert.equal(status.retrievalRandomization, "uniform-near-neighbor-band-with-diversity");
  assert.ok(status.retrievalVocabulary >= 3000);
  assert.ok(status.seriesStyleVocabulary >= 10000);
});

test("同じseedは文章・参照・コサイン値まで再現する", () => {
  const options = { contextMode: "faithful", level: 3, seed: "vector-repeatable", series: "katuru" };
  const first = engine.convert("今日は寒い", options);
  const second = engine.convert("今日は寒い", options);

  assert.equal(first.text, second.text);
  assert.deepEqual(first.suggestions, second.suggestions);
  assert.deepEqual(first.comparisons[0].references, second.comparisons[0].references);
  assert.ok(first.comparisons[0].references.every((reference) => (
    Number.isFinite(reference.cosineSimilarity)
  )));
});

test("seedを変えると近傍帯から参照と生成結果が分散し、一候補へ固定されない", () => {
  const runs = Array.from({ length: 30 }, (_, index) => engine.convert("今日は寒い", {
    contextMode: "faithful",
    level: 2,
    seed: `vector-dispersion-${index}`,
  }));
  const outputs = new Set(runs.map((result) => result.text));
  const referenceIds = new Set(runs.flatMap((result) => (
    result.comparisons[0].references.map((reference) => reference.postId)
  )));
  const firstReferenceCounts = new Map();
  for (const result of runs) {
    const postId = result.comparisons[0].references[0].postId;
    firstReferenceCounts.set(postId, (firstReferenceCounts.get(postId) || 0) + 1);
  }
  const mostFrequentFirst = Math.max(...firstReferenceCounts.values());

  assert.ok(outputs.size >= 4, `生成結果が${outputs.size}種類しかない`);
  assert.ok(referenceIds.size >= 8, `参照が${referenceIds.size}件に固定された`);
  assert.ok(firstReferenceCounts.size >= 3, "先頭参照がほぼ固定された");
  assert.ok(mostFrequentFirst <= 18, `同じ先頭参照が30回中${mostFrequentFirst}回出た`);
});

test("生成文の系列コサインを全9系列と比較し、指定系列を多数で上位判定する", () => {
  const source = "公園の池でカモが三羽泳いでいた。";
  const seriesIds = engine.status().series.map(({ id }) => id).filter((id) => id !== "all");
  const validations = seriesIds.map((series) => engine.convert(source, {
    contextMode: "faithful",
    level: 3,
    seed: `vector-series-${series}`,
    series,
  }).comparisons[0].validation);
  const topOne = validations.filter(({ seriesVectorRank }) => seriesVectorRank === 1).length;
  const topThree = validations.filter(({ seriesVectorRank }) => seriesVectorRank <= 3).length;

  assert.ok(validations.every((validation) => Object.keys(validation.seriesVectorScores).length === 9));
  assert.ok(validations.every((validation) => validation.seriesVectorCosine > 0));
  assert.ok(topOne >= 5, `指定系列のtop1が${topOne}/9`);
  assert.ok(topThree >= 8, `指定系列のtop3が${topThree}/9`);
});
