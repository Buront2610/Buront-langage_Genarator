import type { Candidate, Novelty, DocumentIR, QuotePlan } from '../contracts';
import { Assets, Retrieval } from './assets';
import { hash } from './source';
import { frameRhetoric } from './series';
import { validateRewrite } from './rewrite-validation';
import { validateRhetoric } from './rhetoric-validation';
import { outputFeatures, featureVersion } from './output-features';
export { featureVersion, outputFeatures } from './output-features';
export type HistoryEntry = { text: string; rhetoric: string; family: string; mapping: string; task: string; series: string; mode: string };
export const grams = (text: string, n = 3) => { const chars = [...text.normalize('NFKC').replace(/[\s。、！？!?「」『』]/gu, '')]; return new Set(chars.slice(0, Math.max(1, chars.length - n + 1)).map((_, i) => chars.slice(i, i + n).join(''))); };
export function similarity(a: string, b: string) { const left = grams(a), right = grams(b); return 2 * [...left].filter(item => right.has(item)).length / Math.max(1, left.size + right.size); }
export const structure = (text: string) => text.normalize('NFKC').replace(/[+\-]?\d+(?:\.\d+)?/gu, '<NUM>').replace(/[\p{Script=Han}\p{Script=Katakana}ー]+/gu, '<TERM>').replace(/<TERM>(?:<TERM>)+/gu, '<TERM>');
export function rhetoricalCore(candidate: Pick<Candidate, 'plan'>): string {
  if (candidate.plan.rewrite) return candidate.plan.nodes.map(node => node.text).join('');
  const surface = candidate.plan.surface, main = candidate.plan.nodes.find(node => node.id === 'main-quote');
  try { if (surface && main?.text === frameRhetoric(surface.coreText, surface.constructionId)) return surface.coreText; } catch { /* Unknown frames cannot supply a trusted novelty core. */ }
  return candidate.plan.nodes.filter(node => node.type === 'RhetoricalClause').map(node => node.text).join('').replace(/^たとえるなら[、,]/u, '');
}
export function evaluateNovelty(candidate: Candidate, assets: Assets, retrieval: Retrieval, history: HistoryEntry[]): Novelty {
  const rhetoric = rhetoricalCore(candidate);
  const near = retrieval.search(rhetoric, 'all', 'novelty', 30);
  const records = [...near.map(item => ({ id: item.id, text: item.text })), ...history.map((item, i) => ({ id: `history-${i}`, text: item.rhetoric }))];
  const comparisons = records.map(item => ({ ...item, textScore: similarity(rhetoric, item.text), structureScore: similarity(structure(rhetoric), structure(item.text)) }));
  const maxText = Math.max(0, ...comparisons.map(item => item.textScore));
  const maxStructure = Math.max(0, ...comparisons.map(item => item.structureScore));
  const concept = history.length ? history.some(item => item.family === candidate.plan.family && item.mapping === hash(candidate.plan.mapping)) ? 1 : 0 : null;
  const exact = records.some(item => item.text.normalize('NFKC').replace(/\s/gu, '') === rhetoric.normalize('NFKC').replace(/\s/gu, ''));
  return { classification: candidate.plan.rewrite ? 'adaptation' : !rhetoric ? 'undetermined' : exact || maxText > 0.95 ? 'known_quote' : maxText > 0.72 || maxStructure > 0.86 || concept === 1 ? 'adaptation' : 'candidate_novel',
    text: 1 - maxText, structure: 1 - maxStructure, concept: concept === null ? null : 1 - concept,
    nearestIds: comparisons.sort((a, b) => Math.max(b.textScore, b.structureScore) - Math.max(a.textScore, a.structureScore)).slice(0, 3).map(item => item.id),
    datasetId: assets.datasetId, historySnapshot: hash(history), window: `${candidate.plan.rewrite ? '出典付き構文の応用。入力語の違いを新作性の根拠にはしない。' : ''}原ログ・語録の近傍30件と保存履歴${history.length}件。概念比較は保存履歴内のみ（原ログの概念注釈は未整備）。世界全体の新規性ではない。` };
}
export const features = (candidate: { text: string }): Record<string, number> => outputFeatures(candidate.text);
export type Evaluator = { schemaVersion: 1; featureVersion: string; dimension: 'S' | 'Q'; coefficients: Record<string, number>; intercept: number; trainingManifest: Record<string, unknown>; personal: boolean };
export function score(candidate: Candidate, evaluator?: Evaluator) {
  if (!evaluator) return null;
  if (evaluator.featureVersion !== featureVersion) throw new Error('EVALUATOR_FEATURE_INCOMPATIBLE');
  const values = features(candidate);
  return Object.entries(evaluator.coefficients).reduce((sum, [name, coefficient]) => sum + (values[name] || 0) * coefficient, evaluator.intercept);
}
export function ruleQuality(ir: DocumentIR, plan: QuotePlan): { C: number | null; R: number } {
  if (plan.rewrite) {
    const valid = validateRewrite(ir, plan), length = [...plan.nodes.map(node => node.text).join('')].length;
    return { C: valid ? 1 : 0, R: valid && length <= Math.max(100, ir.source.scalarToUtf16.length * 2) ? 1 : 0 };
  }
  if (plan.mainOperator === 'QUOTE') return { C: null, R: 1 }; // Related quotation is not proven contextual fit.
  const meaning = validateRhetoric(ir, plan), text = plan.surface?.coreText ?? '';
  const clauses = text.split(/[、。]/u).filter(Boolean);
  // Recoverability and connection are checked by the inverse relation grammar;
  // fluency limits apply to new rhetoric only, not repetitions in source facts.
  const readable = meaning.valid && clauses.length >= 2 && clauses.length <= 9 && clauses.every(clause => [...clause].length <= 100) && !/(.{3,12})\1\1/u.test(text);
  return { C: !meaning.valid ? 0 : meaning.dictionary === 'unknown' ? null : 1, R: readable ? 1 : 0 };
}
export function select(candidates: Candidate[], noveltyMode: string): Candidate[] {
  const eligible = candidates.filter(candidate => candidate.verificationStatus === 'passed' && (candidate.plan.mainOperator === 'QUOTE' || (candidate.scores.C ?? 0) >= 1) && (candidate.scores.R ?? 0) >= 0.5 && (noveltyMode !== 'invent' || candidate.novelty.classification === 'candidate_novel'));
  const bestReadability = Math.max(0, ...eligible.map(candidate => candidate.scores.R ?? 0));
  const usable = eligible.filter(candidate => (candidate.scores.R ?? 0) >= bestReadability - 0.15);
  const dominates = (a: Candidate, b: Candidate) => {
    const dimensions = (['S', 'Q'] as const).filter(d => a.scores[d] !== null && b.scores[d] !== null);
    return dimensions.length > 0 && dimensions.every(d => a.scores[d]! >= b.scores[d]!) && dimensions.some(d => a.scores[d]! > b.scores[d]!);
  };
  // Pareto fronts preserve separate preference dimensions; their uncalibrated
  // magnitudes are never added. Novelty only breaks ties after quality gates.
  const front = new Map<Candidate, number>(); let remaining = [...usable], level = 0;
  while (remaining.length) {
    const current = remaining.filter(candidate => !remaining.some(other => dominates(other, candidate)));
    for (const candidate of current) front.set(candidate, level);
    remaining = remaining.filter(candidate => !current.includes(candidate)); level++;
  }
  // Prefer actual body edits over generic ending-only variants. This is an
  // explicit deterministic presentation rule, not a learned style score.
  const bodyEdits = (candidate: Candidate) => candidate.plan.rewrite?.edits.filter(edit => !edit.ruleId.startsWith('ending-')).length ?? 0;
  usable.sort((a, b) => front.get(a)! - front.get(b)! || (b.scores.R ?? 0) - (a.scores.R ?? 0) || bodyEdits(b) - bodyEdits(a) || (b.novelty.structure ?? 0) - (a.novelty.structure ?? 0) || a.id.localeCompare(b.id));
  const selected: Candidate[] = [], signatures = new Set<string>();
  for (const candidate of usable) {
    const signature = candidate.plan.mainOperator + ':' + candidate.plan.family;
    const rhetoric = rhetoricalCore;
    if (signatures.has(signature) || selected.some(other => similarity(rhetoric(other), rhetoric(candidate)) > 0.92)) continue;
    selected.push(candidate); signatures.add(signature); if (selected.length === 3) break;
  }
  return selected;
}
