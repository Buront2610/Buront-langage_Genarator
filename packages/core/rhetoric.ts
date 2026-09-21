import type { DocumentIR, Fact, RhetoricProgram, RhetoricRelation } from '../contracts';
import { hash, overlaps } from './source';

// A deliberately bounded ontology. Unsupported propositions abstain rather than
// being mapped to an arbitrary corpus noun. Targets have semantic affordances.
export const relationFor = (fact: Fact): RhetoricRelation | null => {
  if (fact.attribution.kind !== 'narrator' || fact.polarity === 'unknown' || fact.tense === 'unknown' || !['actual', 'prospective'].includes(fact.realization) || fact.voice === 'unknown') return null;
  if (fact.realization === 'prospective' && (fact.tense === 'past' || fact.polarity === 'negative')) return null;
  const agent = fact.arguments.find(arg => arg.role === 'agent'), patient = fact.arguments.find(arg => arg.role === 'patient');
  if (fact.predicateLemma === '助ける' && agent && patient) return 'assistance';
  if (fact.predicateLemma === '寒い' && fact.polarity === 'positive') return 'exposure';
  if (/^(復旧|修理|直す)$/u.test(fact.predicateLemma) && agent) return 'recovery';
  if (/^(停止中|停止)$/u.test(fact.predicateLemma) && agent && fact.polarity === 'positive' && fact.realization === 'actual') return 'stoppage';
  if (/^(確認|調べる|検証|監視)$/u.test(fact.predicateLemma) && agent) return 'verification';
  return null;
};
export const targetTerms: Record<RhetoricRelation, string[]> = {
  assistance: ['盾', '防御', '装備'], exposure: ['防御', '盾', '装備'],
  recovery: ['力', '技術'], stoppage: ['力', '装備'], verification: ['証拠', '知識'],
};
export function applicable(fact: Fact, relation: RhetoricRelation, operator: string) {
  if (relationFor(fact) !== relation) return false;
  if (['OP-01', 'OP-02', 'OP-06'].includes(operator)) return true;
  // Verification is a means of reducing uncertainty. Do not assign means/end
  // inversion to arbitrary achievements, assistance, or negative actions.
  return operator === 'OP-07' && relation === 'verification' && fact.polarity === 'positive' && fact.realization === 'prospective';
}
export function programFor(ir: DocumentIR, fact: Fact, target: string, operator: string): RhetoricProgram | null {
  const relation = relationFor(fact);
  if (!relation || !targetTerms[relation].includes(target) || !applicable(fact, relation, operator)) return null;
  if (!ir.adoptedSpans.some(span => span.start <= fact.sourceSpan.start && span.end >= fact.sourceSpan.end)) return null;
  if (fact.arguments.some(arg => [...arg.text].length > 32 || /[。！？\n「」]/u.test(arg.text)) || ir.source.opaqueSpans.some(span => overlaps(span, fact.sourceSpan))) return null;
  return { version: 1, factId: fact.id, relation, participants: fact.arguments.map(arg => ({ ...arg })), polarity: fact.polarity, tense: fact.tense, realization: fact.realization, completion: fact.completion, target, operator, discourse: 'mapping_first', discourseEvidenceIds: [] };
}

// This nominal source description is referential, never an invented real-world
// action of a metaphorical instrument. State is retained even for negated/past
// and prospective propositions.
export function sourceSubject(ir: DocumentIR, program: RhetoricProgram): string {
  const fact = ir.facts.find(fact => fact.id === program.factId)!;
  const agent = fact.arguments.find(arg => arg.role === 'agent')?.text ?? '', patient = fact.arguments.find(arg => arg.role === 'patient')?.text;
  if (program.relation === 'exposure') return fact.polarity === 'negative' ? fact.tense === 'past' ? '寒くなかったという状況' : '寒くないという状況' : fact.tense === 'past' ? '過去の寒さ' : fact.realization === 'prospective' ? 'これからの寒さ' : '寒さ';
  if (program.relation === 'assistance') {
    const state = fact.polarity === 'negative' ? fact.tense === 'past' ? '届かなかった' : '届かない' : fact.realization === 'prospective' ? 'これから届く予定の' : fact.completion === 'ongoing' ? fact.tense === 'past' ? '届いていた' : '届いている' : fact.tense === 'past' ? '届いた' : '届く';
    return `${agent}から${patient}へ${state}助力`;
  }
  if (program.relation === 'stoppage') return `${agent}の${fact.polarity === 'negative' ? '成立していない' : ''}${fact.tense === 'past' ? '過去の' : ''}${fact.realization === 'prospective' ? '予定された' : ''}${fact.predicateLemma}という状況`;
  const state = fact.polarity === 'negative' ? fact.tense === 'past' ? '行われなかった' : '行われていない' : fact.realization === 'prospective' ? 'これから行う' : fact.completion === 'ongoing' ? fact.tense === 'past' ? '過去に進行していた' : '進行中の' : fact.tense === 'past' ? '過去の' : '';
  const action = fact.predicateLemma === '直す' ? '修理' : fact.predicateLemma === '調べる' ? '調査' : fact.predicateLemma;
  return `${agent}による${patient ? patient + 'の' : ''}${state}${action}`;
}

export type RhetoricClauses = { mapping: string; criterion: string };
export function clausesFor(subject: string, program: RhetoricProgram): RhetoricClauses {
  const t = program.target, relation = program.relation;
  const images: Record<RhetoricRelation, string> = {
    assistance: `${t}を差し出す側と、その陰を受け取る側の関係`,
    exposure: `${t}を外から試す圧力`, recovery: `止まった道を通せるようにする${t}`,
    stoppage: `${t}の大きさと、道が通れるかを分けて考える場面`, verification: `見えない先を${t}で確かめる過程`,
  };
  const criteria: Record<RhetoricRelation, Record<string, string>> = {
    assistance: { 'OP-01': '差し出す側と受け取る側を交換したら、同じ道具でも別の話になる', 'OP-02': '道具の重さを量っても、誰から誰へ届くかは量れない', 'OP-06': '採点するのは道具の見栄えではなく、受け取る側に届く働きだ' },
    exposure: { 'OP-01': '圧力の話をしたはずが、受け止める側の構えまで試される', 'OP-02': '道具の重さを量っただけでは、寒さの強さを量ったことにならない', 'OP-06': '厚さを誇る側より、冷たさを通すか試す側に採点権がある' },
    recovery: { 'OP-01': '道を通せることと、速く走れることには別の採点欄が要る', 'OP-02': '力の大きさを量るだけでは、道が通れるかは決まらない', 'OP-06': '道具が立派かを道具に聞くな、道が通れるかに聞け' },
    stoppage: { 'OP-01': '力があるという説明だけで、通れない道を通ったことにはできない', 'OP-02': '力の大きさと道の通りやすさを同じ目盛りにすると、停止が目盛りから消えてしまう', 'OP-06': '力の自慢を採点する前に、通れるかを採点役に戻す必要がある' },
    verification: { 'OP-01': '見るための道具は、見終えたという証明書の代わりにはならない', 'OP-02': '道具を数えただけで確かさを量ると、調べる前に答えが増えてしまう', 'OP-06': '道具の立派さより、分からなさが減るかに採点権がある', 'OP-07': '確かめるための道具を磨くことが目的になると、確かめたいものだけが置き去りになる' },
  };
  const criterion = criteria[relation][program.operator];
  if (!criterion) throw new Error('INAPPLICABLE_RHETORIC_OPERATION');
  return { mapping: `${subject}を、${images[relation]}に見立てる`, criterion };
}
export function renderRhetoric(ir: DocumentIR, program: RhetoricProgram): string {
  const { mapping, criterion } = clausesFor(sourceSubject(ir, program), program);
  return program.discourse === 'criterion_first' ? `${criterion}。これは、${mapping}比喩だ。` : `${mapping}。${criterion}。`;
}
export function sourceMapping(ir: DocumentIR, program: RhetoricProgram) {
  const fact = ir.facts.find(fact => fact.id === program.factId)!;
  return { source: hash({ predicate: fact.predicateLemma, roles: fact.arguments.map(arg => [arg.role, arg.text]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), polarity: fact.polarity, tense: fact.tense, realization: fact.realization, completion: fact.completion }), target: program.target, relation: `${program.relation}:${program.operator}` };
}
