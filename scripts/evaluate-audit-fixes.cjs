'use strict';
// Engineering regression evidence; no synthetic preference labels or style scores.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { PythonClient } = require('../dist/packages/runtime/python-client');
const { verifyGeneratedResult } = require('../dist/packages/runtime/semantic-verification');
const { compileAssets } = require('../dist/packages/core/assets');
const { generate } = require('../dist/packages/core/engine');
const { makePlans } = require('../dist/packages/core/creation');
const { sourceDocument, hash } = require('../dist/packages/core/source');
const { extractFacts } = require('../dist/packages/core/facts');
const { realize, validateCandidate, verification } = require('../dist/packages/core/validator');
const { compareSemantics } = require('../dist/packages/core/semantic');
const { rhetoricalCore, features, featureVersion } = require('../dist/packages/core/evaluation');
const { frameRhetoric } = require('../dist/packages/core/series');
const { blindPairs } = require('../dist/packages/evaluation/dataset');
const request = (source, extra = {}) => ({ source, task: 'rewrite', contextMode: 'faithful', noveltyMode: 'invent', intensity: 2, series: 'all', backend: 'structured', clientRevision: 0, seed: 'audit-fixes-v3', ...extra });
async function main() {
  const directory = 'artifacts/v1-evaluation-experimental.3'; fs.mkdirSync(directory, { recursive: true });
  const python = new PythonClient(), assets = compileAssets(), cache = new Map();
  const analyze = async text => { if (!cache.has(text)) cache.set(text, await python.analyze(text)); return cache.get(text); };
  const run = async (source, extra) => { const analysis = await analyze(source); return verifyGeneratedResult(generate(request(source, extra), analysis, assets), python, analysis); };
  const irFor = async source => extractFacts(sourceDocument(source), await analyze(source), request(source));
  const references = new Map(assets.evidence.map(row => [row.id, row.text]));
  try {
    await python.start();
    const source = '田中が佐藤を助けた。', swapped = '佐藤が田中を助けた。';
    const plans = makePlans(await irFor(source), request(source), assets), swappedPlans = makePlans(await irFor(swapped), request(swapped), assets);
    const roleSensitivity = { plans: plans.length, identical: plans.filter(plan => swappedPlans.some(other => rhetoricalCore({ plan }) === rhetoricalCore({ plan: other }))).length, examples: [plans[0].surface.coreText, swappedPlans[0].surface.coreText] };
    assert.equal(roleSensitivity.identical, 0);
    const dictionary = [];
    for (const to of ['冷え込み', '冷気', '実際には佐藤が田中を助けた。']) {
      const result = await run('今日は寒い。', { customRules: [{ id: 'cold', from: '寒さ', to, priority: 0 }] });
      dictionary.push({ to, candidates: result.candidates.length, review: result.reviewCandidates.length, reason: result.shortfallReason });
    }
    assert.ok(dictionary[0].candidates > 0 && dictionary[1].review > 0 && dictionary[2].reason === 'dictionary_rejected');
    const forged = structuredClone(plans[0]); forged.surface.coreText = '実際には佐藤が田中を助けた。';
    forged.nodes.find(node => node.id === 'main-quote').text = frameRhetoric(forged.surface.coreText, forged.surface.constructionId);
    const draft = realize(forged, await irFor(source));
    const checks = validateCandidate(await irFor(source), forged, draft.text, draft.spans, new Set(references.keys()), new Set([forged.nodes.find(node => node.id === 'main-quote').text]), references, assets.seriesProfiles);
    const compilerRegression = { status: verification(checks), checks };
    assert.equal(compilerRegression.status, 'rejected');
    const temporal = compareSemantics(await irFor('田中が確認しなかった。今日は寒い。'), await irFor('田中が確認しない。今日は寒い。'));
    assert.equal(temporal.find(check => check.code === 'S-temporal').status, 'fail');
    const mixed = await run('田中がAを復旧した。Bは停止中で、私は明日確認する。', { contextMode: 'full' });
    fs.writeFileSync(`${directory}/document-result.json`, JSON.stringify(mixed, null, 2));
    assert.ok(mixed.candidates.some(candidate => candidate.text.includes('Bは停止中だ。')));
    const counterexamples = [];
    for (const row of require('../test/fixtures/design-counterexamples.json')) {
      const checks = compareSemantics(await irFor(row.source), await irFor(row.candidate));
      counterexamples.push({ id: row.id, status: verification(checks), failed: checks.filter(check => check.status === 'fail').map(check => check.code) });
    }
    assert.ok(counterexamples.every(row => row.status === 'rejected'));
    const abstentions = [];
    for (const source of ['猫', '今日は寒くない。', '田中が佐藤を助けたと鈴木が言った。']) { const result = await run(source); abstentions.push({ source, candidates: result.candidates.length, reason: result.shortfallReason }); }
    const comparisons = [], series = [];
    const { CorpusEngine } = require('../lib/corpus-engine'), legacy = new CorpusEngine();
    for (const source of ['今日は寒い。', '田中が佐藤を助けた。', '私は明日確認する。']) {
      const structured = await run(source), old = legacy.convert(source, { level: 2, seed: 'audit-fixes-v3' });
      const output = [...structured.candidates.map(c => ({ text: c.text, method: 'structured' })), { text: old.text, method: 'legacy' }, { text: source, method: 'plain' }, { text: source + '説明書にも説明書が必要だ。', method: 'ordinary_joke' }, { text: source + '逆さの意味が意味して椅子する。', method: 'incoherent_control' }].map(row => ({ ...row, features: features(row) }));
      comparisons.push(...blindPairs(source, output, hash(source), 'pilot'));
    }
    const ablations = [];
    for (const row of assets.series) {
      const result = await run('今日は寒い。', { series: row.id });
      series.push({ id: row.id, candidates: result.candidates.length, frames: [...new Set(result.candidates.map(c => c.plan.surface.constructionId))], discourse: [...new Set(result.candidates.map(c => c.plan.rhetoric.discourse))] });
      for (const candidate of result.candidates) {
        const frameRemoved = rhetoricalCore(candidate), topicRemoved = frameRemoved.replaceAll('寒さ', '対象の状態').replaceAll(candidate.plan.rhetoric.target, '道具');
        ablations.push({ id: candidate.id, source: '今日は寒い。', full: candidate.text, frameRemoved, topicRemoved, private: { series: row.id, operator: candidate.plan.mainOperator }, scores: null });
      }
    }
    const shapeCounts = [...new Set(comparisons.flatMap(pair => pair.private.features.map(value => Object.keys(value).length)))];
    assert.deepEqual(shapeCounts, [44]);
    fs.writeFileSync(`${directory}/comparisons-private.json`, JSON.stringify({ featureVersion, comparisons, preferences: [] }, null, 2));
    fs.writeFileSync(`${directory}/comparisons-blind.json`, JSON.stringify(comparisons.map(({ private: hidden, ...pair }) => pair), null, 2));
    fs.writeFileSync(`${directory}/series-ablations-private.json`, JSON.stringify(ablations, null, 2));
    fs.writeFileSync(`${directory}/series-ablations-blind.json`, JSON.stringify(ablations.map(({ private: hidden, ...row }) => row), null, 2));
    const timing = [];
    for (const size of [500, 5000]) {
      const source = [...'担当者が状況を確認しました。'.repeat(500)].slice(0, size).join('');
      const started = performance.now(), result = await run(source);
      timing.push({ size, milliseconds: performance.now() - started, candidates: result.candidates.length, sampleCount: 1 });
    }
    const report = { version: require('../package.json').version, build: assets.manifest.engine, datasetId: assets.datasetId, roleSensitivity, dictionary, compilerRegression, temporal, counterexamples, abstentions,
      mixed: { units: mixed.candidates[0].plan.narrative.units, output: mixed.candidates[0].text }, featureVersion, featureCounts: shapeCounts, comparisonPairs: comparisons.length, series, timing,
      humanStyleQuality: null, humanQuoteQuality: null, seriesRecognitionAfterAblation: null, conceptNoveltyCorpus: null,
      limitations: ['Five supported source relations; unsupported and attributed/ambiguous propositions abstain.', 'Rhetoric verification recognizes a closed language; it is not a general Japanese semantic verifier.', 'Nominal dictionary edits outside the supported synonym pair require review; clause edits are rejected.', 'Comparisons and ablations are unlabelled pilot material, not held-out quality evidence.', 'Timing is one warm local sample per size, not p95.'] };
    fs.writeFileSync(`${directory}/report.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ report: `${directory}/report.json`, roleSensitivity, dictionary, compilerRegression: compilerRegression.status, temporal: temporal.find(c => c.code === 'S-temporal').status, counterexamples: counterexamples.length, comparisonPairs: comparisons.length, featureCounts: shapeCounts, series, timing }, null, 2));
  } finally { python.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
