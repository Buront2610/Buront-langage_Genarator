import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { compileAssets } from '../../packages/core/assets';
import { generate } from '../../packages/core/engine';
import { extractFacts } from '../../packages/core/facts';
import { sourceDocument } from '../../packages/core/source';
import { compareSemantics } from '../../packages/core/semantic';
import { PythonClient } from '../../packages/runtime/python-client';
import { verifyGeneratedResult } from '../../packages/runtime/semantic-verification';
import type { GenerationRequest } from '../../packages/contracts';

async function main() {
  const python = new PythonClient(), assets = compileAssets();
  const request = (source: string, series = 'all'): GenerationRequest => ({ source, series: series as GenerationRequest['series'], task: 'rewrite', contextMode: 'full', noveltyMode: 'invent', intensity: 2, backend: 'structured', clientRevision: 1, seed: 'planning-evaluation-v2' });
  const directory = 'artifacts/v1-evaluation-experimental.2'; fs.mkdirSync(directory, { recursive: true });
  try {
    await python.start();
    const series = [];
    for (const profile of assets.seriesProfiles ?? []) {
      const input = request('今日は寒い。', profile.id), analysis = await python.analyze(input.source), result = await verifyGeneratedResult(generate(input, analysis, assets), python, analysis);
      series.push({ id: profile.id, originalPosts: profile.originalPosts, attestedConstructions: profile.constructions.map(item => ({ id: item.id, posts: item.support })), candidates: result.candidates.length, usedConstructions: result.candidates.map(candidate => candidate.plan.surface?.constructionId), withinSeries: result.candidates.every(candidate => candidate.plan.evidenceIds.every(id => profile.id === 'all' || assets.evidence.find(item => item.id === id)?.series.includes(profile.id))) });
    }
    const counterexamples = [];
    for (const row of JSON.parse(fs.readFileSync('test/fixtures/design-counterexamples.json', 'utf8'))) {
      const parse = async (text: string) => extractFacts(sourceDocument(text), await python.analyze(text), request(text));
      const checks = compareSemantics(await parse(row.source), await parse(row.candidate));
      counterexamples.push({ id: row.id, failed: checks.filter(check => check.status === 'fail').map(check => check.code), unknown: checks.filter(check => check.status === 'unknown').map(check => check.code) });
    }
    const performanceRows = [];
    for (const size of [500, 5000]) {
      const source = [...'担当者が状況を確認しました。'.repeat(500)].slice(0, size).join('');
      const start = performance.now(), analysis = await python.analyze(source);
      const result = await verifyGeneratedResult(generate(request(source), analysis, assets), python, analysis);
      performanceRows.push({ sourceScalars: size, milliseconds: performance.now() - start, candidates: result.candidates.length, reanalysis: result.candidates.some(candidate => candidate.checks.some(check => check.code === 'S-roles')) });
    }
    const input = JSON.parse(fs.readFileSync('examples/document-request.json', 'utf8')), analysis = await python.analyze(input.source);
    const example = await verifyGeneratedResult(generate(input, analysis, assets), python, analysis);
    fs.writeFileSync(`${directory}/document-result.json`, JSON.stringify(example, null, 2));
    const report = { schemaVersion: 1, packageVersion: JSON.parse(fs.readFileSync('package.json', 'utf8')).version, engine: assets.manifest.engine, datasetId: assets.datasetId, parserVersion: analysis.parserVersion, series, counterexamples, performance: performanceRows, nodeMemory: process.memoryUsage(), humanQuality: null, limitations: ['One observation per length; neither a p95 nor a stable speed guarantee.', 'Fixed ten-counterexample rejection does not establish general semantic equivalence.', 'Series frames are corpus-attested experimental generalizations; no human style acceptance.', 'Parser agreement supplements the finite preservation proof and does not permit free factual paraphrases.'] };
    fs.writeFileSync(`${directory}/report.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { python.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
