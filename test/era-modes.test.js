"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const oracle = require("./fixtures/era-oracles.json");
const archiveSeries = require("../data/archive-series.json");
const { CorpusEngine } = require("../lib/corpus-engine");

const engine = new CorpusEngine();

test("実装の候補生成を使わない固定オラクルで倉庫系列構文を判定する", () => {
  for (const profile of oracle.profiles) {
    const validation = engine.validate(oracle.source, profile.candidate, 3, profile.id);

    assert.equal(validation.passed, true, profile.id);
    assert.equal(validation.semantic, 1, profile.id);
    assert.deepEqual(validation.faithfulQuoteSignatures, ["state_threshold"], profile.id);
    assert.deepEqual(validation.eraSignatures, [profile.expectedSignature], profile.id);
    assert.equal(validation.eraContextMatch, true, profile.id);
  }
});

test("系列・文脈・極性・保護値を壊した候補は正例と同じ検証を通らない", () => {
  const wrongEra = engine.validate(
    oracle.source,
    oracle.profiles.find((profile) => profile.id === "roto").candidate,
    3,
    "yorusama",
  );
  const wrongContext = engine.validate(
    oracle.source,
    "なんだ急に牙抜いてきた　>>田中\n今日は寒い",
    3,
    "all",
  );
  const flippedPolarity = engine.validate(
    oracle.source,
    "今日は寒くない\nこの寒さは普通の寒さの域を超えているでしょう？",
    3,
    "all",
  );
  const missingNumbers = engine.validate(
    "333円を777円に変更した",
    "価格を変更した（ﾘｱﾙ話）",
    3,
    "all",
  );

  assert.equal(wrongEra.passed, false);
  assert.equal(wrongEra.eraContextMatch, false);
  assert.match(wrongEra.warnings.join(" "), /指定系列/);
  assert.equal(wrongContext.passed, false);
  assert.equal(wrongContext.faithfulContextMatch, false);
  assert.match(wrongContext.warnings.join(" "), /出来事型/);
  assert.equal(flippedPolarity.passed, false);
  assert.ok(flippedPolarity.polarity < 0.8);
  assert.match(flippedPolarity.warnings.join(" "), /肯定・否定/);
  assert.equal(missingNumbers.passed, false);
  assert.match(missingNumbers.warnings.join(" "), /333|777/);
});

test("系列区分はログ倉庫の9ページと本文一致件数を正本にする", () => {
  const profiles = Object.fromEntries(engine.status().series.map((profile) => [profile.id, profile]));

  assert.equal(profiles.all.postCount, 2452);
  assert.equal(oracle.profiles.reduce((sum, profile) => sum + profile.postCount, 0), oracle.classifiedPostCount);
  assert.equal(profiles.all.postCount - oracle.classifiedPostCount, oracle.unclassifiedPostCount);
  assert.equal(engine.status().seriesGrammarFrames, 27);
  assert.equal(engine.status().seriesGrammarEvidenceLinks, 27);
  for (const expected of oracle.profiles) {
    assert.equal(profiles[expected.id].label, expected.label);
    assert.equal(profiles[expected.id].postCount, expected.postCount);
    assert.ok(profiles[expected.id].sourceUrl.endsWith(expected.sourcePage));
  }
  assert.ok(profiles.roto.markerRates.beQuestion > profiles.yorusama.markerRates.beQuestion);
  assert.ok(profiles.nega.markerRates.halfwidthKana > profiles.gg.markerRates.halfwidthKana * 3);
  assert.ok(profiles.nega.markerRates.semicolonEmoticon > 0);
});

test("各倉庫系列モードは系列内参照だけを使い、一回で異なる3構文を返す", () => {
  const outputs = new Set();
  const postIdsBySeries = new Map(archiveSeries.series.map((series) => [
    series.id,
    new Set(series.postIds),
  ]));

  for (const profile of oracle.profiles) {
    const result = engine.convert("公園の池でカモが三羽泳いでいた。", {
      contextMode: "faithful",
      level: 3,
      seed: `independent-series-${profile.id}`,
      series: profile.id,
    });
    const options = result.comparisons[0].options;
    const eraSignatures = new Set(options.flatMap((option) => option.validation.eraSignatures));

    outputs.add(result.text);
    assert.equal(result.series, profile.id);
    assert.equal(result.suggestions.length, 3, profile.id);
    assert.equal(options.length, 3, profile.id);
    assert.deepEqual(eraSignatures, new Set(profile.allSignatures), profile.id);
    assert.ok(options.every((option) => option.validation.passed), profile.id);
    assert.ok(options.every((option) => /公園/.test(option.text) && /カモ/.test(option.text) && /三羽/.test(option.text)), profile.id);
    assert.ok(result.comparisons[0].references.length > 0, profile.id);
    assert.ok(result.comparisons[0].references.every((reference) => (
      postIdsBySeries.get(profile.id).has(reference.postId)
    )), profile.id);
  }

  assert.equal(outputs.size, 9);
});

test("長文の完全ブロントナイズでも各倉庫系列3構文と原文の値を保持する", () => {
  const source = "昨日サーバーが停止して12人が顧客データを確認できなくなった。担当者が復旧を試したが報告書の締切にも間に合わず混乱していた。俺が原因を特定して修正し、23時10分にはすべての機能を復旧した。";

  for (const profile of oracle.profiles) {
    const result = engine.convert(source, {
      contextMode: "full",
      level: 3,
      seed: `long-series-${profile.id}`,
      series: profile.id,
    });
    const options = result.comparisons[0].options;
    const eraSignatures = new Set(options.flatMap((option) => option.validation.eraSignatures));

    assert.equal(result.suggestions.length, 3, profile.id);
    assert.deepEqual(eraSignatures, new Set(profile.allSignatures), profile.id);
    assert.ok(options.every((option) => option.validation.passed), profile.id);
    assert.ok(options.every((option) => option.text.includes("12") && option.text.includes("23時10分")), profile.id);
    assert.ok(options.every((option) => !option.text.includes("。")), profile.id);
  }
});
