import type { DocumentIR, Fact, IntentPlan, NarrativePlan, NarrativeUnit, PlanNode, Span } from '../contracts';
import { overlaps, slice } from './source';
import { realizeRegister } from './surface';

// Only an explicit copular coordination with independent participants is split.
// Conditions, quotations, causal/contrast links and ambiguous scopes stay whole.
export function eventBoundaries(ir: DocumentIR): number[] {
  return ir.tokens.filter(token => token.text === '、').flatMap(token => {
    const end = token.span.end, sentence = ir.sentences.find(span => span.start < end && end < span.end);
    if (!sentence || ir.source.opaqueSpans.some(span => overlaps(span, sentence)) || ir.anchors.some(anchor => overlaps(anchor.span, sentence))) return [];
    const facts = factsIn(ir, sentence), left = facts.filter(fact => fact.predicateSpan.end <= end), right = facts.filter(fact => fact.predicateSpan.start >= end);
    if (left.length !== 1 || right.length !== 1 || !/で、$/u.test(slice(ir.source.raw, { start: sentence.start, end })) || !/^(停止中|稼働中|未完了|未解決)$/u.test(left[0].predicateLemma)) return [];
    if (facts.some(fact => fact.attribution.kind !== 'narrator' || fact.realization === 'hypothetical' || fact.polarity === 'unknown' || !fact.arguments.some(arg => arg.role === 'agent') || fact.arguments.some(arg => arg.span.start < end && arg.span.end > end)) || ir.relations.some(relation => facts.some(fact => [relation.from, relation.to].includes(fact.id)))) return [];
    if (facts.some(fact => fact.sourceSpan.start < end && end < fact.sourceSpan.end) || ir.source.protectedValues.some(value => value.span.start < end && end < value.span.end)) return [];
    return [end];
  });
}
export function realizeEvent(ir: DocumentIR, span: Span, closeCoordination: boolean) {
  const original = slice(ir.source.raw, span);
  if (closeCoordination && eventBoundaries(ir).includes(span.end)) return realizeRegister(original.replace(/で、$/u, 'だ。'));
  return realizeRegister(original);
}
export function equivalentEvent(ir: DocumentIR, span: Span, output: string) {
  const original = slice(ir.source.raw, span);
  return output === original || output === realizeEvent(ir, span, false) || eventBoundaries(ir).includes(span.end) && output === realizeEvent(ir, span, true);
}

export const discourseLabels: Record<NarrativeUnit['role'], string> = {
  achievement: '【成果】\n', unresolved: '【残件】\n', prospect: '【予定】\n',
  observation: '【状況】\n', reported: '【発言】\n', conditional: '【条件】\n', gratitude: '【感謝】\n',
};
export const factsIn = (ir: DocumentIR, span: Span) => ir.facts.filter(fact => span.start <= fact.predicateSpan.start && fact.predicateSpan.end <= span.end);
export function roleOf(ir: DocumentIR, span: Span): NarrativeUnit['role'] {
  const facts = factsIn(ir, span), text = slice(ir.source.raw, span);
  if (facts.some(fact => fact.attribution.kind !== 'narrator')) return 'reported';
  if (facts.some(fact => fact.realization === 'hypothetical')) return 'conditional';
  if (/ありがとう|感謝(?:し|する|して)|お礼/u.test(text)) return 'gratitude';
  if (facts.some(fact => fact.completion === 'not_completed' && fact.realization !== 'prospective')) return 'unresolved';
  if (facts.some(fact => fact.realization === 'prospective')) return 'prospect';
  if (facts.length && facts.every(fact => fact.completion === 'completed' && fact.polarity === 'positive' && fact.realization === 'actual')) return 'achievement';
  return 'observation';
}
export function planNarrative(ir: DocumentIR, requested: 'source_order' | 'status_order'): NarrativePlan {
  const units: NarrativeUnit[] = [];
  for (const adopted of ir.adoptedSpans) {
    let cursor = adopted.start;
    const boundaries = [...new Set([...ir.sentences.map(span => span.end), ...eventBoundaries(ir)].filter(end => end > adopted.start && end < adopted.end).concat(adopted.end))].sort((a, b) => a - b);
    for (const end of boundaries) {
      // A quotation, protected literal, or scoped predicate may not be cut in half.
      if (end !== adopted.end && [...ir.source.opaqueSpans, ...ir.source.protectedValues.map(value => value.span), ...ir.facts.map(fact => fact.sourceSpan)].some(span => span.start < end && end < span.end)) continue;
      const span = { start: cursor, end }, facts = factsIn(ir, span);
      units.push({ id: `unit-${units.length}`, sourceSpan: span, factIds: facts.map(fact => fact.id), role: roleOf(ir, span) }); cursor = end;
    }
  }
  const sourceOrder = units.map(unit => unit.id);
  const unsafe = ir.topicOnly || units.length < 2 || units.some(unit => {
    const text = slice(ir.source.raw, unit.sourceSpan), facts = factsIn(ir, unit.sourceSpan);
    return !facts.length || facts.some(fact => fact.resolution !== 'resolved' || fact.attribution.kind !== 'narrator' || fact.realization === 'hypothetical' || !fact.arguments.some(argument => argument.role === 'agent'))
      || ir.source.opaqueSpans.some(span => overlaps(span, unit.sourceSpan)) || ir.anchors.some(anchor => overlaps(anchor.span, unit.sourceSpan))
      || /(?:それ|これ|あれ|その|この|あの|彼|彼女|同じ|続いて|その後|翌日|しかし|だから|ため|一方|まず|次に)/u.test(text);
  }) || ir.relations.some(relation => units.find(unit => unit.factIds.includes(relation.from))?.id !== units.find(unit => unit.factIds.includes(relation.to))?.id);
  const priority: Record<NarrativeUnit['role'], number> = { achievement: 0, unresolved: 1, observation: 2, prospect: 3, gratitude: 4, reported: 5, conditional: 6 };
  const strategy = requested === 'status_order' && !unsafe ? requested : 'source_order';
  const displayOrder = strategy === 'status_order' ? [...units].sort((a, b) => priority[a.role] - priority[b.role] || a.sourceSpan.start - b.sourceSpan.start).map(unit => unit.id) : sourceOrder;
  return { strategy, units, sourceOrder, displayOrder, preservedRelations: ir.relations.map(relation => ({ ...relation })), orderingReason: strategy === 'status_order' ? '独立した出来事の節を成果・残件・状況・予定の順に表示。出来事の発生順を新たに主張しない。' : requested === 'status_order' && unsafe ? '引用・照応・主体省略・関係の可能性があるため原文順を保持。' : '原文順を保持。' };
}
export function factualNodes(ir: DocumentIR, narrative: NarrativePlan): PlanNode[] {
  return narrative.displayOrder.flatMap(id => {
    const unit = narrative.units.find(unit => unit.id === id)!, original = slice(ir.source.raw, unit.sourceSpan), facts = factsIn(ir, unit.sourceSpan);
    const opaque = ir.topicOnly || facts.some(fact => fact.resolution !== 'resolved') || ir.source.opaqueSpans.some(span => overlaps(span, unit.sourceSpan));
    const node: PlanNode = { id: `fact-node-${narrative.sourceOrder.indexOf(id)}`, type: 'FactClause', text: opaque ? original : realizeEvent(ir, unit.sourceSpan, narrative.strategy === 'status_order'), sourceSpan: unit.sourceSpan, factIds: unit.factIds, evidenceIds: [], mention: 'primary' };
    return narrative.strategy === 'status_order' ? [{ id: `label-${id}`, type: 'Connective' as const, text: discourseLabels[unit.role], factIds: [], evidenceIds: [] }, node, { id: `break-${id}`, type: 'Connective' as const, text: '\n', factIds: [], evidenceIds: [] }] : [node];
  });
}
export function planIntent(ir: DocumentIR): IntentPlan {
  const adopted = ir.facts.filter(fact => ir.adoptedSpans.some(span => span.start <= fact.predicateSpan.start && fact.predicateSpan.end <= span.end));
  const text = ir.adoptedSpans.map(span => slice(ir.source.raw, span)).join('\n');
  let act: IntentPlan['act'] = 'observation', selected: Fact[] = [];
  const explicit = (pattern: RegExp) => adopted.filter(fact => pattern.test(slice(ir.source.raw, fact.sourceSpan)) && fact.attribution.kind === 'narrator');
  if ((selected = explicit(/ありがとう|感謝|お礼/u)).length) act = 'gratitude';
  else if ((selected = explicit(/注意|気を付け|危険|警告/u)).length) act = 'warning';
  else if ((selected = explicit(/反論|反対|異議|賛成できない/u)).length) act = 'rebuttal';
  else if ((selected = explicit(/私|自分|俺|僕/u).filter(fact => /言い訳|慎重|念のため/u.test(slice(ir.source.raw, fact.sourceSpan)))).length) act = 'self_justification';
  else if ((selected = adopted.filter(fact => fact.completion === 'not_completed' && fact.attribution.kind === 'narrator')).length) act = 'unresolved';
  else if ((selected = adopted.filter(fact => fact.realization === 'prospective' && fact.attribution.kind === 'narrator')).length) act = 'prospect';
  else if ((selected = adopted.filter(fact => fact.completion === 'completed' && fact.attribution.kind === 'narrator')).length) act = 'achievement';
  else selected = adopted;
  const target = selected[0];
  return { act, targetFacts: target ? [target.id] : [], targetSpan: target?.sourceSpan ?? ir.adoptedSpans[0], stance: act === 'warning' || act === 'unresolved' ? 'cautious' : act === 'gratitude' ? 'appreciative' : 'neutral', addressee: ir.anchors.find(anchor => ['agreement', 'vocative', 'reply'].includes(anchor.usage))?.id ?? null,
    evidence: target ? `原文範囲${target.sourceSpan.start}〜${target.sourceSpan.end}の明示表現・出来事状態` : text ? '焦点の話題。未記載の主語や相手は補わない。' : 'unknown',
    forbiddenEffects: ['replace_actor', 'change_quantity', 'promote_completion', 'invent_opponent', 'invent_cause', 'remove_attribution'] };
}
