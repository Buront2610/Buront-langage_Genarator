"use strict";

const { splitSentences, tokenize } = require("../text-analysis");
const { anchorConstructions, constructionList } = require("./phrase-constructions");
const { pick } = require("./random-utils");

const goroDigits = new Map(Object.entries({
  れ: "0", ぜ: "0", お: "0",
  い: "1", ひ: "1",
  に: "2", ふ: "2", つ: "2",
  さ: "3", み: "3",
  し: "4", よ: "4",
  ご: "5", こ: "5",
  ろ: "6", む: "6",
  な: "7",
  は: "8", や: "8",
  く: "9", き: "9",
}));

const goroStopWords = new Set(["これ", "それ", "あれ", "こいつ", "って", "きた", "んで", "たら"]);

function stripEnding(value) {
  return String(value ?? "").trim().replace(/[。！？!?]+$/g, "");
}

function toHiragana(value) {
  return Array.from(String(value ?? "")).map((character) => {
    const code = character.charCodeAt(0);
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : character;
  }).join("");
}

function kanaGoro(value) {
  const word = toHiragana(value).replace(/[ーぁぃぅぇぉゃゅょっ]/g, "");
  if (word.length < 2 || word.length > 3 || goroStopWords.has(word)) return null;
  const digits = Array.from(word).map((character) => goroDigits.get(character));
  return digits.every(Boolean) ? digits.join("") : null;
}

function cleanTarget(value) {
  const cleaned = String(value ?? "")
    .replace(/^(?:今日|昨日|今朝|さっき|突然|いきなり)[、,]?/, "")
    .split(/[、,]/).pop()
    .replace(/^(?:俺|私|僕|自分)の/, "")
    .replace(/[\s　]+/g, "")
    .replace(/[「『].*$/, "")
    .replace(/(?:が|は|から|に)$/, "")
    .trim();
  if (!cleaned || cleaned.length > 20 || /^(?:俺|私|僕|自分|こちら)$/.test(cleaned)) return null;
  return cleaned;
}

function explicitTarget(text) {
  const numeric = String(text).match(/(?:>>|＞＞)\s*(\d{1,6})/);
  if (numeric) return numeric[1];
  const symbolic = String(text).match(/(?:>>|＞＞)\s*([A-Za-zぁ-んァ-ヶ一-龠々ー]{1,20})(?=\s|[、。！？!?]|$)/);
  return symbolic?.[1] || null;
}

function addTarget(targets, value, roles, evidence) {
  const cleaned = cleanTarget(value);
  if (!cleaned) return;
  const existing = targets.find((target) => target.value === cleaned);
  if (existing) {
    for (const role of roles) existing.roles.add(role);
    if (evidence && !existing.evidence.includes(evidence)) existing.evidence.push(evidence);
    return;
  }
  targets.push({ value: cleaned, roles: new Set(roles), evidence: evidence ? [evidence] : [] });
}

class AnchorGrammar {
  analyze(text, audienceBase = null) {
    const targets = [];
    for (const sentence of splitSentences(text)) {
      const content = stripEnding(sentence);
      const challenger = content.match(/^(.{1,24}?)(?:が|は)(?=.{0,80}(?:勝負|挑ん|挑戦|張り合|ライバル|競争|文句|批判|否定|反対|言い争|(?:自分|俺|私|僕)の方が.{0,18}(?:速|早|強|上手|優|できる|正しい).{0,18}(?:言|主張|豪語)))/);
      const passiveCritic = content.match(/^(.{1,20}?)(?:から|に)(?=.{0,60}(?:文句|批判|否定|反対|挑発))/);
      const quotedSpeaker = content.match(/^([^「『]{1,20})[「『]/);
      const explanationSource = content.match(/^(.{1,24}?)(?:の説明|の解説|の助言|の案内|の手ほどき|のおかげ|の話|の情報|の指摘)(?=.{0,60}(?:わか|分か|理解|判明|気づ|助か|解決|納得))/);
      const teachingSource = content.match(/^(.{1,20}?)(?:から|に)(?:教え|聞い|説明され|助けられ)/);
      const opinionSource = content.match(/^(.{1,24}?)(?:の意見|の提案|の考え|の案)(?=.{0,50}(?:賛成|同意|納得|正しい|支持))/);
      const evidenceSource = content.match(/^(.{1,24}?)(?:のデータ|のログ|の記録|の証言|の結果)|^([A-Za-z一-龠々ァ-ヶー]{1,12}(?:の[A-Za-z一-龠々ァ-ヶー]{1,12})?)(?:が|は).{0,35}(?:証明|示し|確認)/);
      const evidenceRecord = content.match(/^(.{1,24}?(?:ログ|記録|データ))(?:には|に|が|は).{0,80}(?:記録|示|確認|原因)/);
      if (challenger) addTarget(targets, challenger[1], ["opponent"], content);
      if (passiveCritic) addTarget(targets, passiveCritic[1], ["opponent"], content);
      if (quotedSpeaker) addTarget(targets, quotedSpeaker[1], ["speaker"], content);
      if (explanationSource) addTarget(targets, explanationSource[1], ["source", "supporter"], content);
      if (teachingSource) addTarget(targets, teachingSource[1], ["source", "supporter"], content);
      if (opinionSource) addTarget(targets, opinionSource[1], ["supporter", "source"], content);
      if (evidenceSource) addTarget(targets, evidenceSource[1] || evidenceSource[2], ["source"], content);
      if (evidenceRecord) addTarget(targets, evidenceRecord[1], ["source"], content);
    }
    if (!targets.length && audienceBase && String(text).includes(audienceBase)) {
      addTarget(targets, audienceBase, ["any"], "audience fallback");
    }
    const goroTargets = tokenize(text, { contentOnly: true }).flatMap((token) => {
      if (!/^[ぁ-んァ-ヶー]{2,5}$/.test(token)) return [];
      const target = kanaGoro(token);
      return target ? [{ value: target, target, word: token, roles: new Set(["opponent"]), evidence: [token] }] : [];
    }).filter((candidate, index, values) => (
      values.findIndex((other) => other.value === candidate.value && other.word === candidate.word) === index
    ));
    return {
      explicitTarget: explicitTarget(text),
      targets,
      goroTargets,
    };
  }

  selectTarget(model, role = "any", random = Math.random, options = {}) {
    if (model.replyTarget) return { target: model.replyTarget, coda: null, family: "explicit", role };
    const typedTargets = (model.anchorTargets || []).filter((target) => (
      role === "any" || target.roles.has(role) || (options.allowGeneric && target.roles.has("any"))
    ));
    const targetPool = typedTargets.length ? typedTargets : options.allowAny ? (model.anchorTargets || []) : [];
    const candidates = targetPool.map((target) => ({
      target: target.value,
      coda: null,
      family: "context",
      role,
    }));
    if (role === "opponent" && options.allowGoro !== false) {
      candidates.push(...(model.goroTargets || []).map(({ value, word }) => ({
        target: value,
        coda: `${word}とか言ってる時点で勝てない勝負なのは確定的に明らか`,
        family: "goro",
        role,
      })));
    }
    return candidates.length
      ? pick(random, candidates)
      : { target: null, coda: null, family: "none", role };
  }

  available(model) {
    const hasTarget = (role) => Boolean(this.selectTarget(model, role, () => 0, { allowAny: false }).target);
    return constructionList().filter((construction) => {
      if (construction.id === "fused_performative") return model.hasGratitude && model.hasRecognition && hasTarget("source");
      if (construction.id === "agreement_target") return model.hasAgreement && hasTarget("supporter");
      if (construction.id === "evidence_source") return model.hasEvidence && hasTarget("source");
      if (construction.id === "coordination") return (model.anchorTargets || []).length >= 2;
      if (["evaluation_target", "vocative", "prefixed_clause"].includes(construction.id)) return model.hasChallenge && hasTarget("opponent");
      return Boolean(model.replyTarget || (model.anchorTargets || []).length);
    });
  }

  render(constructionId, context) {
    const target = context.target;
    if (!anchorConstructions[constructionId]) return "";
    if (constructionId === "coordination") {
      const targets = (context.targets || []).filter(Boolean).slice(0, 3);
      return targets.length >= 2 ? `${targets.map((value) => `>>${value}`).join("と")}は${context.evaluation || "賢い"}` : "";
    }
    if (!target) return "";
    if (constructionId === "fused_performative") {
      return `${context.recognition || "今回のでそれが良くわかったよ"}>>${target}感謝`;
    }
    if (constructionId === "agreement_target") return `俺は>>${target}の意見に賛成だな`;
    if (constructionId === "evidence_source") return `これは>>${target}が証明しているとおり`;
    if (constructionId === "evaluation_target") return `>>${target}は${context.evaluation || "かなりののう力者だろうな"}`;
    if (constructionId === "vocative") return `>>${target}よ、${context.message || "勝手にライバル視するな"}`;
    if (constructionId === "embedded_argument") return `これは>>${target}の言うように${context.claim || "事実"}`;
    if (constructionId === "sentence_tail_reference") return `${context.claim || "この結果がすべて"}>>${target}`;
    if (constructionId === "prefixed_clause") return `>>${target}${context.claim || "は話を理解するべき"}`;
    return `>>${target}`;
  }

  signatures(text) {
    const value = String(text ?? "").normalize("NFKC");
    const signatures = [];
    const add = (id, pattern) => {
      if (pattern.test(value) && !signatures.includes(id)) signatures.push(id);
    };
    add("fused_performative", />>[^\s\n、。！？!?]{1,24}感謝/);
    add("agreement_target", />>[^\s\n、。！？!?]{1,24}(?:の意見)?に(?:賛成|同意)/);
    add("evidence_source", />>[^\s\n、。！？!?]{1,24}(?:が|の).{0,24}(?:証明|証拠|示して)/);
    add("evaluation_target", />>[^\s\n、。！？!?]{1,24}(?:は|が).{0,30}(?:能力者|のう力者|賢い|強い|正しい)/);
    add("coordination", />>[^\s\n、。！？!?]{1,24}(?:と|、)>>[^\s\n、。！？!?]{1,24}/);
    add("vocative", />>[^\s\n、。！？!?]{1,24}(?:よ|へ)[、,]/);
    if (!signatures.includes("agreement_target")) {
      add("embedded_argument", />>[^\s\n、。！？!?]{1,24}の(?:言う|話)/);
    }
    add("sentence_tail_reference", /(?:この判断の元になった説明も正しかった|この結果がすべて)>>(?![^\n]*感謝)[^\s\n、。！？!?]{1,24}(?:\s|$)/);
    if (!signatures.includes("evaluation_target")
      && !signatures.includes("agreement_target")
      && !signatures.includes("evidence_source")) {
      add("prefixed_clause", /(?:^|\n)>>[^\s\n、。！？!?]{1,24}(?:は|が|も)/);
    }
    add("standalone_reply", /(?:^|\n)>>[^\s\n、。！？!?]{1,24}(?:\s|$)/);
    return signatures;
  }

  status() {
    return {
      constructionCount: constructionList().length,
      observedAnchorCount: constructionList().reduce((sum, item) => sum + item.observedCount, 0),
      constructions: constructionList().map((item) => item.id),
    };
  }
}

module.exports = { AnchorGrammar, cleanTarget, explicitTarget, kanaGoro };
