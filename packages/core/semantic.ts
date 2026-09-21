import type { Analysis, Candidate, Check, DocumentIR, Fact, GenerationRequest, GenerationResult } from '../contracts';
import { extractFacts } from './facts';
import { hash, slice, sourceDocument } from './source';
import { validateRewrite } from './rewrite-validation';
import { verification } from './validator';

export const semanticVersion = 'independent-factual-reparse-v2';
const sorted = (items: unknown[]) => items.map(item => JSON.stringify(item)).sort();
const roles = (fact: Fact) => [fact.predicateLemma, sorted(fact.arguments.map(argument => [argument.role, argument.text]))];
const values = (ir: DocumentIR) => ir.source.protectedValues.map(value => [value.kind, value.raw, value.role, value.comparator ?? null]);

// These comparisons use two independently parsed texts. No generated fact ID,
// node label, or declared intent is accepted as evidence for semantic equality.
// Parser agreement is supplementary and never authorizes a free paraphrase.
export function compareSemantics(source: DocumentIR, output: DocumentIR): Check[] {
  const make = (code: string, left: unknown, right: unknown, uncertain: boolean, description: string): Check => ({
    code: `S-${code}`, status: uncertain ? 'unknown' : hash(left) === hash(right) ? 'pass' : 'fail',
    required: !uncertain, explanation: `${description}。${uncertain ? '解析に不確実性があり、同値とは判定しない。限定変換の照合結果を別途確認。' : '原文と事実節を別々に解析して照合。'}`,
    factIds: source.facts.map(fact => fact.id), checkerVersion: semanticVersion,
  });
  const facts = [...source.facts, ...output.facts];
  const uncertain = !source.facts.length || !output.facts.length;
  const signature = (ir: DocumentIR, field: (fact: Fact, ir: DocumentIR) => unknown) => sorted(ir.facts.map(fact => [roles(fact), field(fact, ir)]));
  const predicates = (ir: DocumentIR) => sorted(ir.facts.map(fact => fact.predicateLemma));
  // Unknown is local to one field of one event. It cannot hide a known mismatch.
  const group = (ir: DocumentIR) => {
    const groups = new Map<string, Fact[]>();
    for (const fact of ir.facts) { const key = hash(roles(fact)); groups.set(key, [...(groups.get(key) ?? []), fact]); }
    return groups;
  };
  const leftGroups = group(source), rightGroups = group(output);
  let temporalUnknown = uncertain, temporalMismatch = false;
  const uncertainIds = new Set<string>(), mismatchIds = new Set<string>();
  for (const key of new Set([...leftGroups.keys(), ...rightGroups.keys()])) {
    const left = leftGroups.get(key) ?? [], right = rightGroups.get(key) ?? [];
    if (left.length !== right.length) { temporalUnknown = true; continue; }
    left.forEach((fact, i) => {
      for (const field of ['tense', 'realization', 'completion'] as const) {
        if (fact[field] === 'unknown' || right[i][field] === 'unknown') { temporalUnknown = true; uncertainIds.add(fact.id); }
        else if (fact[field] !== right[i][field]) { temporalMismatch = true; mismatchIds.add(fact.id); }
      }
    });
  }
  const attribution = (fact: Fact, ir: DocumentIR) => [fact.attribution.kind, ir.entities.find(entity => entity.id === fact.attribution.speaker)?.text ?? null];
  const relations = (ir: DocumentIR) => sorted(ir.relations.map(relation => [relation.type, roles(ir.facts.find(fact => fact.id === relation.from)!), roles(ir.facts.find(fact => fact.id === relation.to)!)]));
  temporalMismatch ||= hash(source.times.map(time => time.text)) !== hash(output.times.map(time => time.text)) || hash(relations(source)) !== hash(relations(output));
  const temporalCheck: Check = { code: 'S-temporal', status: temporalMismatch ? 'fail' : temporalUnknown ? 'unknown' : 'pass', required: temporalMismatch || !temporalUnknown,
    explanation: `出来事・時制・予定・完了を個別照合。既知の不一致: ${[...mismatchIds].join(', ') || (temporalMismatch ? '時点/関係' : 'なし')}。不確実な出来事: ${[...uncertainIds].join(', ') || (temporalUnknown ? '対応付け' : 'なし')}。`, factIds: [...new Set([...mismatchIds, ...uncertainIds])], checkerVersion: semanticVersion };
  return [
    make('quantity', values(source), values(output), false, '保護値の原値・単位・符号・出現役割'),
    make('coverage', predicates(source), predicates(output), uncertain, '述語の出現数と欠落・追加'),
    make('roles', sorted(source.facts.map(roles)), sorted(output.facts.map(roles)), uncertain || facts.some(fact => fact.voice === 'unknown' || fact.polarity === 'unknown'), '述語ごとの主体・対象・受取手・場所'),
    make('polarity', signature(source, fact => fact.polarity), signature(output, fact => fact.polarity), uncertain || facts.some(fact => fact.polarity === 'unknown'), '主体と述語に結び付いた否定'),
    temporalCheck,
    make('attribution', signature(source, attribution), signature(output, attribution), uncertain, '引用・伝聞の話者と主張主体'),
  ];
}
export function factualPair(result: GenerationResult, candidate: Candidate) {
  const nodes = candidate.plan.nodes.filter(node => node.type === 'FactClause').sort((a, b) => a.sourceSpan!.start - b.sourceSpan!.start);
  return { source: nodes.map(node => slice(result.ir.source.raw, node.sourceSpan!)).join(''), output: nodes.map(node => node.text).join('') };
}
export function semanticTexts(result: GenerationResult): string[] {
  return [...new Set([...result.candidates, ...result.reviewCandidates].flatMap(candidate => { if (candidate.plan.rewrite) return []; const pair = factualPair(result, candidate); return pair.source === pair.output ? [] : [pair.source, pair.output]; }))];
}
export function finishSemanticVerification(result: GenerationResult, analyses: Record<string, Analysis>): GenerationResult {
  const irs = new Map<string, DocumentIR>();
  const irFor = (text: string) => {
    let ir = irs.get(text);
    if (!ir) {
      const analysis = analyses[hash(text)]; if (!analysis) throw new Error('SEMANTIC_ANALYSIS_REQUIRED');
      const request: GenerationRequest = { ...(result.replayManifest.request as GenerationRequest), source: text, task: 'rewrite', focusSpans: [] };
      ir = extractFacts(sourceDocument(text), analysis, request); irs.set(text, ir);
    }
    return ir;
  };
  const candidates = [...result.candidates, ...result.reviewCandidates];
  for (const candidate of candidates) {
    const pair = factualPair(result, candidate);
    const checks: Check[] = candidate.plan.rewrite ? [{ code: 'S-bounded-rewrite', status: validateRewrite(result.ir, candidate.plan, new Map(candidate.evidence.map(item => [item.id, item.text]))) ? 'pass' : 'fail', required: true, explanation: '有限の本文変換を原文・適用条件・出典から再照合。自由な意味同値性の判定や、変換後全文の構文解析による一致判定ではない。', factIds: candidate.plan.nodes.flatMap(node => node.factIds), checkerVersion: 'bounded-body-rewrite-v1' }] : pair.source === pair.output ? [{ code: 'S-literal', status: 'pass', required: true, explanation: '事実節を原文順に戻して全文一致を確認。変更がないため再解析を省略。', factIds: candidate.plan.nodes.flatMap(node => node.factIds), checkerVersion: semanticVersion }] : compareSemantics(irFor(pair.source), irFor(pair.output));
    candidate.checks = [...candidate.checks.filter(check => !check.code.startsWith('S-')), ...checks];
    candidate.verificationStatus = verification(candidate.checks);
    if (candidate.checks.some(check => check.required && check.status === 'fail')) candidate.scores.C = 0;
    candidate.verificationScope = candidate.plan.rewrite ? '原文範囲・保護値・引用の保持と、出典付き有限変換の適用条件を検査。自然さ・文体の良さは未評価。' : '原文の保持・限定した丁寧形変換・構成と出典の照合。変更した事実節は別途再解析（任意の言い換えの意味同値性や修辞の品質は未保証）。';
  }
  result.candidates = result.candidates.filter(candidate => candidate.verificationStatus === 'passed');
  result.reviewCandidates = candidates.filter(candidate => candidate.verificationStatus === 'needs_review').slice(0, 3);
  result.selectedCandidateId = result.candidates[0]?.id ?? null;
  result.shortfallReason = result.candidates.length === 3 ? null : result.candidates.length ? 'candidate_shortage' : result.shortfallReason ?? 'no_valid_candidate';
  result.fallback = result.candidates.length ? null : { text: result.ir.source.raw, reason: result.shortfallReason! };
  result.replayManifest.semanticVerification = { version: semanticVersion, selectionHash: hash(candidates.map(candidate => ({ id: candidate.id, checks: candidate.checks, status: candidate.verificationStatus }))) };
  return result;
}
