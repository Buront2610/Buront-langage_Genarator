import type { DocumentIR, GenerationRequest, QuotePlan, PlanNode } from '../contracts';
import { retrievalFor, type Assets } from './assets';
import { hash, slice } from './source';
import { factualNodes, planIntent, planNarrative } from './planning';
import { frameRhetoric, selectSurface, selectDiscourse } from './series';
import { programFor, relationFor, targetTerms, renderRhetoric, sourceSubject, sourceMapping } from './rhetoric';

export const randomFor = (seed: string, stage: string) => {
  let state = parseInt(hash(`${seed}:${stage}`).slice(0, 8), 16);
  return () => { state += 0x6D2B79F5; let value = Math.imul(state ^ state >>> 15, 1 | state); value ^= value + Math.imul(value ^ value >>> 7, 61 | value); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
};
export function makePlans(ir: DocumentIR, request: GenerationRequest, assets: Assets, experimental = false): QuotePlan[] {
  const intentPlan = planIntent(ir), fact = ir.facts.find(fact => fact.id === intentPlan.targetFacts[0]);
  if (!fact) return [];
  const relation = relationFor(fact); if (!relation) return [];
  const lexical = assets.lexicon.filter(lexeme => targetTerms[relation].includes(lexeme.lemma) && (request.series === 'all' || lexeme.evidenceIds.some(id => assets.evidence.some(item => item.id === id && item.series.includes(request.series)))));
  const profile = assets.seriesProfiles?.find(profile => profile.id === request.series);
  const random = randomFor(request.seed ?? ir.source.inputHash, `relation:${request.series}`);
  const plans: QuotePlan[] = [];
  for (let variant = 0; variant < 3; variant++) for (const operation of assets.operations.filter(operation => experimental || operation.status === 'experimental_enabled')) {
    const lexeme = lexical[Math.floor(random() * lexical.length)]; if (!lexeme) continue;
    const rhetoric = programFor(ir, fact, lexeme.lemma, operation.id); if (!rhetoric) continue;
    Object.assign(rhetoric, selectDiscourse(profile, rhetoric, request.intensity, variant));
    const core = renderRhetoric(ir, rhetoric);
    const surface = selectSurface(profile, core, request.intensity, variant);
    const vocabulary = lexeme.evidenceIds.filter(id => request.series === 'all' || assets.evidence.find(item => item.id === id)?.series.includes(request.series)).slice(0, 2);
    const evidenceIds = [...new Set([...vocabulary, ...surface.evidenceIds, ...rhetoric.discourseEvidenceIds])];
    const narrative = planNarrative(ir, request.contextMode === 'full' ? 'status_order' : 'source_order');
    const nodes: PlanNode[] = factualNodes(ir, narrative);
    nodes.push({ id: 'connector', type: 'Connective', text: '\n', factIds: [], evidenceIds: [] },
      { id: 'main-quote', type: 'RhetoricalClause', text: frameRhetoric(core, surface.constructionId), factIds: [fact.id], evidenceIds, mention: 'rhetorical_reference' });
    if (request.contextMode === 'full') {
      const [quote] = nodes.splice(nodes.findIndex(node => node.id === 'main-quote'), 1);
      nodes.unshift(quote, { id: 'opening-break', type: 'Connective', text: '\n', factIds: [], evidenceIds: [] });
    }
    const plan: QuotePlan = { id: '', intent: intentPlan.act, intentPlan, narrative, surface, rhetoric, rhetoricEdits: [], mainOperator: operation.id, auxiliaryOperators: [], family: `${relation}:${operation.relation}`,
      mapping: sourceMapping(ir, rhetoric), backTranslation: `参照は「${sourceSubject(ir, rhetoric)}」。${relation}の関係を${lexeme.lemma}の働きへ写す。比喩中の道具や作用は現実の出来事ではない。`,
      evidenceIds, forbiddenEffects: operation.forbidden, nodes, experimental: true };
    plan.id = hash(plan).slice(0, 24); plans.push(plan);
    if (plans.length >= 12) return plans;
  }
  return plans;
}
export function makeCanonicalPlans(ir: DocumentIR, request: GenerationRequest, assets: Assets): QuotePlan[] {
  const topics = ir.tokens.filter(token => ['NOUN', 'ADJ', 'VERB'].includes(token.pos) && ir.adoptedSpans.some(span => span.start <= token.span.start && span.end >= token.span.end) && !ir.source.protectedValues.some(value => value.span.start < token.span.end && token.span.start < value.span.end));
  if (!topics.length) return [];
  const source = topics.map(token => token.lemma).join(' ');
  const references = retrievalFor(assets).search(source, request.series, 'usage', 24).filter(item => [...item.text].length >= 4 && [...item.text].length <= 100 && !/[「」『』]/u.test(item.text)).slice(0, 6);
  return references.map(reference => {
    const narrative = planNarrative(ir, request.contextMode === 'full' ? 'status_order' : 'source_order');
    const nodes = factualNodes(ir, narrative);
    nodes.push({ id: 'quote-label', type: 'Connective', text: '\n関連する語録（引用）：', factIds: [], evidenceIds: [] },
      { id: 'quote-open', type: 'QuoteBoundary', text: '「', factIds: [], evidenceIds: [] },
      { id: 'main-quote', type: 'Reference', text: reference.text, factIds: [], evidenceIds: [reference.id] },
      { id: 'quote-close', type: 'QuoteBoundary', text: '」', factIds: [], evidenceIds: [] });
    const plan: QuotePlan = { id: '', intent: 'related-quotation', narrative, mainOperator: 'QUOTE', auxiliaryOperators: [], family: reference.family, mapping: { source: 'input-topic', target: 'corpus-quotation', relation: 'related-example' }, backTranslation: '原文の事実節に、別文として出典付きの関連引用を添えたもの。引用内の人物・出来事を原文の事実とはみなさない。', evidenceIds: [reference.id], forbiddenEffects: ['claim_quote_as_original', 'merge_quote_facts_into_input'], nodes, experimental: true };
    plan.id = hash(plan).slice(0, 24); return plan;
  });
}
export function moraDistance(a: string, b: string) {
  const mora = (value: string) => value.match(/[ァ-ヺー][ァィゥェォャュョ]?/gu) ?? [];
  const left = mora(a), right = mora(b), row = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) { let previous = row[0]; row[0] = i; for (let j = 1; j <= right.length; j++) { const old = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1)); previous = old; } }
  return row[right.length];
}
