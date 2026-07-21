"use strict";

const { extractProtectedValues, splitSentences } = require("../text-analysis");

function stripEnding(value) {
  return String(value ?? "").trim().replace(/[。！？!?]+$/g, "");
}

function stripLeadingConnective(value) {
  return stripEnding(value).replace(/^(?:ただし|しかし|なお|ところが|そこで|一方で)[、,]?\s*/, "");
}

function achievementScore(sentence) {
  const value = String(sentence ?? "");
  let score = 0;
  if (/完了|成功|完成|提出|解決|復旧|回復|改善|短縮|勝利|達成|修理|修正|直した|解消|到着|満点|100点|一番/.test(value)) score += 6;
  if (/間に合った|使える状態に戻った|取り返し|おかわり|感謝|評価|褒め|早かったと言われ/.test(value)) score += 5;
  if (/わかった|分かった|理解でき|判明|納得|助かった/.test(value)) score += 4;
  if (/\d+(?:分|時間|件|人|秒).{0,18}(?:から|より).{0,18}\d+(?:分|時間|件|人|秒)/.test(value)) score += 4;
  if (/導入|実装|作成|作った|行った|実行|開始/.test(value)) score += 2;
  if (/原因は|設定ミス|できな|間に合わな|停止|遅れ|倒され|奪われ|焦げ|誤っ|失敗|残って/.test(value)) score -= 5;
  if (/予定|明日|来週|今後/.test(value)) score -= 3;
  return score;
}

function isProblemFact(sentence) {
  return /できな|間に合わ|問題|失敗|遅れ|停止|切れ|残って|倒され|奪われ|焦げ|誤っ|不具合|障害|不足|壊れ|剥がれ|寒|かじか|紛失/.test(sentence);
}

function personaFor(text) {
  if (/開発|ツール|システム|プログラ|コード|修正版|サーバー|復旧|監視/.test(text)) return "ﾌﾟﾛｸﾞﾗﾏｰ";
  if (/ゲーム|武器|攻撃|プレイヤー|勝|負け/.test(text)) return "ﾌﾟﾚｲﾔｰ";
  if (/料理|カレー|炒め|煮込|焼い|鍋/.test(text)) return "料理人";
  if (/会社|会議|仕事|報告|資料|担当/.test(text)) return "会社員";
  return "ナイト";
}

function topicFor(text) {
  if (/寒|冷た|かじか/.test(text)) return "寒さ";
  if (/暑|熱中/.test(text)) return "暑さ";
  if (/雨|豪雨/.test(text)) return "雨";
  if (/風/.test(text)) return "風";
  if (/疲|だる/.test(text)) return "疲労";
  if (/眠/.test(text)) return "眠気";
  return "その程度の状況";
}

function evaluationFor(text) {
  const entries = [
    [/つまらな|面白くな/, { polarity: "negative", noun: "貧弱さ" }],
    [/不便|使いにく|まずい|弱い|悪い|ひどい/, { polarity: "negative", noun: "貧弱さ" }],
    [/面白|おもしろ/, { polarity: "positive", noun: "面白さ" }],
    [/楽しい|楽し/, { polarity: "positive", noun: "楽しさ" }],
    [/便利|使いやす/, { polarity: "positive", noun: "便利さ" }],
    [/美味|おいし|うまい/, { polarity: "positive", noun: "うまさ" }],
    [/強い|優れ|素晴らし|すごい|良い|いい/, { polarity: "positive", noun: "良さ" }],
  ];
  return entries.find(([pattern]) => pattern.test(text))?.[1] || null;
}

class ContextModelExtractor {
  constructor(anchorGrammar) {
    this.anchorGrammar = anchorGrammar;
  }

  extract(source, plainFacts = []) {
    const sentences = splitSentences(source);
    const text = String(source ?? "");
    const facts = plainFacts.map(stripEnding).filter(Boolean);
    const persona = personaFor(text);
    const object = ["報告書", "資料", "修正版", "管理ツール", "ツール", "サーバー", "カレー", "料理", "計画", "仕事", "会議", "武器", "ゲーム"]
      .find((candidate) => text.includes(candidate)) || "状況";
    const audienceBase = text.match(/事務|社員|担当者|開発チーム|チーム|営業部|同僚|仲間|家族/)?.[0]
      || (/報告書|資料|会議/.test(text) ? "事務" : "一般人");
    const anchorAnalysis = this.anchorGrammar.analyze(text, audienceBase);
    const futureIndex = sentences.findIndex((sentence) => /予定(?!より)|明日|来週|今後|対策|公開/.test(sentence));
    const scoredAchievements = sentences
      .map((sentence, index) => ({ index, score: achievementScore(sentence) }))
      .sort((left, right) => right.score - left.score || left.index - right.index);
    const hasAchievement = scoredAchievements[0]?.score > 0;
    const achievementIndex = hasAchievement ? scoredAchievements[0].index : -1;
    const problemIndex = sentences.findIndex((sentence, index) => (
      index > achievementIndex && index !== futureIndex && isProblemFact(sentence)
    ));
    const initialProblemIndex = sentences.findIndex((sentence, index) => (
      index <= (achievementIndex >= 0 ? achievementIndex : sentences.length - 1) && isProblemFact(sentence)
    ));
    const actionIndex = sentences.findIndex((sentence, index) => (
      index > 0
      && index < achievementIndex
      && /導入|実装|作成|分類|修正|復旧作業|対策|調整|組み立て|作った/.test(sentence)
      && !isProblemFact(sentence)
    ));
    const protectedValues = extractProtectedValues(source);
    const hasChallenge = /相手|対戦|批判|反対|文句|否定|言い争|勝負|ライバル|敵|挑発|張り合|競争/.test(text);
    const hasGratitude = /感謝|ありがと|助かった|おかげ|礼を言/.test(text);
    const hasRecognition = /わか(?:った|って)|分か(?:った|って)|理解|判明|気づ|知った|納得|原因が見え/.test(text);
    const hasAgreement = /賛成|同意|支持|同じ意見|正しいと思|納得/.test(text);
    const hasEvidence = /証拠|証明|データ|ログ|記録|結果が示|確認でき|明らか/.test(text);
    const hasRoleTarget = (role) => anchorAnalysis.targets.some((target) => target.roles.has(role));
    const hasExplicitTarget = Boolean(anchorAnalysis.explicitTarget);
    const hasDeadline = /残り\d|締切|期限|間に合|時間切れ|今日中|明日まで|予定(?!より)/.test(text);
    const missingScanText = text.replace(/(?:でき|使え|見られ|確認でき)なくな/g, "");
    const hasMissing = /不足|なくな|紛失|消え|見つから|いくえ/.test(missingScanText);
    const hasDanger = /危険|障害|停止|壊れ|倒され|奪われ|できな|失敗|切れ/.test(text);
    const topic = topicFor(text);
    const evaluation = evaluationFor(text);
    const hasCrisis = initialProblemIndex >= 0 && (hasDeadline || hasMissing || hasDanger);
    const eventFrame = hasChallenge
      ? "challenge"
      : hasGratitude && hasRecognition && (hasRoleTarget("source") || hasExplicitTarget)
        ? "gratitude"
        : hasAgreement && (hasRoleTarget("supporter") || hasExplicitTarget)
          ? "agreement"
          : hasEvidence && (hasRoleTarget("source") || hasExplicitTarget)
            ? "evidence"
            : hasAchievement && hasCrisis
              ? "rescue"
              : hasAchievement
                ? "achievement"
                : hasCrisis
                  ? "crisis"
                  : topic !== "その程度の状況"
                    ? "state"
                    : evaluation
                      ? "evaluation"
                      : "observation";
    return {
      source: text,
      facts,
      persona,
      object,
      audience: `${audienceBase.replace(/チーム$/, "ﾒﾝ")}ども`.replace(/ﾒﾝども$/, "ﾒﾝ"),
      audienceBase,
      anchorTargets: anchorAnalysis.targets,
      replyTargets: anchorAnalysis.targets.filter((target) => target.roles.has("opponent") || target.roles.has("any")).map((target) => target.value),
      goroTargets: anchorAnalysis.goroTargets,
      replyTarget: anchorAnalysis.explicitTarget,
      problemIndex,
      initialProblemIndex,
      achievementIndex,
      actionIndex,
      futureIndex,
      hasAchievement,
      topic,
      evaluationPolarity: evaluation?.polarity || null,
      evaluationNoun: evaluation?.noun || null,
      protectedValues,
      hasInitialCrisis: initialProblemIndex >= 0,
      hasAftershock: problemIndex >= 0,
      hasChallenge,
      hasDeadline,
      hasMissing,
      hasDanger,
      hasCrisis,
      hasDialogue: /[「『].+[」』]/.test(text),
      hasPraise: /褒め|感謝|驚|尊敬|評価|言われ|おかわり/.test(text),
      hasNumbers: protectedValues.length > 0,
      hasGratitude,
      hasRecognition,
      hasAgreement,
      hasEvidence,
      eventFrame,
    };
  }
}

module.exports = {
  ContextModelExtractor,
  achievementScore,
  isProblemFact,
  stripEnding,
  stripLeadingConnective,
};
