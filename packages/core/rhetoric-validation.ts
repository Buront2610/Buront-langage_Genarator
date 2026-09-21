import type { Check, DocumentIR, QuotePlan, RhetoricEdit, RhetoricRelation, Fact } from '../contracts';
import { hash, slice } from './source';
import { applicable, relationFor, sourceMapping, targetTerms } from './rhetoric';

// An independent recognizer for a small, closed metaphor language. It reads the
// emitted clauses; it never consults a set of strings emitted by the compiler.
// Semantic roles in the first clause and the effect in the second are checked
// independently. Expanding the compiler alone cannot expand accepted effects.
const images: { pattern: RegExp; relation: RhetoricRelation }[] = [
  { pattern: /^(.+)を差し出す側と、その陰を受け取る側の関係$/u, relation: 'assistance' },
  { pattern: /^(.+)を外から試す圧力$/u, relation: 'exposure' },
  { pattern: /^止まった道を通せるようにする(.+)$/u, relation: 'recovery' },
  { pattern: /^(.+)の大きさと、道が通れるかを分けて考える場面$/u, relation: 'stoppage' },
  { pattern: /^見えない先を(.+)で確かめる過程$/u, relation: 'verification' },
];
const effects: { pattern: RegExp; relation: RhetoricRelation; operator: string }[] = [
  { relation: 'assistance', operator: 'OP-01', pattern: /^差し出す側と受け取る側を交換したら、同じ道具でも別の話になる$/u },
  { relation: 'assistance', operator: 'OP-02', pattern: /^道具の重さを量っても、誰から誰へ届くかは量れない$/u },
  { relation: 'assistance', operator: 'OP-06', pattern: /^採点するのは道具の見栄えではなく、受け取る側に届く働きだ$/u },
  { relation: 'exposure', operator: 'OP-01', pattern: /^圧力の話をしたはずが、受け止める側の構えまで試される$/u },
  { relation: 'exposure', operator: 'OP-02', pattern: /^道具の重さを量っただけでは、寒さの強さを量ったことにならない$/u },
  { relation: 'exposure', operator: 'OP-06', pattern: /^厚さを誇る側より、冷たさを通すか試す側に採点権がある$/u },
  { relation: 'recovery', operator: 'OP-01', pattern: /^道を通せることと、速く走れることには別の採点欄が要る$/u },
  { relation: 'recovery', operator: 'OP-02', pattern: /^力の大きさを量るだけでは、道が通れるかは決まらない$/u },
  { relation: 'recovery', operator: 'OP-06', pattern: /^道具が立派かを道具に聞くな、道が通れるかに聞け$/u },
  { relation: 'stoppage', operator: 'OP-01', pattern: /^力があるという説明だけで、通れない道を通ったことにはできない$/u },
  { relation: 'stoppage', operator: 'OP-02', pattern: /^力の大きさと道の通りやすさを同じ目盛りにすると、停止が目盛りから消えてしまう$/u },
  { relation: 'stoppage', operator: 'OP-06', pattern: /^力の自慢を採点する前に、通れるかを採点役に戻す必要がある$/u },
  { relation: 'verification', operator: 'OP-01', pattern: /^見るための道具は、見終えたという証明書の代わりにはならない$/u },
  { relation: 'verification', operator: 'OP-02', pattern: /^道具を数えただけで確かさを量ると、調べる前に答えが増えてしまう$/u },
  { relation: 'verification', operator: 'OP-06', pattern: /^道具の立派さより、分からなさが減るかに採点権がある$/u },
  { relation: 'verification', operator: 'OP-07', pattern: /^確かめるための道具を磨くことが目的になると、確かめたいものだけが置き去りになる$/u },
];

// Decode the source nominal independently of the generator's sourceSubject.
// In particular a bug in its subject order, conjugation or state wording must
// not be reproduced here by calling the same rendering function.
function sourceNominalMatches(text: string, fact: Fact, relation: RhetoricRelation): boolean {
  const agent = fact.arguments.find(arg => arg.role === 'agent')?.text, patient = fact.arguments.find(arg => arg.role === 'patient')?.text;
  if (relation === 'assistance') {
    const match = /^(.+)から(.+)へ(これから届く予定の|届かなかった|届かない|届いている|届いていた|届いた|届く)助力$/u.exec(text);
    if (!match || match[1] !== agent || match[2] !== patient) return false;
    switch (match[3]) {
      case '届かなかった': return fact.polarity === 'negative' && fact.tense === 'past' && fact.realization === 'actual';
      case '届かない': return fact.polarity === 'negative' && fact.tense === 'nonpast' && fact.realization === 'actual';
      case 'これから届く予定の': return fact.polarity === 'positive' && fact.realization === 'prospective' && fact.tense === 'nonpast';
      case '届いている': return fact.polarity === 'positive' && fact.realization === 'actual' && fact.completion === 'ongoing' && fact.tense === 'nonpast';
      case '届いていた': return fact.polarity === 'positive' && fact.realization === 'actual' && fact.completion === 'ongoing' && fact.tense === 'past';
      case '届いた': return fact.polarity === 'positive' && fact.realization === 'actual' && fact.tense === 'past' && fact.completion !== 'ongoing';
      case '届く': return fact.polarity === 'positive' && fact.realization === 'actual' && fact.tense === 'nonpast' && fact.completion !== 'ongoing';
    }
    return false;
  }
  if (relation === 'exposure') {
    return fact.polarity === 'positive' && (text === '過去の寒さ' && fact.tense === 'past' && fact.realization === 'actual' || text === 'これからの寒さ' && fact.realization === 'prospective' && fact.tense === 'nonpast' || text === '寒さ' && fact.tense === 'nonpast' && fact.realization === 'actual');
  }
  if (relation === 'stoppage') {
    const match = /^(.+)の(過去の)?(停止中|停止)という状況$/u.exec(text);
    return !!match && match[1] === agent && match[3] === fact.predicateLemma && fact.polarity === 'positive' && fact.realization === 'actual' && (match[2] ? fact.tense === 'past' : fact.tense === 'nonpast');
  }
  const prefix = `${agent}による${patient ? patient + 'の' : ''}`;
  if (!agent || !text.startsWith(prefix)) return false;
  const match = /^(行われなかった|行われていない|これから行う|進行中の|過去に進行していた|過去の)?(復旧|修理|確認|調査|検証|監視)$/u.exec(text.slice(prefix.length));
  if (!match) return false;
  const actionPredicates: Record<string, string[]> = { 復旧: ['復旧'], 修理: ['修理', '直す'], 確認: ['確認'], 調査: ['調べる'], 検証: ['検証'], 監視: ['監視'] };
  if (!actionPredicates[match[2]].includes(fact.predicateLemma)) return false;
  switch (match[1] ?? '') {
    case '行われなかった': return fact.polarity === 'negative' && fact.tense === 'past' && fact.realization === 'actual';
    case '行われていない': return fact.polarity === 'negative' && fact.tense === 'nonpast' && fact.realization === 'actual';
    case 'これから行う': return fact.polarity === 'positive' && fact.realization === 'prospective' && fact.tense === 'nonpast';
    case '進行中の': return fact.polarity === 'positive' && fact.realization === 'actual' && fact.completion === 'ongoing' && fact.tense === 'nonpast';
    case '過去に進行していた': return fact.polarity === 'positive' && fact.realization === 'actual' && fact.completion === 'ongoing' && fact.tense === 'past';
    case '過去の': return fact.polarity === 'positive' && fact.tense === 'past' && fact.realization === 'actual' && fact.completion !== 'ongoing';
    case '': return fact.polarity === 'positive' && fact.tense === 'nonpast' && fact.realization === 'actual' && fact.completion !== 'ongoing';
  }
  return false;
}

export function undoRhetoricEdits(core: string, edits: RhetoricEdit[]) {
  let source = '', outputCursor = 0, sourceCursor = 0;
  for (const edit of edits) {
    if (edit.outputSpan.start < outputCursor || edit.sourceSpan.start < sourceCursor || edit.sourceSpan.end - edit.sourceSpan.start !== [...edit.from].length || !edit.from || edit.outputSpan.end - edit.outputSpan.start !== [...edit.to].length || slice(core, edit.outputSpan) !== edit.to) return null;
    const prefix = slice(core, { start: outputCursor, end: edit.outputSpan.start });
    if ([...prefix].length !== edit.sourceSpan.start - sourceCursor) return null;
    source += prefix + edit.from; outputCursor = edit.outputSpan.end; sourceCursor = edit.sourceSpan.end;
  }
  return source + [...core].slice(outputCursor).join('');
}
export function validateRhetoric(ir: DocumentIR, plan: QuotePlan): { valid: boolean; dictionary: Check['status']; explanation: string } {
  const fail = (explanation: string) => ({ valid: false, dictionary: 'fail' as const, explanation });
  const program = plan.rhetoric, nodes = plan.nodes.filter(node => node.type === 'RhetoricalClause');
  if (!program || program.version !== 1 || !plan.surface || nodes.length !== 1 || nodes[0].id !== 'main-quote') return fail('修辞は意味表現に結び付いた一節だけを許可する');
  const fact = ir.facts.find(fact => fact.id === program.factId);
  if (!fact || !ir.adoptedSpans.some(span => span.start <= fact.sourceSpan.start && fact.sourceSpan.end <= span.end) || !plan.intentPlan?.targetFacts.includes(fact.id) || hash(nodes[0].factIds) !== hash([fact.id])) return fail('修辞の参照が採用対象の事実と一致しない');
  if (relationFor(fact) !== program.relation || hash(fact.arguments) !== hash(program.participants) || ['polarity', 'tense', 'realization', 'completion'].some(field => (fact as any)[field] !== (program as any)[field]) || program.operator !== plan.mainOperator || !applicable(fact, program.relation, program.operator)) return fail('主体・対象・状態または操作条件が原文と一致しない');
  if (!targetTerms[program.relation]?.includes(program.target)) return fail('対象概念に必要な働きがない');
  if (hash(plan.mapping) !== hash(sourceMapping(ir, program))) return fail('新規性評価用の関係写像が原文の意味表現と一致しない');
  const operatorRelations: Record<string, string> = { 'OP-01': 'domain_transfer', 'OP-02': 'scale_conflict', 'OP-06': 'evaluation_reverse', 'OP-07': 'means_end' };
  if (plan.family !== `${program.relation}:${operatorRelations[program.operator]}`) return fail('操作familyが出力の意味操作と一致しない');
  const core = undoRhetoricEdits(plan.surface.coreText, plan.rhetoricEdits ?? []);
  if (core === null) return fail('辞書編集の範囲・前後の文字列が一致しない');
  let mapping: string, criterion: string;
  const clauses = core.split('。');
  if (clauses.length !== 3 || clauses[2]) return fail('比喩作用域に追加の主張がある');
  if (program.discourse === 'mapping_first') [mapping, criterion] = clauses;
  else if (program.discourse === 'criterion_first' && clauses[1].startsWith('これは、') && clauses[1].endsWith('比喩だ')) { criterion = clauses[0]; mapping = clauses[1].slice(4, -3); }
  else return fail('比較と結論の結合が不正');
  const nominal = /^(.+)を、(.+)に見立てる$/u.exec(mapping);
  if (!nominal || !sourceNominalMatches(nominal[1], fact, program.relation)) return fail('修辞を逆解析した参照主体・対象・状態が原文へ戻らない');
  const image = images.find(image => image.relation === program.relation && image.pattern.test(nominal[2]));
  if (!image || image.pattern.exec(nominal[2])![1] !== program.target || !effects.some(effect => effect.relation === program.relation && effect.operator === program.operator && effect.pattern.test(criterion))) return fail('対象の関係または修辞の効果が許可された意味操作ではない');
  let dictionary: Check['status'] = 'pass';
  for (const edit of plan.rhetoricEdits ?? []) {
    if (edit.from === edit.to) continue;
    if (fact.arguments.some(arg => edit.from.includes(arg.text) || arg.text.includes(edit.from))) return fail('辞書が原文の実体参照を変えている');
    if (edit.from === '寒さ' && edit.to === '冷え込み' || edit.from === '冷え込み' && edit.to === '寒さ') continue;
    // Unknown nominal substitutions can be displayed for review; sentences,
    // entities, numbers and deleted scope/negation cannot enter through an edit.
    if (!(edit.from === '寒さ' || /^[\p{Script=Han}\p{Script=Katakana}ー]{1,16}$/u.test(edit.from)) || !/^[\p{Script=Han}\p{Script=Katakana}ー]{1,16}$/u.test(edit.to) || fact.arguments.some(arg => edit.from.includes(arg.text) || arg.text.includes(edit.from))) return fail('辞書が実体参照・事実の主張・作用域を変えている');
    dictionary = 'unknown';
  }
  return { valid: true, dictionary, explanation: dictionary === 'unknown' ? '語の置換は再構築できるが意味の対応が未登録。要確認。' : '出力から比較関係と効果を逆解析し、原文の役割・状態・成立条件へ照合' };
}
