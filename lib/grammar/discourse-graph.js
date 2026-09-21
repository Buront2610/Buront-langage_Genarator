"use strict";

const problemPattern = /できな|できそうにな|分からな|まとまらな|間に合|遅れ|停止|故障|不足|失敗|問題|異常|警告|危険|衝突|見失|迷っ|視界|濃霧|煙|火が上|恐怖|恐い|怖い|違和感|おかしい|寒気|死体|襲|囲ま|追われ|吊ろう|吊り上げ|全身.{0,8}(?:震|冷)/;
const revealPattern = /明らか|実は|正体|判明|気[がを]付|気づ|ではなく|だったのだ|という事実|見上げると|振り返ると/;
const resolutionPattern = /全滅|撃退|退け|消滅|解決|成功|完成|復旧|回復|勝利|助かった|救出|到着|決まった|まとまった|消え|収ま|落ち着|間に合った|提出でき|特定でき|短縮され|減った|戻った|終わった|片付いた/;
const actionPattern = /作っ|作成|実装|導入|修正|整理|対処|復旧作業|調べ|確認し|取り出|振り回|引き裂|叫ぶ|唱え|走り|飛び乗|助け|救|反撃|攻撃|止め|消火|案内|連絡|操作|見上げ|振り返|前に来|現れ/;
const interventionPattern = /そこまで|助け|救|駆けつけ|現れ|立ちはだか|前に来|取り出|振り回|反撃|対処|復旧|修正|整理|導入|実装|作っ|止め|消火|案内|連絡|操作|呪文|叫ぶ/;
const futurePattern = /予定|明日|来週|来月|翌週|後日|今後|これから|次回/;
const aftermathPattern = /帰り道|その後|後にな|聞いた話|によると|翌朝|翌日|日が上|種明かし/;
const evaluationPattern = /思った|感じた|感心|評価|褒め|驚|スゴイ|すごい|素晴らし|見事|尊敬|笑ってみせ/;

function cleanFact(value) {
  return String(value ?? "").trim().replace(/[。！？!?]+$/g, "");
}

function dialogueParts(value) {
  const text = cleanFact(value);
  const quotes = text.match(/「[^」]*」|『[^』]*』/g) || [];
  const narration = text
    .replace(/「[^」]*」|『[^』]*』/g, " ")
    .replace(/[\s　]+/g, " ")
    .replace(/^[、,]+|[、,]+$/g, "")
    .trim();
  return { quotes, narration };
}

function actorFrom(value) {
  const text = cleanFact(value);
  const named = text.match(/([A-Za-z][A-Za-z0-9_-]{0,12}さん|[一-龠々ァ-ヶー]{1,12}さん)/);
  if (named) return named[1];
  const firstPerson = text.match(/^(俺|私|僕|自分)(?:は|が)/);
  if (firstPerson) return firstPerson[1];
  const subject = text.match(/^([A-Za-z一-龠々ァ-ヶー]{1,12})(?:は|が)/);
  if (!subject || /^(?:今日|昨日|翌日|翌朝|ある日|そこ|これ|それ|何か|気|影|男性|周り|場所|街)$/.test(subject[1])) return null;
  return subject[1];
}

function lexicalRole(text, index) {
  if (aftermathPattern.test(text)) return "aftermath";
  if (resolutionPattern.test(text)) return "result";
  if (futurePattern.test(text) && !/予定.{0,16}(?:キャンセル|中止|なくな|消え)/.test(text)) return "future";
  if (revealPattern.test(text) && problemPattern.test(text)) return "reveal";
  if (actionPattern.test(text) && interventionPattern.test(text)) return "action";
  if (problemPattern.test(text)) return "problem";
  if (actionPattern.test(text)) return "action";
  if (evaluationPattern.test(text)) return "evaluation";
  if (index <= 2) return "setting";
  return "background";
}

function buildDiscourseGraph(facts) {
  let activeActor = "俺";
  const nodes = facts.map((fact, index) => {
    const text = cleanFact(fact);
    const explicitActor = actorFrom(text);
    if (explicitActor) activeActor = explicitActor;
    const dialogue = dialogueParts(text);
    return {
      index,
      source: text,
      role: lexicalRole(text, index),
      actor: explicitActor || activeActor,
      explicitActor,
      quotes: dialogue.quotes,
      narration: dialogue.narration,
      hasDialogue: dialogue.quotes.length > 0,
      hasInterventionCue: interventionPattern.test(text),
    };
  });

  const crisisIndex = nodes.findIndex((node) => ["problem", "reveal"].includes(node.role));
  const resolutionIndex = nodes.findIndex((node) => node.index > crisisIndex && node.role === "result");
  const revealIndex = nodes.findIndex((node) => node.index >= crisisIndex && node.role === "reveal");
  let interventionIndex = nodes.findIndex((node) => (
    node.index > Math.max(crisisIndex, revealIndex)
    && node.index < resolutionIndex
    && node.hasInterventionCue
  ));
  if (interventionIndex < 0) {
    interventionIndex = nodes.findIndex((node) => (
      node.index > crisisIndex && node.index < resolutionIndex && node.role === "action"
    ));
  }
  if (interventionIndex > 0) {
    const previous = nodes[interventionIndex - 1];
    if (previous.hasDialogue && previous.explicitActor && previous.actor === nodes[interventionIndex].actor) {
      interventionIndex -= 1;
    }
  }

  return {
    nodes,
    crisisIndex,
    revealIndex,
    interventionIndex,
    resolutionIndex,
    hasNarrativeArc: facts.length >= 8
      && crisisIndex >= 0
      && interventionIndex > crisisIndex
      && resolutionIndex > interventionIndex,
    focalActor: interventionIndex >= 0 ? nodes[interventionIndex].actor : "俺",
  };
}

module.exports = {
  buildDiscourseGraph,
  cleanFact,
  dialogueParts,
};
