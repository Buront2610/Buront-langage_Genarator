import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { PythonClient } from '../../packages/runtime/python-client';
import { compileAssets } from '../../packages/core/assets';
import { generate } from '../../packages/core/engine';
import { features, featureVersion } from '../../packages/core/evaluation';
import { blindPairs, splitBeforeGeneration } from '../../packages/evaluation/dataset';
import type { GenerationRequest } from '../../packages/contracts';
async function main() {
  const { CorpusEngine } = require('../../../lib/corpus-engine');
  const legacy = new CorpusEngine();
  const sources = ['今日は寒い。', '田中が佐藤を助けた。', '100円を300円に変更した。', '田中は承認した。佐藤は承認していない。', '田中がAを復旧した。Bは停止中で、私は明日確認する。', '田中が確認したと佐藤が言った。', '猫', '明日は監視項目を追加する。'];
  // These are hand-authored engineering cases, not held-out corpus families.
  const families = ['weather', 'assistance', 'quantity_change', 'approval', 'recovery_status', 'reported_speech', 'topic_fragment', 'verification'];
  const split = splitBeforeGeneration(sources.map((text, i) => ({ id: `case-${i}`, text, postId: '', threadId: '', family: families[i] })));
  split.examples = split.examples.map(example => ({ ...example, split: 'pilot' }));
  fs.mkdirSync('artifacts/v1-evaluation', { recursive: true }); fs.writeFileSync('artifacts/v1-evaluation/split.json', JSON.stringify(split, null, 2));
  const python = new PythonClient(), assets = compileAssets(), records: any[] = [], comparisons: any[] = [];
  const startup = performance.now();
  try {
    await python.start(); const coldStartupMs = performance.now() - startup;
    for (const example of split.examples) {
      const request: GenerationRequest = { source: example.text, task: 'rewrite', contextMode: 'faithful', noveltyMode: 'invent', intensity: 2, series: 'all', backend: 'structured', clientRevision: 0, seed: 'release-evaluation-v1' };
      const start = performance.now(), analysis = await python.analyze(request.source), result = generate(request, analysis, assets);
      records.push({ id: example.id, milliseconds: performance.now() - start, candidates: result.candidates.length, review: result.reviewCandidates.length, fallback: !!result.fallback, operators: result.candidates.map(candidate => candidate.plan.mainOperator), classifications: result.candidates.map(candidate => candidate.novelty.classification), candidateSetHash: result.replayManifest.candidateSetHash });
      const output = result.candidates.map(candidate => ({ text: candidate.text, method: 'structured', features: features(candidate) }));
      const legacyResult = legacy.convert(example.text, { level: 2, seed: 'release-evaluation-v1' });
      output.push({ text: legacyResult.text, method: legacyResult.fallback ? 'legacy_abstention' : 'legacy', features: features({ text: legacyResult.text }) });
      // Control labels are experiment conditions, not claims that humans have judged them.
      const controls = [ { text: example.text, method: 'plain' }, { text: `${example.text} それほどでもない。確定的に明らか。`, method: 'pasted_quotes' }, { text: `${example.text} 説明書にも説明書が必要だ。`, method: 'ordinary_joke_control' }, { text: `${example.text} 逆さの意味が意味して椅子する。`, method: 'incoherent_control' } ];
      output.push(...controls.map(control => ({ ...control, features: features(control) })));
      comparisons.push(...blindPairs(example.text, output, example.group, example.split));
    }
    const performanceRows = [];
    for (const size of [500, 5000]) {
      const source = [...'担当者が状況を確認した。'.repeat(500)].slice(0, size).join(''), times = [];
      for (let run = 0; run < 5; run++) { const start = performance.now(), analysis = await python.analyze(source); generate({ source, task: 'rewrite', contextMode: 'faithful', noveltyMode: 'invent', intensity: 2, series: 'all', backend: 'structured', clientRevision: 0, seed: 'benchmark' }, analysis, assets); times.push(performance.now() - start); }
      performanceRows.push({ size, runs: times, p95: [...times].sort((a, b) => a - b)[Math.ceil(times.length * .95) - 1], sampleCount: times.length });
    }
    const report = { schemaVersion: 1, featureVersion, splitStatus: 'pilot-engineering-cases-not-corpus-heldout', datasetId: assets.datasetId, coldStartupMs, records, performance: performanceRows, nodeMemory: process.memoryUsage(), usefulSupplyRate: records.filter(row => row.candidates > 0).length / records.length,
      creativeYield: null, humanPreference: null, S: 'untrained', Q: 'untrained', releaseQualityGate: 'HUMAN_EVALUATION_REQUIRED', limitations: ['Five warm samples are a smoke measurement, not a statistically stable p95.', 'Literal facts with experimental analogy; general semantic paraphrase is not validated.', 'No clean-machine or cross-platform certification.'], optionalModels: { embedding: 'not_adopted_without_measured_benefit', model: 'disabled_pending_comparison', SFT: 'not_justified_without_human_labels' } };
    fs.writeFileSync('artifacts/v1-evaluation/report.json', JSON.stringify(report, null, 2));
    fs.writeFileSync('artifacts/v1-evaluation/comparisons-private.json', JSON.stringify({ comparisons, preferences: [] }, null, 2));
    fs.writeFileSync('artifacts/v1-evaluation/comparisons-blind.json', JSON.stringify(comparisons.map(({ private: _private, ...pair }) => pair), null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { python.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
