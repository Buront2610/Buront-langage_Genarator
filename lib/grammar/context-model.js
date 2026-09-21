"use strict";

const { extractProtectedValues, splitSentences } = require("../text-analysis");

function stripEnding(value) {
  return String(value ?? "").trim().replace(/[。！？!?]+$/g, "");
}

function stripLeadingConnective(value) {
  return stripEnding(value).replace(/^(?:ただし|しかし|なお|ところが|そこで|一方で)[、,]?\s*/, "");
}

function stripNegatedProblemExpressions(value) {
  return String(value ?? "")
    .replace(/(?:失敗|停止|障害|不具合|問題|不足|遅延)(?:する|した)?ことはなかった/g, "")
    .replace(/(?:停止|障害|不具合|問題|遅延)(?:は|が|も)?(?:発生|発覚|起き|生じ|見つか)(?:し)?(?:なかった|ていない|ない|せず|なく)/g, "")
    .replace(/(?:失敗|停止|障害|不具合|問題|不足|遅延)(?:は|が|も|を)?(?:し)?(?:なかった|ていない|ない|せず|なく)/g, "")
    .replace(/(?:消え|壊れ|切れ|倒され|奪われ|紛失し)(?:なかった|ていない|ない|ず)/g, "")
    .replace(/(?:間に合わ)(?:ないわけではない|なかったわけではない)/g, "");
}

function stripUnrealizedAchievements(value) {
  return String(value ?? "")
    .replace(/(?:完了|成功|完成|提出|解決|復旧|回復|改善|勝利|達成|修理|修正|解消)(?:(?:の)?(?:予定|時刻|見込み|見通し|目処|めど|方針))?.{0,14}(?:決まっていない|立っていない|立たない|未定|していない|できない|しない|なかった|なく|ない)/g, "")
    .replace(/まだ.{0,12}(?:完了|成功|完成|提出|解決|復旧|回復|達成|修正)していない/g, "");
}

function achievementScore(sentence) {
  const value = stripUnrealizedAchievements(sentence);
  let score = 0;
  if (/完了|成功|完成|提出|解決|復旧|回復|改善|短縮|勝利|達成|修理|修正|直した|解消|到着|決まった|まとまった|消え|収ま|落ち着|全滅|撃退|退け|消滅|救出|切り抜け|満点|100点|一番(?:に|を)?(?:なった|取った)|一位|首位/.test(value)) score += 6;
  if (/間に合った|提出できた|予定より早|使える状態に戻った|取り返し|おかわり|感謝|評価|褒め|早かったと言われ/.test(value)) score += 5;
  if (/わかった|分かった|理解でき|判明|納得|助かった/.test(value)) score += 4;
  if (/\d+(?:分|時間|件|人|秒).{0,18}(?:から|より).{0,18}\d+(?:分|時間|件|人|秒)/.test(value)) score += 6;
  if (/作った|作成した|実装した|導入した|用意した|切り替えた|完成させた/.test(value)) score += 4;
  if (/作りました|作成しました|実装しました|導入しました|用意しました|切り替えました|完成させました/.test(value)) score += 6;
  if (/導入|実装|作成|作った|行った|実行|開始/.test(value)) score += 2;
  if (/^(?:その結果|結果として)/.test(value)) score += 3;
  if (/原因は|設定ミス|できな|間に合わな|停止|遅れ|倒され|奪われ|焦げ|誤っ|失敗|残って/.test(value)) score -= 5;
  if (/予定(?!(?:より|していた|しており|通り|どおり))|明日|来週|来月|来年|後日|今後|これから/.test(value)) score -= 8;
  return score;
}

function actionScore(sentence) {
  const value = stripEnding(sentence);
  if (!/導入|実装|作成|分類|修正|復旧作業|対策|調整|組み立て|作った|作り|用意|切り替え|構築|開発|自動化|追加|組ん|画面を作/.test(value)) {
    return -Infinity;
  }
  let score = 1;
  if (/(?:俺|私|僕|自分)(?:は|が).{0,80}(?:導入|実装|作成|修正|対策|調整|作った|作り|用意|切り替え|構築|開発|自動化|追加|組ん|画面を作)/.test(value)) score += 8;
  if (/作った|作成した|実装した|導入した|用意した|切り替えた|修正した|組んだ/.test(value)) score += 3;
  if (/早く.{0,8}(?:作って|用意して).{0,8}(?:と|って)|(?:作って|用意して)と(?:頼|叫|言)/.test(value)) score -= 8;
  if (isProblemFact(value) && !/(?:俺|私|僕|自分)(?:は|が)/.test(value)) score -= 6;
  return score;
}

function isProblemFact(sentence) {
  return /できな|できそうにな|分からな|まとまらな|間に合わ|間に合いそうにな|間に合いそうもない|終わっていな|未完了|追われ|混雑|長い列|待ち時間.{0,12}(?:長|増)|問題|失敗|衝突|見失|迷っ|視界|濃霧|煙|火が上|遅れ|遅延|処理待ち|原因.{0,12}(?:分から|わから)|停止|切れ|切断|消え|残って|倒され|奪われ|焦げ|誤っ|警告|エラー|異常|不具合|障害|不足|壊れ|剥がれ|寒気|恐怖|恐い|怖い|違和感|おかしい|死体|襲|吊ろう|吊り上げ|かじか|紛失/.test(
    stripNegatedProblemExpressions(sentence),
  );
}

function personaFor(text) {
  if (/開発|ツール|システム|プログラ|コード|修正版|サーバー|復旧|監視|自動|タブレット|受付画面|データ/.test(text)) return "ﾌﾟﾛｸﾞﾗﾏｰ";
  if (/ゲーム|武器|攻撃|プレイヤー|勝|負け/.test(text)) return "ﾌﾟﾚｲﾔｰ";
  if (/料理|カレー|炒め|煮込|焼い|鍋/.test(text)) return "料理人";
  if (/会社|会議|仕事|報告|資料|担当/.test(text)) return "会社員";
  return "ナイト";
}

function topicFor(text) {
  if (/寒|冷た|かじか/.test(text)) return "寒さ";
  if (/暑|熱中/.test(text)) return "暑さ";
  if (/雨|豪雨/.test(text)) return "雨";
  if (/風が.{0,4}強|強風|風で.{0,10}(?:歩けな|進めな|倒れ|飛ばされ)|風に(?:煽ら|飛ばされ)|(?:手|体|身体|顔|耳|指|足).{0,8}風で.{0,8}(?:寒|冷)/.test(text)) return "風";
  if (/疲|だる/.test(text)) return "疲労";
  if (/眠い|眠く|眠気|眠かっ|寝不足/.test(text)) return "眠気";
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
    const futureIndex = sentences.findIndex((sentence) => (
      /予定(?!(?:より|していた|しており|通り|どおり))|明日|来週|来月|来年|次回|後日|今後|これから|対策|公開/.test(sentence)
      && !/予定.{0,16}(?:キャンセル|中止|なくな|消え)/.test(sentence)
    ));
    const scoredAchievements = sentences
      .map((sentence, index) => ({ index, score: achievementScore(sentence) }))
      .sort((left, right) => right.score - left.score || left.index - right.index);
    const hasAchievement = scoredAchievements[0]?.score >= 4;
    const achievementIndex = hasAchievement ? scoredAchievements[0].index : -1;
    const problemIndex = sentences.findIndex((sentence, index) => (
      index > achievementIndex && index !== futureIndex && isProblemFact(sentence)
    ));
    const initialProblemIndex = sentences.findIndex((sentence, index) => (
      index <= (achievementIndex >= 0 ? achievementIndex : sentences.length - 1) && isProblemFact(sentence)
    ));
    const scoredActions = sentences
      .map((sentence, index) => ({ index, score: actionScore(sentence) }))
      .filter(({ index }) => index > 0 && (achievementIndex < 0 || index <= achievementIndex))
      .sort((left, right) => right.score - left.score || left.index - right.index);
    const actionIndex = scoredActions[0]?.score > 0 ? scoredActions[0].index : -1;
    const protectedValues = extractProtectedValues(source);
    const hasChallenge = /相手|対戦|批判|反対|文句|否定|言い争|勝負|ライバル|敵|挑発|張り合|競争/.test(text)
      || /(?:自分|俺|私|僕)の方が.{0,18}(?:速|早|強|上手|優|できる|正しい).{0,18}(?:言|主張|豪語)/.test(text);
    const hasGratitude = /感謝|ありがと|助かった|おかげ|礼を言/.test(text);
    const hasRecognition = /わか(?:った|って|り)|分か(?:った|って|り)|理解|判明|気づ|知った|納得|原因が見え/.test(text);
    const hasAgreement = /賛成|同意|支持|同じ意見|正しいと思|納得/.test(text);
    const hasEvidence = sentences.some((sentence) => {
      const evidenceScanText = sentence.replace(/確認でき(?:ない|ず|なく|なかった|ていない)/g, "");
      return /証拠|証明|結果が示|確認でき|明らか|(?:データ|ログ|記録).{0,35}(?:原因|障害|停止|事実|結果).{0,20}(?:確認|判明|示)/.test(evidenceScanText);
    });
    const hasRoleTarget = (role) => anchorAnalysis.targets.some((target) => target.roles.has(role));
    const hasExplicitTarget = Boolean(anchorAnalysis.explicitTarget);
    const hasDeadline = /残り\d|締切|期限|間に合|時間切れ|今日中|明日まで|予定(?!より)/.test(text);
    const problemScanText = stripNegatedProblemExpressions(text);
    const missingScanText = problemScanText.replace(/(?:でき|使え|見られ|確認でき)なくな/g, "");
    const hasMissing = /不足|紛失|消え|見つから|いくえ|(?:ファイル|商品|データ|在庫|鍵|書類|資料|荷物|部品|記録|保存内容).{0,12}なくな/.test(missingScanText);
    const hasDanger = /危険|障害|停止|壊れ|倒され|奪われ|できな|失敗|切れ|恐怖|恐い|怖い|死体|襲|吊ろう|吊り上げ/.test(problemScanText);
    const hasPressure = /追われ|混雑|長い列|待ち時間.{0,12}(?:長|増)|作業.{0,16}(?:遅れ|遅延)/.test(problemScanText);
    const hasUnresolved = /(?:まだ|引き続き).{0,30}(?:できない|分からない|わからない|未解決|処理待ち)|(?:復旧|解決)(?:の)?(?:予定|時刻|見込み|見通し|目処|めど)?.{0,16}(?:決まっていない|立っていない|立たない|未定|していない|できない|なく|ない)|原因(?:は|が|も)?(?:まだ)?(?:分から|わから|分かっていない|わかっていない)/.test(text);
    const hasFuture = futureIndex >= 0;
    const topic = topicFor(text);
    const evaluation = evaluationFor(text);
    const hasCrisis = (initialProblemIndex >= 0 || hasUnresolved)
      && (hasDeadline || hasMissing || hasDanger || hasUnresolved || hasPressure);
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
                  : hasFuture
                    ? "future"
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
      hasPressure,
      hasUnresolved,
      hasFuture,
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
  actionScore,
  isProblemFact,
  stripEnding,
  stripLeadingConnective,
};
