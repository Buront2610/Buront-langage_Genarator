'use strict';
// Read-only behavioral audit. This does not change generation or mark findings fixed.
const fs = require('node:fs');
const { PythonClient } = require('../dist/packages/runtime/python-client');
const { compileAssets, retrievalFor } = require('../dist/packages/core/assets');
const { generate } = require('../dist/packages/core/engine');
const { makePlans } = require('../dist/packages/core/creation');
const { sourceDocument, hash } = require('../dist/packages/core/source');
const { extractFacts } = require('../dist/packages/core/facts');
const { realize, validateCandidate, verification } = require('../dist/packages/core/validator');
const { rhetoricalCore, evaluateNovelty, structure } = require('../dist/packages/core/evaluation');
const { frameRhetoric } = require('../dist/packages/core/series');
const { compareSemantics, finishSemanticVerification } = require('../dist/packages/core/semantic');
const { applyDictionary } = require('../dist/packages/core/dictionary');
const request = (source, extra = {}) => ({ source, task: 'rewrite', contextMode: 'faithful', noveltyMode: 'invent', intensity: 2, series: 'all', backend: 'structured', clientRevision: 1, seed: 'independent-depth-audit', ...extra });

async function main() {
  const python = new PythonClient(), assets = compileAssets(), cache = new Map();
  const analysisFor = async source => { if (!cache.has(source)) cache.set(source, await python.analyze(source)); return cache.get(source); };
  const irFor = async source => extractFacts(sourceDocument(source), await analysisFor(source), request(source));
  const references = new Map(assets.evidence.map(item => [item.id, item.text])), ids = new Set(references.keys());
  const check = (ir, plan, allowed) => { const result = realize(plan, ir); return validateCandidate(ir, plan, result.text, result.spans, ids, allowed, references, assets.seriesProfiles); };
  try {
    await python.start();
    const roleSources = ['田中が佐藤を助けた。', '佐藤が田中を助けた。'];
    const rolePlans = [];
    for (const source of roleSources) { const ir = await irFor(source); rolePlans.push({ source, facts: ir.facts, plans: makePlans(ir, request(source), assets) }); }
    const roleCore = rolePlans.map(row => row.plans.map(plan => rhetoricalCore({ plan })));
    const roleSensitivity = { sources: roleSources, plans: roleCore[0].length, identicalRhetoricCores: roleCore[0].filter((core, i) => core === roleCore[1][i]).length, examples: roleCore[0].slice(0, 4), factualArguments: rolePlans.map(row => row.facts.map(fact => fact.arguments)), note: 'The copied factual text differs correctly; this isolates the creative part only.' };

    const coldRequest = request('今日は寒い。'), coldAnalysis = await analysisFor(coldRequest.source), baseline = generate(coldRequest, coldAnalysis, assets);
    const dictionaryRequest = request(coldRequest.source, { customRules: [{ id: 'cold-synonym', from: '寒さ', to: '冷え込み', priority: 0 }] });
    const dictionaryResult = generate(dictionaryRequest, coldAnalysis, assets);
    const dictionaryPlans = makePlans(baseline.ir, dictionaryRequest, assets), originalRhetoric = new Set(dictionaryPlans.flatMap(plan => plan.nodes.filter(node => node.type === 'RhetoricalClause').map(node => node.text)));
    const dictionaryDiagnostics = dictionaryPlans.map(original => {
      const plan = structuredClone(original);
      for (const node of plan.nodes.filter(node => node.type === 'RhetoricalClause')) node.text = applyDictionary(node.text, dictionaryRequest.customRules, [], 12000).text;
      const checks = check(baseline.ir, plan, originalRhetoric);
      return { operator: plan.mainOperator, status: verification(checks), failed: checks.filter(row => row.status === 'fail').map(row => row.code) };
    });
    const dictionary = { originalCandidates: baseline.candidates.length, editedCandidates: dictionaryResult.candidates.length, editedReviewCandidates: dictionaryResult.reviewCandidates.length, fallback: dictionaryResult.fallback, diagnostics: dictionaryDiagnostics };

    const plan = structuredClone(rolePlans[0].plans[0]);
    plan.surface.coreText = '実際には佐藤が田中を助けた。';
    plan.nodes.find(node => node.id === 'main-quote').text = frameRhetoric(plan.surface.coreText, plan.surface.constructionId);
    const candidateChecks = check(await irFor(roleSources[0]), plan, new Set(plan.nodes.filter(node => node.type === 'RhetoricalClause').map(node => node.text)));
    const forgedCandidate = { ...structuredClone(baseline.candidates[0]), plan, ...realize(plan, await irFor(roleSources[0])), checks: candidateChecks, verificationStatus: verification(candidateChecks) };
    const forgedResult = { ...structuredClone(baseline), ir: await irFor(roleSources[0]), candidates: [forgedCandidate], reviewCandidates: [] };
    const finalForged = finishSemanticVerification(forgedResult, {});
    const compilerTrust = { probeType: 'white-box simulated compiler regression; not an API plan-injection claim', output: forgedCandidate.text, status: candidateChecks.map(row => ({ code: row.code, status: row.status })), finalSelected: !!finalForged.selectedCandidateId, semanticCodes: forgedCandidate.checks.filter(row => row.code.startsWith('S-')).map(row => row.code) };

    const temporalSource = '田中が確認しなかった。今日は寒い。', temporalOutput = '田中が確認しない。今日は寒い。';
    const temporalChecks = compareSemantics(await irFor(temporalSource), await irFor(temporalOutput));
    const temporal = { source: temporalSource, output: temporalOutput, checks: temporalChecks, supplementalOnlyStatus: verification(temporalChecks), note: 'Normal literal/finite-transform verification still rejects this free factual edit. This probes the claimed independent checker, not a production bypass.' };

    const series = assets.seriesProfiles.map(profile => ({ id: profile.id, topFrames: profile.constructions.slice(0, 3).map(frame => frame.id) }));
    const featurePairs = JSON.parse(fs.readFileSync('artifacts/v1-evaluation/comparisons-private.json', 'utf8')).comparisons;
    const sides = featurePairs.flatMap(pair => pair.private.features.map((features, i) => ({ method: pair.private.methods[i], count: Object.keys(features).length, predicted: Object.keys(features).length > 1 ? 'structured' : 'control' })));
    const featureLeak = { sides: sides.length, simpleFeaturePresenceCorrect: sides.filter(side => (side.method === 'structured' ? 'structured' : 'control') === side.predicted).length, structuredFeatureCounts: [...new Set(sides.filter(side => side.method === 'structured').map(side => side.count))], controlFeatureCounts: [...new Set(sides.filter(side => side.method !== 'structured').map(side => side.count))], inputSyntaxIdenticalAcrossPlans: new Set(rolePlans[0].plans.map(plan => hash(plan.linguisticFeatures))).size === 1 };

    const mixedSource = '田中がAを復旧した。Bは停止中で、私は明日確認する。', mixedIR = await irFor(mixedSource);
    const mixedPlans = makePlans(mixedIR, request(mixedSource, { contextMode: 'full' }), assets);
    const mixed = { source: mixedSource, facts: mixedIR.facts.map(fact => ({ id: fact.id, predicate: fact.predicateLemma, completion: fact.completion, realization: fact.realization })), narrative: mixedPlans[0].narrative };

    const novelProbes = ['白銀の木の塊', '白銀の木の塊で出来ている暗黒', '白銀の木の塊で出来ている暗黒が紙装備のジョブに遅れをとるはずは無い'];
    const novelty = novelProbes.map(core => {
      const candidate = structuredClone(baseline.candidates[0]); candidate.plan.surface.coreText = core;
      candidate.plan.nodes.find(node => node.id === 'main-quote').text = frameRhetoric(core, candidate.plan.surface.constructionId);
      return { core, structure: structure(core), result: evaluateNovelty(candidate, assets, retrievalFor(assets), []) };
    });
    const scores = { selected: baseline.candidates.map(candidate => ({ id: candidate.id, scores: candidate.scores, novelty: candidate.novelty.classification })), evaluator: baseline.replayManifest.evaluator };
    const report = { schemaVersion: 1, build: assets.manifest.engine, datasetId: assets.datasetId, roleSensitivity, dictionary, compilerTrust, temporal, series, featureLeak, mixed, novelty, scores };
    fs.writeFileSync('artifacts/implementation-depth-audit.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ report: 'artifacts/implementation-depth-audit.json', roleSensitivity, dictionary, compilerTrust, temporal: { status: temporal.supplementalOnlyStatus, checks: temporalChecks.map(row => ({ code: row.code, status: row.status, required: row.required })) }, featureLeak, mixed, novelty, scores }, null, 2));
  } finally { python.close(); }
}
// Preserve the experimental.2 audit artifact. Current versions write a new report.
if (require('../package.json').version === '1.0.0-experimental.2') main().catch(error => { console.error(error); process.exitCode = 1; });
else require('./evaluate-audit-fixes.cjs');
