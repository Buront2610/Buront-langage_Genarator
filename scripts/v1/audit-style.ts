import fs from 'node:fs';
import path from 'node:path';
import { hash } from '../../packages/core/source';
import { compileAssets } from '../../packages/core/assets';
import { generate } from '../../packages/core/engine';
import { rhetoricalCore, similarity } from '../../packages/core/evaluation';
import { PythonClient } from '../../packages/runtime/python-client';
import { verifyGeneratedResult } from '../../packages/runtime/semantic-verification';
import { StyleVectorAudit, mean, auc, vectorVersion, type Reference, type VectorView } from '../../packages/evaluation/style-vector';
import type { ReviewItem, ReviewPack } from '../../packages/evaluation/review-types';

const sources = [
  '今日は寒い。', '田中が佐藤を助けた。', '田中がAを復旧した。', 'Bは停止中だ。',
  '私は明日確認する。', '田中は佐藤を助けなかった。', '担当者が100件の記録を確認した。',
  '田中がAを復旧した。Bは停止中で、私は明日確認する。',
  '今日は雨が降っている。', '会議が長くて疲れた。', '念のため資料を何度も見直したので提出が遅れた。',
  '田中が確認したと佐藤が言った。',
];
const seed = 'vector-review-20260921-v1';
function createReviewPack(report: any): ReviewPack {
  const items: ReviewItem[] = report.rows.map((row: any, i: number) => {
    const chosen = row.generated[i % Math.max(1, row.generated.length)] ?? { method: 'abstention', text: row.fallback?.text ?? row.source, vector: row.controls.find((item: any) => item.method === 'plain').vector };
    const rival = row.controls[i % row.controls.length], reverse = parseInt(hash(`${seed}:${i}`).slice(0, 8), 16) % 2 === 1;
    const pair = reverse ? [rival, chosen] : [chosen, rival];
    return { id: `pair-${i + 1}`, source: row.source, left: pair[0].text, right: pair[1].text,
      private: { methods: pair.map(item => item.method), vectors: pair.map(item => item.vector), group: hash(row.source), split: 'pilot', candidateSetHash: row.candidateSetHash } };
  });
  for (const index of [1, 4]) {
    const original = items[index];
    items.push({ ...original, id: `repeat-${index}`, left: original.right, right: original.left,
      private: { ...original.private, methods: [...original.private.methods as string[]].reverse(), vectors: [...original.private.vectors as unknown[]].reverse(), repeatOf: original.id, reversed: true } });
  }
  const body = { schemaVersion: 1 as const, title: '生成文体の人間チェック', engineHash: report.engineHash, datasetId: report.datasetId, vectorReportHash: hash(report), items,
    manifest: { seed, split: 'pilot', selection: 'round-robin-with-failures-not-score-selected', sourceHash: hash(report.rows.map((row: any) => row.source)), repeats: 2, humanLabels: 0 } };
  return { ...body, batchId: hash(body) };
}
function writePack(out: string, report: any) {
  const pack = createReviewPack(report), temporary = path.join(out, 'review-pack.tmp.json');
  fs.writeFileSync(temporary, JSON.stringify(pack, null, 2)); fs.renameSync(temporary, path.join(out, 'review-pack.json')); return pack;
}
function controls(source: string) {
  return [
    { method: 'plain', text: source },
    { method: 'pasted_quotes', text: `${source}\nおいィ？確定的に明らか。それほどでもない。` },
    { method: 'ordinary_explanation', text: `${source}\nこの状況を理解するには、出来事とその評価を分けて考える必要があります。ある性質が優れているという説明だけでは、別の性質についても優れているとは限りません。判断の尺度を混同しないことが重要です。` },
    { method: 'other_internet_register', text: `${source}\nこれマジ？さすがに草。いやもうどうしてこうなったｗ　想像の斜め上すぎて笑うしかない件。` },
    { method: 'incoherent', text: `${source}\n意味の青さが昨日の未来を食べた。説明の右側が椅子しているので、結論だけが三角になったんだが？` },
  ];
}
async function main() {
  const out = path.resolve('artifacts/vector-style-audit'); fs.mkdirSync(out, { recursive: true });
  if (process.argv.includes('--review-only')) {
    const report = JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8'));
    const previous = JSON.parse(fs.readFileSync(path.join(out, 'review-pack.json'), 'utf8'));
    const assets = compileAssets();
    if (hash(report) !== previous.vectorReportHash || report.datasetId !== assets.datasetId || report.engineHash !== assets.manifest.engine.sourceHash || hash(report.frozen) !== hash(JSON.parse(fs.readFileSync(path.join(out, 'reference-split.json'), 'utf8')))) throw new Error('STALE_AUDIT_OUTPUTS');
    const pack = writePack(out, report); console.log(JSON.stringify({ batchId: pack.batchId, reviewPairs: pack.items.length, reusedFrozenReport: hash(report) })); return;
  }
  const corpus = JSON.parse(fs.readFileSync('data/log-corpus.json', 'utf8'));
  const posts = new Map<string, any>(corpus.posts.map((post: any) => [post.id, post]));
  const perPost = new Map<string, number>(), perThread = new Map<string, number>();
  const pool: Reference[] = corpus.sentences.filter((row: any) => [...row.text].length >= 16 && [...row.text].length <= 180 && !/https?:|>>/u.test(row.text))
    .sort((a: any, b: any) => hash(seed + a.id).localeCompare(hash(seed + b.id))).flatMap((row: any) => {
      const thread = posts.get(row.postId)?.threadUrl ?? row.postId;
      if ((perPost.get(row.postId) ?? 0) >= 2 || (perThread.get(thread) ?? 0) >= 12) return [];
      perPost.set(row.postId, (perPost.get(row.postId) ?? 0) + 1); perThread.set(thread, (perThread.get(thread) ?? 0) + 1);
      return [{ id: row.id, text: row.text, thread, postId: row.postId }];
    }).slice(0, 700);
  const train = pool.filter(row => parseInt(hash(row.thread).slice(0, 8), 16) % 10 < 7);
  const proposedHeldout = pool.filter(row => !train.includes(row));
  const heldout = proposedHeldout.filter(row => !train.some(other => similarity(row.text, other.text) >= .8));
  if (train.length < 30 || heldout.length < 20) throw new Error('INSUFFICIENT_REFERENCE_SPLIT');
  const views: VectorView[] = ['raw', 'script_masked', 'phrase_masked'];
  const models = Object.fromEntries(views.map(view => [view, new StyleVectorAudit(train, view)])) as Record<VectorView, StyleVectorAudit>;
  const measure = (text: string) => Object.fromEntries(views.map(view => [view, models[view].measure(text)]));
  // The split and vector vocabularies are frozen before generating any output.
  const frozen = { vectorVersion, seed, trainIds: train.map(row => row.id), heldoutIds: heldout.map(row => row.id), nearDuplicatesExcluded: proposedHeldout.length - heldout.length,
    models: Object.fromEntries(views.map(view => [view, { id: models[view].modelId, dimensions: models[view].vocabulary.size }])) };
  fs.writeFileSync(path.join(out, 'reference-split.json'), JSON.stringify(frozen, null, 2));
  const assets = compileAssets(), python = new PythonClient(), rows: any[] = [];
  try {
    await python.start();
    for (const [i, source] of sources.entries()) {
      const request = { source, task: 'rewrite' as const, contextMode: 'full' as const, noveltyMode: 'invent' as const, intensity: 2 as const, series: 'all' as const, backend: 'structured' as const, clientRevision: 0, seed: `${seed}:${i}` };
      const analysis = await python.analyze(source), result = await verifyGeneratedResult(generate(request, analysis, assets), python, analysis);
      const generated = result.candidates.map(candidate => ({ method: 'current_generator', text: candidate.text, core: rhetoricalCore(candidate), candidateId: candidate.id,
        operator: candidate.plan.mainOperator, relation: candidate.plan.rhetoric?.relation,
        conclusion: rhetoricalCore(candidate).split('。')[candidate.plan.rhetoric?.discourse === 'criterion_first' ? 0 : 1],
        expansionRatio: [...candidate.text].length / Math.max(1, [...source].length),
        vector: measure(candidate.text), coreVector: measure(rhetoricalCore(candidate)), scores: candidate.scores,
        primaryCopyFraction: candidate.plan.nodes.filter(node => node.type === 'FactClause' && node.sourceSpan).reduce((sum, node) => sum + (node.text === [...source].slice(node.sourceSpan!.start, node.sourceSpan!.end).join('') ? [...node.text].length : 0), 0) / Math.max(1, [...source].length) }));
      const control = controls(source).map(item => ({ ...item, vector: measure(item.text) }));
      const row = { source, request, generated, controls: control, fallback: result.fallback, candidateSetHash: result.replayManifest.candidateSetHash };
      rows.push(row);
      console.error(`audit ${i + 1}/${sources.length}: ${generated.length} candidates`);
    }
  } finally { python.close(); }
  const allGenerated = rows.flatMap(row => row.generated), summary: any = {};
  for (const view of views) {
    const reference = heldout.map(row => models[view].measure(row.text).cosine).filter((value): value is number => value !== null);
    const controlsByType = Object.fromEntries(controls('').map(({ method }) => {
      const values = rows.map(row => row.controls.find((item: any) => item.method === method).vector[view].cosine).filter((value: any) => value !== null);
      return [method, { meanCosine: mean(values), heldoutReferenceAuc: auc(reference, values) }];
    }));
    summary[view] = { heldoutReferenceMean: mean(reference), generatedMean: mean(allGenerated.map(item => item.vector[view].cosine).filter((value: any) => value !== null)),
      generatedCoreMean: mean(allGenerated.map(item => item.coreVector[view].cosine).filter((value: any) => value !== null)), controls: controlsByType,
      generatedAbovePastedFraction: mean(rows.filter(row => row.generated.length).map(row => {
        const pasted = row.controls.find((item: any) => item.method === 'pasted_quotes').vector[view].cosine;
        return mean(row.generated.map((item: any) => item.vector[view].cosine > pasted ? 1 : 0))!;
      })) };
  }
  const probes = [
    ['田中の装備は重いんだが、佐藤の盾は軽いだろう。', '鈴木の資料は重いんだが、山田の箱は軽いだろう。'],
    ['まことの装備は重いんだが。', 'ゆうこの資料は重いんだが。'],
  ].map(([a, b]) => ({ a, b, measurements: [measure(a), measure(b)] }));
  const conclusions = new Map<string, number>();
  for (const item of allGenerated) conclusions.set(item.conclusion, (conclusions.get(item.conclusion) ?? 0) + 1);
  const report = { schemaVersion: 1, vectorVersion, engineHash: assets.manifest.engine.sourceHash, datasetId: assets.datasetId, frozen,
    referenceCount: train.length, heldoutCount: heldout.length, caseCount: rows.length, generatedCaseCount: rows.filter(row => row.generated.length).length,
    humanLabels: 0, styleConfirmed: false, selectionUsesTrainedStyle: !!assets.evaluators?.S, summary, probes, rows,
    generationAudit: { outputs: allGenerated.length, meanPrimaryCopyFraction: mean(allGenerated.map(item => item.primaryCopyFraction)), meanExpansionRatio: mean(allGenerated.map(item => item.expansionRatio)), uniqueConclusions: conclusions.size,
      reusedConclusions: [...conclusions].filter(([, count]) => count > 1).map(([text, count]) => ({ text, count })) },
    limitations: ['Cosine measures corpus resemblance, not probability of Buront style or human preference.', 'Original-log provenance is not a positive quality label for every sentence.', 'Script masking is not full topic/POS masking; hiragana content words survive.', 'Reference vectors hold out threads and near-duplicates; the production generator has access to the complete corpus. This is not a held-out generator generalization test.', 'Controls are authored experiment conditions, not human-rated negatives.', 'All review cases remain pilot; no automatic training or release approval.'],
    humanReviewRequired: true };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  const pack = writePack(out, report);
  console.log(JSON.stringify({ batchId: pack.batchId, cases: rows.length, generatedCases: report.generatedCaseCount, reviewPairs: pack.items.length, summary, styleConfirmed: false }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
