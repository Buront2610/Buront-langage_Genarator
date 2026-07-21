"use strict";

const segmenter = new Intl.Segmenter("ja", { granularity: "word" });

const stopWords = new Set([
  "こと", "これ", "それ", "あれ", "ため", "もの", "よう", "ところ",
  "いる", "ある", "する", "なる", "れる", "られる", "せる", "させる",
  "です", "ます", "でした", "ました", "ない", "だ", "で", "た",
  "は", "が", "を", "に", "へ", "と", "も", "の", "から", "まで",
  "より", "や", "か", "ね", "よ", "な", "し", "て", "でしょ",
]);

const intentPatterns = Object.freeze({
  anger: /怒|むかつ|腹が立|不愉快|うざ|ウザ|嫌|憎|許せ/,
  conflict: /勝|負け|戦|攻撃|防御|敵|倒|弱|強|殴|蹴|ボコ|競争/,
  praise: /良い|すご|素晴|見事|上手|優秀|尊敬|感心|褒め|最高/,
  criticism: /悪い|だめ|駄目|下手|間違|馬鹿|愚か|問題|失敗/,
  achievement: /成功|実力|仕事|達成|完成|手に入|取得|合格|勝利/,
  timing: /時間|遅|早|一瞬|間に合|開始|終了|急|速度|すぐ/,
  social: /仲間|友達|家族|同僚|みんな|全員|信頼|人気|学校|会社/,
  explanation: /理由|証拠|事実|真実|説明|論理|理解|判明|明らか/,
  request: /お願い|頼|ください|してほしい|必要|べき|なければ/,
  uncertainty: /たぶん|多分|おそらく|かもしれ|思う|気がする/,
  temperature: /寒|冷え|気温|低温|鳥肌/,
});

function normalizeForSearch(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/(?:>>|＞＞)\s*\d+/g, " ")
    .replace(/(?:>>|＞＞)\s*[a-zぁ-んァ-ヶ一-龠々ー]{1,20}(?=\s|$)/g, " ")
    .replace(/[\s\u3000]+/g, " ")
    .trim();
}

function normalizeForPresence(value) {
  return normalizeForSearch(value)
    .replace(/[\s。、，．！？!?「」『』（）()【】\[\]]+/g, "");
}

function splitSentences(value) {
  const source = String(value ?? "")
    .replace(/^\s*(?:>>|＞＞)\s*\d+\s*/gm, "")
    .replace(/^\s*(?:>>|＞＞)\s*[A-Za-zぁ-んァ-ヶ一-龠々ー]{1,20}(?=\s|$)\s*/gm, "")
    .replace(/\r/g, "")
    .trim();

  if (!source) return [];

  const sentences = [];
  for (const line of source.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const chunks = trimmed.match(/[^。！？!?]+[。！？!?]?/g) || [trimmed];
    for (const chunk of chunks) {
      const sentence = chunk.trim();
      if (sentence.length >= 2) sentences.push(sentence);
    }
  }
  return sentences;
}

function tokenize(value, options = {}) {
  const contentOnly = options.contentOnly === true;
  const normalized = normalizeForSearch(value);
  const tokens = [];

  for (const part of segmenter.segment(normalized)) {
    const token = part.segment.trim();
    if (!token || /^[\p{P}\p{S}]+$/u.test(token)) continue;
    if (contentOnly && (stopWords.has(token) || token.length === 1 && /^[ぁ-ん]$/.test(token))) continue;
    tokens.push(token);
  }
  return tokens;
}

function intentTags(value) {
  const text = String(value ?? "");
  const tags = Object.entries(intentPatterns)
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);
  return tags.length ? tags : ["general"];
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function extractFeatures(value) {
  const text = String(value ?? "");
  const length = Math.max(1, text.replace(/\s/g, "").length);
  const sentences = splitSentences(text);
  const tokens = tokenize(text);
  const uniqueTokens = new Set(tokens);

  return {
    length: text.length,
    sentenceCount: sentences.length,
    averageSentenceLength: Number((sentences.reduce((sum, item) => sum + item.length, 0) / Math.max(1, sentences.length)).toFixed(4)),
    halfwidthKanaRate: Number((countMatches(text, /[ｦ-ﾟ]/g) / length).toFixed(6)),
    fullwidthLatinRate: Number((countMatches(text, /[Ａ-Ｚａ-ｚ]/g) / length).toFixed(6)),
    firstPersonRate: Number((countMatches(text, /俺|おれ|僕|私/g) / length).toFixed(6)),
    secondPersonRate: Number((countMatches(text, /お前|おまえ|お前ら|お前等/g) / length).toFixed(6)),
    connectiveRate: Number((countMatches(text, /やはり|しかも|さらに|だが|なので|だから|ところが|すると|その結果/g) / length).toFixed(6)),
    certaintyRate: Number((countMatches(text, /明らか|確実|絶対|真実|事実|決ま|間違いない|高確率/g) / length).toFixed(6)),
    comparisonRate: Number((countMatches(text, /最強|圧倒|一級|一般人|格|ランク|上|下|より|違い/g) / length).toFixed(6)),
    amplificationRate: Number((countMatches(text, /かなり|超|最強|圧倒|絶望|致命|ものすご|すさまじ|大量|巨大/g) / length).toFixed(6)),
    parentheticalRate: Number((countMatches(text, /（[^）]*）|\([^)]*\)/g) / Math.max(1, sentences.length)).toFixed(6)),
    questionRate: Number((countMatches(text, /[？?]/g) / Math.max(1, sentences.length)).toFixed(6)),
    punctuationRate: Number((countMatches(text, /[。、！？!?]/g) / length).toFixed(6)),
    lexicalDiversity: Number((uniqueTokens.size / Math.max(1, tokens.length)).toFixed(6)),
  };
}

function aggregateFeatures(items) {
  const featureRows = items.map(extractFeatures);
  if (!featureRows.length) return {};
  const keys = Object.keys(featureRows[0]).filter((key) => key !== "length");
  const result = {};

  for (const key of keys) {
    const values = featureRows.map((row) => row[key]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    result[key] = {
      mean: Number(mean.toFixed(6)),
      standardDeviation: Number(Math.sqrt(variance).toFixed(6)),
    };
  }
  return result;
}

function ngrams(value, size) {
  const text = `^${normalizeForSearch(value).replace(/\s+/g, "")}$`;
  const result = [];
  for (let index = 0; index <= text.length - size; index += 1) {
    result.push(text.slice(index, index + size));
  }
  return result;
}

function buildNgramModel(items, options = {}) {
  const sizes = options.sizes || [3, 4];
  const limitPerSize = options.limitPerSize || 18000;
  const models = {};

  for (const size of sizes) {
    const counts = new Map();
    let total = 0;
    for (const item of items) {
      for (const gram of ngrams(item, size)) {
        if (/^[一-龠々]+$/.test(gram)) continue;
        counts.set(gram, (counts.get(gram) || 0) + 1);
        total += 1;
      }
    }
    const entries = Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, limitPerSize);
    models[size] = {
      total,
      vocabulary: counts.size,
      counts: Object.fromEntries(entries),
    };
  }
  return models;
}

function scoreNgrams(value, model) {
  const scores = [];
  for (const [sizeValue, data] of Object.entries(model || {})) {
    const size = Number(sizeValue);
    const grams = ngrams(value, size);
    if (!grams.length) continue;
    const denominator = data.total + data.vocabulary;
    let logProbability = 0;
    for (const gram of grams) {
      logProbability += Math.log(((data.counts && data.counts[gram]) || 0) + 1) - Math.log(denominator);
    }
    scores.push(logProbability / grams.length);
  }
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : -20;
}

function extractProtectedValues(value) {
  const text = String(value ?? "");
  const patterns = [
    /https?:\/\/[^\s]+/g,
    /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,
    /[0-9０-９]+(?:[.,．，][0-9０-９]+)?(?:[%％円年月日時分秒個枚人回点件歳才])?/g,
    /[A-ZＡ-Ｚ]{2,}[A-ZＡ-Ｚ0-9０-９_-]*/g,
  ];
  return patterns.flatMap((pattern) => text.match(pattern) || []);
}

module.exports = {
  aggregateFeatures,
  buildNgramModel,
  extractFeatures,
  extractProtectedValues,
  intentTags,
  ngrams,
  normalizeForPresence,
  normalizeForSearch,
  scoreNgrams,
  splitSentences,
  tokenize,
};
