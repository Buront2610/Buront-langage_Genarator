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
    assistance: `${t}を渡す側と守られる側の二人組`,
    exposure: `${t}に採点を付けに来る試験官`, recovery: `通れない道に通行許可を出す${t}`,
    stoppage: `${t}だけ先に到着して道が置いてけぼりの状態`, verification: `${t}を持って分からなさに殴り込みをかける作業`,
  };
  const criteria: Record<RhetoricRelation, Record<string, string>> = {
    assistance: { 'OP-01': '渡す側と受け取る側を逆にしたら助けの方向まで逆走するんだが？道具が同じなら同じ話とかあもりにも大ざっぱすぐるでしょう', 'OP-02': '重さを量れば誰を助けたかまで分かるなら体重計が恩人を名乗り出すぞ', 'OP-06': '道具が自分で満点を付けても意味ないからな？守られる側に届いて初めて見事な仕事になる' },
    exposure: { 'OP-01': '受け止める構えまで試験範囲とか聞いてないんだが？寒さのくせに試験官の仕事まで取るとか汚い', 'OP-02': '重い装備なら寒さも軽くなると思ったか？重さを増やして温度に勝ったつもりとか単位が違いすぐるでしょう', 'OP-06': '厚さを自慢しても採点するのは冷たさだからな？防ぐ側が自分で合格を出したら試験官が深い悲しみに包まれる' },
    recovery: { 'OP-01': '道が通れるのと速く走れるのは別だべ？通行許可だけで一位を名乗ったら速さの方が置いてけぼりになる', 'OP-02': '力だけで通れる道が決まるなら力自慢が道路地図になるんだが？あもりにも地理をなめすぐでしょう', 'OP-06': '立派かどうかを道具に聞いたら自分で自分に満点を付けるに決まってるだろ？道が通れるかに聞くべきそうすべき' },
    stoppage: { 'OP-01': '力があるから通れると言い張っても道は空気を読まないからな？説明だけ先にゴールしても本体は置いてけぼりという有様', 'OP-02': '力と通りやすさを同じ目盛りで量れば停止だけ消えるという計算になるが動いたのは目盛りだけなんだが？', 'OP-06': '力の自慢に満点を付けても通れなければ採点表だけが走っている事になるな？まず道に聞くべきそうすべき' },
    verification: { 'OP-01': '見る道具を持っただけで見終わった事になるなら望遠鏡は全知全能なんだが？あもりにも道具に仕事させすぐでしょう', 'OP-02': '道具を増やすだけで答えまで増えるなら調べる前に物知りになれるな？それは知識ではなく持ち物検査だろう', 'OP-06': '道具の自慢より分からなさを減らすべきそうすべき？疑問だけ無傷で帰したら道具の面目が丸つぶれになる', 'OP-07': '道具を磨く方が目的になったら疑問は放置で道具だけぴかぴかとか何のための確認だったんですかねえ？' },
  };
  const criterion = criteria[relation][program.operator];
  if (!criterion) throw new Error('INAPPLICABLE_RHETORIC_OPERATION');
  return { mapping: `${subject}は、${images[relation]}みたいなものなんだが`, criterion };
}
export function renderRhetoric(ir: DocumentIR, program: RhetoricProgram): string {
  const { mapping, criterion } = clausesFor(sourceSubject(ir, program), program);
  return program.discourse === 'criterion_first' ? `${criterion}。なぜなら${mapping}。` : `${mapping}。${criterion}。`;
}
export function sourceMapping(ir: DocumentIR, program: RhetoricProgram) {
  const fact = ir.facts.find(fact => fact.id === program.factId)!;
  return { source: hash({ predicate: fact.predicateLemma, roles: fact.arguments.map(arg => [arg.role, arg.text]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), polarity: fact.polarity, tense: fact.tense, realization: fact.realization, completion: fact.completion }), target: program.target, relation: `${program.relation}:${program.operator}` };
}
