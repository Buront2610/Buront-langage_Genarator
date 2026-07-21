"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  extractFeatures,
  extractProtectedValues,
  intentTags,
  normalizeForSearch,
  scoreNgrams,
  splitSentences,
  tokenize,
} = require("./text-analysis");
const { VariationGrammar, createRandom } = require("./variation-grammar");
const { ContextNarrativeGenerator } = require("./context-narrative");
const { FaithfulQuoteGrammar } = require("./grammar/faithful-quote-grammar");
const { EraGrammar } = require("./grammar/era-grammar");
const { EraProfileRegistry } = require("./era-profiles");
const { TfidfCentroidClassifier, TfidfKnnClassifier, TfidfSearchIndex } = require("./vector-space");

const ROOT = path.resolve(__dirname, "..");
const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
const vectorModelCache = new Map();

const conceptGroups = [
  ["first-person", "私", "わたし", "僕", "ぼく", "俺", "おれ"],
  ["second-person", "あなた", "君", "きみ", "お前", "おまえ"],
  ["intensity", "とても", "非常に", "すごく", "かなり", "圧倒的", "あまりにも", "あもりにも"],
  ["everyone", "全員", "ぜいいん", "みんな", "皆さん", "お前ら", "お前等"],
  ["speed", "速い", "早い", "急ぐ", "急いで", "すぐ", "素早い", "一瞬", "ソッコー", "ｶｶッ"],
  ["strength", "強い", "強さ", "最強", "実力", "能力", "優秀", "上手", "パワー"],
  ["weakness", "弱い", "下手", "無力", "劣る", "失敗", "だめ", "駄目"],
  ["praise", "良い", "すごい", "素晴らしい", "見事", "感心", "尊敬", "褒める"],
  ["anger", "怒る", "怒り", "怒って", "有頂天", "腹が立つ", "むかつく", "不愉快", "許せない"],
  ["surprise", "驚く", "びっくり", "ビックリ", "動揺", "青ざめる", "ビビる"],
  ["victory", "勝つ", "勝利", "成功", "達成", "合格", "完成"],
  ["defeat", "負ける", "負けない", "敗北", "失敗", "倒される", "遅れをとる"],
  ["certainty", "明らか", "確実", "絶対", "事実", "真実", "間違いない"],
  ["people", "普通の人", "一般人", "みんな", "全員", "周り", "相手"],
  ["request", "お願い", "頼む", "ください", "必要", "してほしい", "べき"],
  ["late", "手遅れ", "間に合わない", "遅い", "時間切れ", "終了"],
  ["fatal", "致命傷", "致命的な致命傷"],
  ["cold", "寒い", "寒さ", "寒気", "冷える", "冷え", "冷え込み", "冷気", "気温が低い", "気温", "低温", "凍える", "震え", "体温", "防寒"],
];

const tokenConcept = new Map();
for (const [concept, ...members] of conceptGroups) {
  for (const member of members) tokenConcept.set(normalizeForSearch(member), concept);
}

const safeReplacements = [
  [/私は(?=[、。！？!?\s]|$|[はがのをも])/g, "俺は"],
  [/私(?=[はがのをも])/g, "俺"],
  [/僕(?=[はがのをも])/g, "おれ"],
  [/あなたたち|あなた達|皆さん|みなさん/g, "お前ら"],
  [/と思います/g, "と思う"],
  [/間に合いませんでした/g, "間に合わなかった"],
  [/ありませんでした/g, "なかった"],
  [/できませんでした/g, "できなかった"],
  [/しませんでした/g, "しなかった"],
  [/してくれました/g, "してくれた"],
  [/くれました/g, "くれた"],
  [/ありました/g, "あった"],
  [/なりました/g, "なった"],
  [/しました/g, "した"],
  [/してくれます/g, "してくれる"],
  [/くれます/g, "くれる"],
  [/あります/g, "ある"],
  [/なります/g, "なる"],
  [/します/g, "する"],
  [/しています/g, "している"],
  [/ていました/g, "ていた"],
  [/ています/g, "ている"],
  [/になります/g, "になる"],
  [/できます/g, "できる"],
  [/ありません/g, "ない"],
  [/でした/g, "だった"],
  [/でしょうか/g, "だろうか"],
  [/でしょう/g, "だろう"],
  [/ですけれども|ですけれど|ですけど/g, "だけど"],
  [/ですが/g, "だが"],
  [/してください/g, "するべき"],
  [/([ぁ-ん一-龠々])いです(?=[。、！？!?\s]|$)/g, "$1い"],
  [/です(?=[。、！？!?\s]|$)/g, "だ"],
  [/ということ/g, "と言う事"],
];

const mediumReplacements = [
  [/とても|非常に|すごく/g, "かなり"],
  [/あまりにも/g, "あもりにも"],
  [/どちらか/g, "どちか"],
  [/すぎる/g, "すぐる"],
  [/全員/g, "ぜいいん"],
  [/よくある/g, "稀によくある"],
  [/普通の人/g, "貧弱一般人"],
  [/上級者|熟練者/g, "一級ﾌﾟﾚｲﾔｰ"],
  [/プレイヤー|プレーヤー/g, "ﾌﾟﾚｲﾔｰ"],
  [/プレイヤースキル|プレーヤースキル/g, "ﾌﾟﾚｲﾔｰｽｷﾙ"],
  [/スキル/g, "ｽｷﾙ"],
  [/ジョブ/g, "ｼﾞｮﾌﾞ"],
  [/ダメージ/g, "ﾀﾞﾒｰｼﾞ"],
  [/パーティー|パーティ/g, "PT"],
  [/ソッコー|素早く|すばやく|急いで/g, "ｶｶッっと"],
  [/びっくりした|ビックリした|驚きました|驚いた/g, "リアルでビビった"],
  [/俺は(?:かなり|とても)?怒っている/g, "俺の怒りが有頂天になった"],
  [/手遅れ(?:だ)?|もう間に合わない/g, "時既に時間切れ"],
  [/致命傷/g, "致命的な致命傷"],
  [/絶対に負けない(?:だろう)?/g, "遅れをとるはずは無い"],
];

const faithfulSurfaceReplacements = mediumReplacements.filter(([, replacement]) => (
  replacement !== "リアルでビビった"
));

const strongReplacements = [
  [/私は(?:かなり|とても)?怒って(?:いる|います)/g, "俺の怒りが有頂天になった"],
  [/怒りました|怒った/g, "怒りが有頂天になった"],
  [/ずるい|卑怯(?:だ|です)?/g, "汚いなさすが忍者きたない"],
  [/明らか(?:だ|です)?/g, "確定的に明らか"],
  [/一番強い|最も強い/g, "一番最強"],
  [/すごい(?=[。、！？!?\s]|$)/g, "破壊力ばつ牛ﾝ"],
  [/頭がおかしい/g, "頭がおかしくなって死ぬ"],
];

const styleMarkers = /やはり|しかも|さらに|圧倒|最強|一級|一般人|リアル|事実|真実|明らか|ｶｶッ|アワレ|有頂天|ばつ牛ﾝ|と言う事|だろうな|らしい|あもりにも|すぐる|冷え込み|震え|体温|防寒|凍え/g;

const styleDimensionPatterns = Object.freeze({
  viewpoint: /俺|おれ|お前|おまえ/,
  orthography: /[ｦ-ﾟ]|ぜいいん|すぐる|どちか|あもりにも/,
  connective: /やはり|しかも|さらに|だが|という話なんだが/,
  certainty: /事実|真実|明らか|決ま|高確率|確実/,
  amplification: /かなり|圧倒|最強|一級|超|致命的|絶望的|あもりにも|すぐる|本気を出/,
  signature: /有頂天|時既に|ｶｶッ|ばつ牛ﾝ|忍者きたない|アワレ|遅れをとる|騒ぐと危険/,
  reaction: /リアルでビビ|顔真っ赤|青ざめ|眼差し|らしい|震え|指先|手足|体温|吐く息|身体の動き/,
  rank: /一般人|一級|ランク|格の違い/,
});

function styleDimensions(text) {
  return new Set(
    Object.entries(styleDimensionPatterns)
      .filter(([, pattern]) => pattern.test(text))
      .map(([name]) => name),
  );
}

function replaceAll(text, rules) {
  return rules.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}

function cleanCandidate(value) {
  return String(value ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([。、！？!?])/g, "$1")
    .replace(/。{2,}/g, "。")
    .replace(/必要不可欠不可欠/g, "必要不可欠")
    .replace(/かなりかなり/g, "かなり")
    .trim();
}

function meetsLevelObligations(source, candidate, level) {
  if (level < 2) return true;
  const obligations = [
    { source: /あまりにも/, candidate: /あもりにも/ },
    { source: /(?:私は|僕は|俺は)?.{0,12}怒って|怒りました|怒った/, candidate: /怒りが有頂天/ },
    { source: /急いで|素早く|すばやく|ソッコー/, candidate: /ｶｶッ/ },
    { source: /全員/, candidate: /ぜいいん/ },
    { source: /手遅れ|もう間に合わない/, candidate: /時既に時間切れ/ },
  ];
  return obligations.every((obligation) => !obligation.source.test(source) || obligation.candidate.test(candidate));
}

function removeFinalPunctuation(value) {
  return value.trim().replace(/[。！？!?]+$/g, "");
}

function formatCorpusEnding(value) {
  const trimmed = value.trim().replace(/。+$/g, "");
  if (!trimmed) return trimmed;
  return trimmed;
}

function createSurfaceMap(posts) {
  const counts = new Map();
  for (const post of posts) {
    for (const part of segmenter.segment(post.content)) {
      const surface = part.segment;
      if (!/[ｦ-ﾟ]/.test(surface)) continue;
      const normalized = surface.normalize("NFKC");
      if (normalized === surface || normalized.length < 2) continue;
      if (!counts.has(normalized)) counts.set(normalized, new Map());
      const variants = counts.get(normalized);
      variants.set(surface, (variants.get(surface) || 0) + 1);
    }
  }

  const surfaceMap = new Map();
  for (const [normalized, variants] of counts) {
    const [bestSurface, frequency] = Array.from(variants.entries()).sort((left, right) => right[1] - left[1])[0];
    if (frequency >= 2) surfaceMap.set(normalized, bestSurface);
  }
  return surfaceMap;
}

function applySurfaceMap(value, surfaceMap) {
  let result = "";
  for (const part of segmenter.segment(value)) {
    result += surfaceMap.get(part.segment.normalize("NFKC")) || part.segment;
  }
  return result;
}

function canonicalToken(token) {
  const normalized = normalizeForSearch(token);
  if (tokenConcept.has(normalized)) return tokenConcept.get(normalized);
  for (const [member, concept] of tokenConcept) {
    if (normalized.includes(member) || member.includes(normalized) && normalized.length >= 4) return concept;
  }
  return normalized;
}

function characterNgrams(value, sizes = [2, 3]) {
  const compact = String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s、。！？!?「」『』（）()［］\[\]・…]+/g, "_");
  const terms = [];
  for (const size of sizes) {
    for (let index = 0; index <= compact.length - size; index += 1) {
      terms.push(`c${size}:${compact.slice(index, index + size)}`);
    }
  }
  return terms;
}

function retrievalVectorTerms(document) {
  const text = typeof document === "string" ? document : document?.text || "";
  const canonicalTokens = tokenize(text, { contentOnly: true })
    .map(canonicalToken)
    .filter((term) => term.length >= 2);
  const tokenTerms = canonicalTokens.map((term) => `t:${term}`);
  // 文全体の断片は「今日は」だけが一致するような偶然を強くしすぎる。
  // 正規化済みの内容語の内部だけを補助断片にして、活用差へ対応する。
  const fragmentTerms = canonicalTokens.flatMap((term) => (
    term.length >= 3 ? characterNgrams(term, [3]) : []
  ));
  return [...tokenTerms, ...fragmentTerms];
}

function styleVectorTerms(document) {
  const text = typeof document === "string" ? document : document?.content || document?.text || "";
  const terms = characterNgrams(text, [3, 4]);
  const halfwidthRuns = text.match(/[\uFF61-\uFF9F]{2,}/g) || [];
  for (const run of halfwidthRuns) terms.push(`half:${run.toLowerCase()}`);
  for (const dimension of styleDimensions(text)) terms.push(`dimension:${dimension}`);
  for (const intent of intentTags(text)) terms.push(`intent:${intent}`);
  return terms;
}

function expandQueryTokens(tokens) {
  const result = new Set(tokens.map(normalizeForSearch));
  for (const token of tokens) {
    const concept = canonicalToken(token);
    const group = conceptGroups.find(([name]) => name === concept);
    if (group) group.slice(1).forEach((member) => result.add(normalizeForSearch(member)));
  }
  return result;
}

function overlapScore(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / Math.max(left.size, right.size);
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function semanticNegationCount(value) {
  const stripped = String(value ?? "").normalize("NFKC")
    .replace(/どこもおかしくはない/g, "")
    .replace(/一般人と同じようにやってこの結果は出ない/g, "")
    .replace(/それほどでもない/g, "")
    .replace(/関係ないからノーダメージ/g, "")
    .replace(/狩られる側じゃない/g, "")
    // 下は内容の否定ではなく、倉庫系列別の語り口を作る談話句。
    .replace(/文句ないべ/g, "")
    .replace(/しょうがないからとっておきを出す/g, "")
    .replace(/仕方ないから参入したところ/g, "")
    .replace(/疑う理由はない/g, "")
    .replace(/遅れをとるはずは無い/g, "")
    .replace(/ノーリスクなのに否定する理由がないでしょう/g, "")
    .replace(/証拠もないのに決め付けるな/g, "")
    .replace(/ここまで言ってわからないのはザコの証拠となる/g, "")
    .replace(/まず/g, "");
  const explicit = (stripped.match(/なかった|ません|じゃない|ではない|しない|していない|できない|ない|無い|なく/g) || []).length;
  // 「まず」の「ず」を否定と数えず、終止・接続助詞の「～ず」だけを数える。
  const classical = (stripped.match(/[ぁ-ん一-龠々]ず(?=[、。！？!?\s]|$)/g) || []).length;
  return explicit + classical;
}

function shuffleValues(values, random) {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function variationFamily(text) {
  if (/でしょう[？?]?$/.test(text)) return "question";
  if (/んだが[？?]?$/.test(text)) return "complaint";
  if (/確定的に明らか$/.test(text)) return "certainty";
  if (/だろ(?:・・|\.\.)?$/.test(text)) return "assertion";
  if (/時既に時間切れ|致命的な致命傷|寿命がﾏｯﾊ/.test(text)) return "danger";
  if (/驚き|眼差し|言葉を失|格の違い/.test(text)) return "reaction";
  return "plain";
}

function chooseDiverseCandidates(values, limit) {
  const unique = values.filter((candidate, index) => (
    values.findIndex((item) => item.text === candidate.text) === index
  ));
  if (!unique.length) return [];
  const selected = [unique[0]];
  const families = new Set([variationFamily(unique[0].text)]);
  for (const candidate of unique.slice(1)) {
    const family = variationFamily(candidate.text);
    if (families.has(family)) continue;
    selected.push(candidate);
    families.add(family);
    if (selected.length >= limit) return selected;
  }
  for (const candidate of unique) {
    if (selected.includes(candidate)) continue;
    selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected;
}

function chooseDiverseFaithfulCandidates(values, limit) {
  const unique = values.filter((candidate, index) => (
    values.findIndex((item) => item.text === candidate.text) === index
  ));
  const selected = [];
  const signatureBatches = new Set();
  const eraBatches = new Set();
  const hasEraFrames = unique.some((candidate) => candidate.validation.eraSignatures.length > 0);
  for (const candidate of unique) {
    const signatureKey = candidate.validation.faithfulQuoteSignatures.slice().sort().join("+");
    const eraKey = candidate.validation.eraSignatures.slice().sort().join("+");
    if (!signatureKey || signatureBatches.has(signatureKey)) continue;
    if (hasEraFrames && (!eraKey || eraBatches.has(eraKey))) continue;
    selected.push(candidate);
    signatureBatches.add(signatureKey);
    if (eraKey) eraBatches.add(eraKey);
    if (selected.length >= limit) return selected;
  }
  // 内容構文の都合で直交する組合せが足りなくても、系列構文の3案は守る。
  if (hasEraFrames) {
    for (const candidate of unique) {
      const eraKey = candidate.validation.eraSignatures.slice().sort().join("+");
      if (!eraKey || eraBatches.has(eraKey) || selected.includes(candidate)) continue;
      selected.push(candidate);
      eraBatches.add(eraKey);
      if (selected.length >= limit) return selected;
    }
  }
  for (const candidate of unique) {
    if (selected.includes(candidate)) continue;
    selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected;
}

function narrativeFamily(text) {
  if (/^これは俺の知り合いの(?:ﾅｲﾄ|ナイト)/.test(text)) return "acquaintance";
  if (/^LSで/.test(text)) return "rumor";
  if (/^最初に結果だけ言うと/.test(text)) return "result-first";
  if (/^証拠から先に/.test(text)) return "evidence-first";
  if (/^後になって/.test(text)) return "aftershock-first";
  if (/^(?:おいィ？|まぁこうなる|英語でいうと|何いきなり|これは闇系)/.test(text)) return "quote-open";
  if (/^(?:[^\n]*(?:寿命がストレス|深い悲しみ|想像を絶する|ｓＹレならん|手遅れ|いくえ不明|ｹﾞｰﾑｵｰﾊﾞｰ|牙抜いて))/.test(text)) return "lament-first";
  if (/^俺はその場にいたんだが|^[^\n]+(?:騒いでいた|顔を真っ赤|助けを求め|泣き言|混乱は止まらない)/.test(text)) return "witness";
  return "self";
}

function chooseDiverseNarratives(values, limit) {
  const unique = values.filter((candidate, index) => (
    values.findIndex((item) => item.text === candidate.text) === index
  ));
  const selected = [];
  const families = new Set();
  const eraBatches = new Set();
  const hasEraFrames = unique.some((candidate) => candidate.validation.eraSignatures?.length > 0);
  for (const candidate of unique) {
    const family = narrativeFamily(candidate.text);
    if (families.has(family)) continue;
    const eraKey = candidate.validation.eraSignatures?.slice().sort().join("+") || "";
    if (hasEraFrames && (!eraKey || eraBatches.has(eraKey))) continue;
    selected.push(candidate);
    families.add(family);
    if (eraKey) eraBatches.add(eraKey);
    if (selected.length >= limit) return selected;
  }
  if (hasEraFrames) {
    for (const candidate of unique) {
      const eraKey = candidate.validation.eraSignatures?.slice().sort().join("+") || "";
      if (!eraKey || eraBatches.has(eraKey) || selected.includes(candidate)) continue;
      selected.push(candidate);
      eraBatches.add(eraKey);
      if (selected.length >= limit) return selected;
    }
  }
  for (const candidate of unique) {
    if (selected.includes(candidate)) continue;
    selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected;
}

function standardDeviation(values, average = mean(values)) {
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2))) || 1;
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function diffTokens(before, after) {
  const left = Array.from(segmenter.segment(before), (part) => part.segment);
  const right = Array.from(segmenter.segment(after), (part) => part.segment);
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => new Uint16Array(columns));

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      matrix[row][column] = left[row - 1] === right[column - 1]
        ? matrix[row - 1][column - 1] + 1
        : Math.max(matrix[row - 1][column], matrix[row][column - 1]);
    }
  }

  const operations = [];
  let row = left.length;
  let column = right.length;
  while (row > 0 || column > 0) {
    if (row > 0 && column > 0 && left[row - 1] === right[column - 1]) {
      operations.unshift({ type: "same", value: left[row - 1] });
      row -= 1;
      column -= 1;
    } else if (column > 0 && (row === 0 || matrix[row][column - 1] >= matrix[row - 1][column])) {
      operations.unshift({ type: "added", value: right[column - 1] });
      column -= 1;
    } else {
      operations.unshift({ type: "removed", value: left[row - 1] });
      row -= 1;
    }
  }

  return operations.reduce((groups, operation) => {
    const last = groups[groups.length - 1];
    if (last && last.type === operation.type) last.value += operation.value;
    else groups.push({ ...operation });
    return groups;
  }, []);
}

class CorpusEngine {
  constructor(options = {}) {
    const dataDirectory = options.dataDirectory || path.join(ROOT, "data");
    this.corpus = JSON.parse(fs.readFileSync(path.join(dataDirectory, "log-corpus.json"), "utf8"));
    this.styleModel = JSON.parse(fs.readFileSync(path.join(dataDirectory, "style-model.json"), "utf8"));
    this.novelModel = JSON.parse(fs.readFileSync(path.join(dataDirectory, "novel-model.json"), "utf8"));
    this.postsById = new Map(this.corpus.posts.map((post) => [post.id, post]));
    this.variationGrammar = new VariationGrammar(this.corpus.posts);
    this.contextNarrative = new ContextNarrativeGenerator();
    this.faithfulQuoteGrammar = new FaithfulQuoteGrammar(this.corpus.posts, this.contextNarrative);
    this.eraProfiles = new EraProfileRegistry(this.corpus.posts, this.corpus.sentences);
    this.eraSurfaceMaps = new Map(this.eraProfiles.status().map(({ id }) => {
      const profile = this.eraProfiles.resolve(id);
      const posts = id === "all"
        ? this.corpus.posts
        : this.corpus.posts.filter((post) => profile.postIds.has(post.id));
      return [id, createSurfaceMap(posts)];
    }));
    this.surfaceMap = this.eraSurfaceMaps.get("all");
    this.eraGrammar = new EraGrammar(this.corpus.posts, this.eraProfiles);
    this.recentSelections = new Map();
    this.intentIndex = new Map();
    this.tokenIndex = new Map();

    this.corpus.sentences.forEach((sentence, index) => {
      for (const intent of sentence.intents) {
        if (!this.intentIndex.has(intent)) this.intentIndex.set(intent, []);
        this.intentIndex.get(intent).push(index);
      }
      for (const token of new Set(sentence.tokens.map(canonicalToken))) {
        if (token.length < 2) continue;
        if (!this.tokenIndex.has(token)) this.tokenIndex.set(token, []);
        const list = this.tokenIndex.get(token);
        if (list.length < 800) list.push(index);
      }
    });

    const calibrationSentences = this.corpus.sentences
      .filter((sentence) => sentence.text.length >= 12 && sentence.text.length <= 240)
      .filter((sentence, index) => index % 7 === 0)
      .slice(0, 1200)
      .map((sentence) => sentence.text);
    this.calibration = {
      log: this.createCalibration(calibrationSentences, this.styleModel.ngrams),
      novel: this.createCalibration(calibrationSentences, this.novelModel.ngrams),
    };
    this.eraCalibrations = new Map();
    for (const era of this.eraProfiles.status().filter((profile) => profile.id !== "all")) {
      const profile = this.eraProfiles.resolve(era.id);
      const eraSentences = this.corpus.sentences
        .filter((sentence) => this.eraProfiles.includesSentence(sentence, era.id))
        .filter((sentence) => sentence.text.length >= 8 && sentence.text.length <= 280)
        .filter((sentence, index) => index % 3 === 0)
        .slice(0, 900)
        .map((sentence) => sentence.text);
      this.eraCalibrations.set(era.id, this.createCalibration(eraSentences, profile.ngrams));
    }

    const corpusPath = path.join(dataDirectory, "log-corpus.json");
    const seriesPath = path.join(dataDirectory, "archive-series.json");
    const corpusStat = fs.statSync(corpusPath);
    const seriesStat = fs.statSync(seriesPath);
    const vectorCacheKey = [
      path.resolve(dataDirectory),
      corpusStat.size,
      corpusStat.mtimeMs,
      seriesStat.size,
      seriesStat.mtimeMs,
    ].join(":");
    let vectorModels = vectorModelCache.get(vectorCacheKey);
    if (!vectorModels) {
      const postSeries = new Map();
      for (const profileStatus of this.eraProfiles.status().filter(({ id }) => id !== "all")) {
        for (const postId of this.eraProfiles.resolve(profileStatus.id).postIds) {
          postSeries.set(postId, profileStatus.id);
        }
      }
      const classifiedPosts = this.corpus.posts.filter((post) => postSeries.has(post.id));
      const classifiedSentences = this.corpus.sentences.filter((sentence) => postSeries.has(sentence.postId));
      vectorModels = {
        retrieval: new TfidfSearchIndex(this.corpus.sentences, retrievalVectorTerms, {
          minimumDocumentFrequency: 2,
          maximumDocumentFrequencyRatio: 0.93,
          maximumVocabulary: 26000,
        }),
        seriesStyle: new TfidfCentroidClassifier(
          classifiedPosts,
          classifiedPosts.map((post) => postSeries.get(post.id)),
          styleVectorTerms,
          {
            minimumDocumentFrequency: 2,
            maximumDocumentFrequencyRatio: 0.88,
            maximumVocabulary: 36000,
          },
        ),
        seriesNeighbors: new TfidfKnnClassifier(
          classifiedSentences,
          classifiedSentences.map((sentence) => postSeries.get(sentence.postId)),
          styleVectorTerms,
          {
            minimumDocumentFrequency: 2,
            maximumDocumentFrequencyRatio: 0.88,
            maximumVocabulary: 36000,
          },
        ),
      };
      vectorModelCache.set(vectorCacheKey, vectorModels);
    }
    this.vectorSearch = vectorModels.retrieval;
    this.seriesVectorClassifier = vectorModels.seriesStyle;
    this.seriesNeighborClassifier = vectorModels.seriesNeighbors;
  }

  createCalibration(sentences, model) {
    const values = sentences.map((sentence) => scoreNgrams(sentence, model));
    const average = mean(values);
    return { mean: average, standardDeviation: standardDeviation(values, average) };
  }

  applyEraSurface(value, eraId = "all") {
    const era = this.eraProfiles.resolve(eraId).id;
    // 倉庫系列内で実際に観測した表記対応だけを適用する。
    return applySurfaceMap(String(value ?? ""), this.eraSurfaceMaps.get(era) || this.surfaceMap);
  }

  status() {
    const quoteStatus = this.contextNarrative.quoteGrammar.status();
    const anchorStatus = this.contextNarrative.anchorGrammar.status();
    const faithfulQuoteStatus = this.faithfulQuoteGrammar.status();
    const eraGrammarStatus = this.eraGrammar.status();
    const series = this.eraProfiles.status();
    return {
      ready: true,
      engine: "corpus-comparison",
      usesLlm: false,
      posts: this.corpus.comparison.archivePosts,
      sentences: this.corpus.comparison.archiveSentences,
      localMatches: this.corpus.comparison.postsPresentInLocalLog,
      archiveSupplements: this.corpus.comparison.archiveOnlyPosts,
      novelChapters: this.novelModel.source.chapterCount,
      novelCharactersAnalyzed: this.novelModel.totals.characterCount,
      comparisonStages: this.styleModel.comparisonStages.stages.length,
      quoteHeadings: quoteStatus.headings,
      quoteExcerpts: quoteStatus.excerpts,
      quoteHeadingsWithContext: quoteStatus.headingsWithContext,
      quoteContextLinks: quoteStatus.contextLinks,
      quotePatterns: quoteStatus.activePatterns,
      quoteSourceUrl: quoteStatus.sourceUrl,
      anchorConstructions: anchorStatus.constructionCount,
      observedAnchors: anchorStatus.observedAnchorCount,
      faithfulQuoteExpressions: faithfulQuoteStatus.activeExpressions,
      faithfulQuoteRecognizers: faithfulQuoteStatus.recognizedExpressions,
      faithfulQuoteFunctionalRoles: faithfulQuoteStatus.functionalRoles,
      faithfulQuoteEvidenceLinks: faithfulQuoteStatus.evidenceLinkedExpressions,
      series,
      eras: series,
      seriesGrammarFrames: eraGrammarStatus.frameCount,
      seriesGrammarEvidenceLinks: eraGrammarStatus.evidenceLinkedFrames,
      eraGrammarFrames: eraGrammarStatus.frameCount,
      eraGrammarEvidenceLinks: eraGrammarStatus.evidenceLinkedFrames,
      retrievalMetric: "tfidf-cosine",
      retrievalRandomization: "uniform-near-neighbor-band-with-diversity",
      seriesStyleMetric: "tfidf-centroid-and-knn-cosine",
      retrievalVocabulary: this.vectorSearch.vectorizer.idf.size,
      seriesStyleVocabulary: this.seriesVectorClassifier.vectorizer.idf.size,
      seriesNeighborVocabulary: this.seriesNeighborClassifier.vectorizer.idf.size,
    };
  }

  retrieve(source, limit = 6, eraId = "all", random = null) {
    const sourceTokens = tokenize(source, { contentOnly: true });
    const directTokens = new Set(sourceTokens.map(canonicalToken));
    const expandedTokens = expandQueryTokens(sourceTokens);
    const expandedCanonical = new Set(Array.from(expandedTokens, canonicalToken));
    const sourceIntents = new Set(intentTags(source));
    const candidates = new Set();
    const inRequestedSeries = (index) => (
      this.eraProfiles.includesSentence(this.corpus.sentences[index], eraId)
    );
    const vectorHits = this.vectorSearch.search(source, inRequestedSeries, 1800);
    const vectorScores = new Map(vectorHits.map(({ index, score }) => [index, score]));
    for (const { index } of vectorHits) candidates.add(index);

    for (const token of expandedTokens) {
      const canonical = canonicalToken(token);
      for (const index of this.tokenIndex.get(canonical) || []) candidates.add(index);
    }
    for (const intent of sourceIntents) {
      for (const index of (this.intentIndex.get(intent) || []).slice(0, 700)) candidates.add(index);
    }
    const eraCandidates = new Set(Array.from(candidates).filter(inRequestedSeries));
    if (!eraCandidates.size) {
      for (let index = 0; index < this.corpus.sentences.length; index += 1) {
        if (this.eraProfiles.includesSentence(this.corpus.sentences[index], eraId)) eraCandidates.add(index);
        if (eraCandidates.size >= 1000) break;
      }
    }

    const scored = Array.from(eraCandidates, (index) => {
      const sentence = this.corpus.sentences[index];
      const targetTokens = new Set(sentence.tokens.map(canonicalToken));
      const targetIntents = new Set(sentence.intents);
      const direct = overlapScore(directTokens, targetTokens);
      const expanded = overlapScore(expandedCanonical, targetTokens);
      const intents = overlapScore(sourceIntents, targetIntents);
      const vectorSimilarity = vectorScores.get(index) || 0;
      const lengthFit = 1 - Math.min(1, Math.abs(source.length - sentence.text.length) / Math.max(20, source.length * 2));
      const localBonus = sentence.local ? 0.08 : 0;
      return {
        index,
        sentence,
        vectorSimilarity,
        score: vectorSimilarity * 4.5 + direct * 2.8 + expanded * 1.4 + intents * 1.4 + lengthFit * 0.35 + localBonus,
      };
    }).sort((left, right) => right.score - left.score);

    const selectedItems = [];
    const usedPosts = new Set();
    while (selectedItems.length < limit) {
      const diversified = scored
        .filter((item) => !usedPosts.has(item.sentence.postId))
        .map((item) => {
          const redundancy = selectedItems.length
            ? Math.max(...selectedItems.map((selected) => this.vectorSearch.similarity(item.index, selected.index)))
            : 0;
          return { item, adjustedScore: item.score - redundancy * 1.4 };
        })
        .sort((left, right) => right.adjustedScore - left.adjustedScore);
      if (!diversified.length) break;
      const best = diversified[0].adjustedScore;
      // 最高点一点に固定せず、意味点が最高点のおよそ84%以上の近傍を
      // 同格帯として扱う。帯外の無関係文まで乱択対象にはしない。
      const tolerance = Math.max(0.18, Math.abs(best) * 0.16);
      const similarityBand = diversified
        .filter(({ adjustedScore }) => adjustedScore >= best - tolerance)
        .slice(0, 14);
      // 出現数を重みにしない。意味的に十分近い帯の中から一様に選ぶ。
      const chosen = random
        ? similarityBand[Math.floor(random() * similarityBand.length)]
        : similarityBand[0];
      selectedItems.push(chosen.item);
      usedPosts.add(chosen.item.sentence.postId);
    }

    return selectedItems.map((item) => {
      const post = this.postsById.get(item.sentence.postId);
      return {
        postId: item.sentence.postId,
        text: item.sentence.text,
        score: Number(item.score.toFixed(4)),
        cosineSimilarity: Number(item.vectorSimilarity.toFixed(4)),
        board: post?.board || "不明",
        threadTitle: post?.threadTitle || "不明",
        postUrl: post?.postUrl || null,
        date: post?.date || null,
        era: this.eraProfiles.resolve(eraId).id,
        local: item.sentence.local,
      };
    });
  }

  applyLearnedComparisonEdits(text) {
    let value = text;
    for (const stage of this.styleModel.comparisonStages.stages) {
      for (const edit of stage.editsFromPrevious || []) {
        if (edit.type !== "replace" || !edit.before || !edit.after || edit.before.length < 4 || edit.before.length > 24) continue;
        if (value.normalize("NFKC").includes(edit.before.normalize("NFKC"))) {
          const pattern = new RegExp(edit.before.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
          value = value.replace(pattern, edit.after);
        }
      }
    }
    return value;
  }

  frameVariants(text, source, references, level) {
    const base = formatCorpusEnding(text);
    const stem = removeFinalPunctuation(text);
    const tags = new Set(intentTags(source));
    const variants = [base];

    if (!/^やはり/.test(stem)) variants.push(formatCorpusEnding(`やはり${stem}`));
    variants.push(formatCorpusEnding(`${stem}という事実`));

    if (/昨日|今日|先日|この前|昔|とき|時/.test(source)) variants.push(formatCorpusEnding(`これは${stem}という話`));
    if (tags.has("praise") || tags.has("achievement")) {
      variants.push(formatCorpusEnding(`ほう、${stem}とはなかなか見所がある`));
      if (level >= 2) {
        const asserted = stem.match(/^俺は(.+)と思う$/)?.[1] || stem.replace(/と思う$/, "");
        variants.push(formatCorpusEnding(`やはり${asserted}のは確定的に明らか`));
      }
    }
    if (tags.has("criticism")) {
      variants.push(/^(?:ただし|しかし|なお)[、,]?/.test(stem)
        ? formatCorpusEnding(`${stem}というアワレな事実`)
        : formatCorpusEnding(`アワレにも${stem}という事実`));
    }
    if (tags.has("request")) {
      variants.push(formatCorpusEnding(`${stem}のは必要不可欠`));
    }
    if (tags.has("uncertainty") && /と思う/.test(stem)) {
      variants.push(formatCorpusEnding(stem.replace(/と思う$/, "と感じた（リアル話）")));
    }

    const referenceText = references.map((reference) => reference.text).join("\n");
    if (/どこもおかしくはない/.test(referenceText)) variants.push(formatCorpusEnding(`${stem}だがどこもおかしくはない`));
    if (/名実ともに/.test(referenceText) && level >= 2) variants.push(formatCorpusEnding(stem.replace(/かなり|とても/, "名実ともにかなり")));
    if (/高確率|確実/.test(referenceText) && level >= 2) variants.push(formatCorpusEnding(`${stem}のは確実で高確率`));
    return variants;
  }

  comparisonDrivenCandidates(source, random = Math.random, variationSource = source) {
    const candidates = [];
    const normalized = source.trim();
    const actionReaction = normalized.match(
      /^(昨日|今日|先日|この前)[、,]?(.{0,28}?)(?:急いで|素早く|すばやく|ソッコー)(.{1,50}?)(?:したら|すると)[、,]?(.{1,30}?)(?:とても|かなり|すごく)?(?:驚きました|驚いた|びっくりした|ビックリした)[。！？!?]?$/,
    );
    if (actionReaction) {
      const [, time, context, action, observer] = actionReaction;
      const objectBoundary = action.lastIndexOf("を");
      const fastAction = objectBoundary >= 0
        ? `${action.slice(0, objectBoundary + 1)}ｶｶッっと${action.slice(objectBoundary + 1)}`
        : `ｶｶッっと${action}`;
      candidates.push(
        formatCorpusEnding(`これは${time}の話なんだが${context}${fastAction}したら${observer}俺の圧倒的な速度にリアルでビビったらしい`),
      );
      candidates.push(
        formatCorpusEnding(`これは${time}の話なんだが${context}${fastAction}したら${observer}驚きとせん望の眼差しだった`),
      );
    }

    const firstPersonEvaluation = normalized.match(/^(?:私は|僕は)(.{2,80}?)(?:が|は)(?:とても|非常に|すごく)?(良い|優れている|強い)と思います[。！？!?]?$/);
    if (firstPersonEvaluation) {
      const [, topic, evaluation] = firstPersonEvaluation;
      candidates.push(formatCorpusEnding(`やはり${topic}がかなり${evaluation}のは確定的に明らか`));
    }

    candidates.push(...this.variationGrammar.candidates(variationSource, { random }).map(formatCorpusEnding));
    return candidates;
  }

  generateCandidates(source, references, level, customRules = [], random = Math.random, eraId = "all") {
    const base = source.trim();
    const casual = replaceAll(base, safeReplacements);
    const learned = this.applyLearnedComparisonEdits(casual);
    const medium = replaceAll(learned, mediumReplacements);
    const strong = replaceAll(medium, strongReplacements);
    const stageValues = level === 1
      ? [casual, learned]
      : level === 2
        ? [casual, learned, medium]
        : [learned, medium, strong];
    const values = new Set([base]);
    const variationSource = level === 1 ? casual : level === 2 ? medium : strong;

    for (const comparisonCandidate of this.comparisonDrivenCandidates(base, random, variationSource)) {
      let candidate = this.applyEraSurface(comparisonCandidate, eraId);
      for (const rule of customRules.slice(0, 100)) {
        const from = String(rule.from || "").trim();
        const to = String(rule.to || "").trim();
        if (from && to) candidate = candidate.split(from).join(to);
      }
      const cleaned = cleanCandidate(candidate);
      values.add(cleaned);
    }

    const faithfulFact = replaceAll(casual, faithfulSurfaceReplacements);
    const faithfulModel = this.contextNarrative.extractModel(base, [faithfulFact]);
    const quoteCandidates = this.faithfulQuoteGrammar.candidates(base, faithfulFact, faithfulModel, random);
    const eraQuoteCandidates = eraId === "all"
      ? quoteCandidates
      : quoteCandidates.flatMap((quoteCandidate) => this.eraGrammar.candidates(quoteCandidate, eraId, random));
    for (const quoteCandidate of eraQuoteCandidates) {
      let candidate = this.applyEraSurface(quoteCandidate, eraId);
      for (const rule of customRules.slice(0, 100)) {
        const from = String(rule.from || "").trim();
        const to = String(rule.to || "").trim();
        if (from && to) candidate = candidate.split(from).join(to);
      }
      values.add(cleanCandidate(candidate));
    }

    for (const stageValue of stageValues) {
      for (const framed of this.frameVariants(stageValue, source, references, level)) {
        let candidate = this.applyEraSurface(framed, eraId);
        for (const rule of customRules.slice(0, 100)) {
          const from = String(rule.from || "").trim();
          const to = String(rule.to || "").trim();
          if (from && to) candidate = candidate.split(from).join(to);
        }
        values.add(cleanCandidate(candidate));
      }
    }
    return Array.from(values).filter(Boolean).slice(0, 36);
  }

  ngramAffinity(text, model, calibration) {
    const raw = scoreNgrams(text, model);
    const boundary = calibration.mean - calibration.standardDeviation * 2;
    return sigmoid((raw - boundary) / Math.max(0.01, calibration.standardDeviation * 0.8));
  }

  semanticScore(source, candidate) {
    const sourceTokens = tokenize(source, { contentOnly: true });
    const candidateNormalized = normalizeForSearch(candidate);
    const candidateTokens = new Set(tokenize(candidate, { contentOnly: true }).map(canonicalToken));
    const meaningful = sourceTokens.filter((token) => token.length >= 2);
    const retained = meaningful.filter((token) => {
      const normalized = normalizeForSearch(token);
      return candidateNormalized.includes(normalized) || candidateTokens.has(canonicalToken(token));
    });
    const contentRetention = meaningful.length ? retained.length / meaningful.length : 1;
    const protectedValues = extractProtectedValues(source);
    const missingProtected = protectedValues.filter((value) => !candidate.normalize("NFKC").includes(value.normalize("NFKC")));
    const sourceNegative = semanticNegationCount(source);
    const candidateNegative = semanticNegationCount(candidate);
    const polarityMatch = sourceNegative === 0
      ? candidateNegative === 0 ? 1 : 0.72
      : candidateNegative > 0 ? 1 : 0.35;
    const lengthRatio = candidate.length / Math.max(1, source.length);
    const expansionPenalty = lengthRatio > 3 ? Math.max(0.55, 1 - (lengthRatio - 3) * 0.08) : 1;
    const score = contentRetention * 0.68 + polarityMatch * 0.22 + (missingProtected.length ? 0 : 0.1);
    return {
      score: Math.max(0, Math.min(1, score * expansionPenalty)),
      contentRetention,
      polarityMatch,
      missingProtected,
      lengthRatio,
    };
  }

  fluencyScore(candidate) {
    let score = 1;
    const warnings = [];
    if (/(.{2,12})\1\1/.test(candidate)) {
      score -= 0.25;
      warnings.push("同じ表現の過剰な反復");
    }
    const brackets = [["「", "」"], ["『", "』"], ["（", "）"], ["(", ")"]];
    for (const [open, close] of brackets) {
      if ((candidate.split(open).length - 1) !== (candidate.split(close).length - 1)) {
        score -= 0.18;
        warnings.push("括弧の対応不一致");
      }
    }
    if (candidate.length > 900) {
      score -= 0.15;
      warnings.push("一文が長すぎる");
    }
    if (/だだ[。、]|るる[。、]|という事という事/.test(candidate)) {
      score -= 0.2;
      warnings.push("語尾の接続不良");
    }
    if (/(?:です|ます|でした|ました)(?:のは|ことは|という事実|が|けど|けれど)/.test(candidate)) {
      score -= 0.45;
      warnings.push("丁寧形と断定句の接続不良");
    }
    if (/ませんだった|[ぁ-ん一-龠々]いだ(?:という|$)|アワレにも(?:ただし|しかし|なお)/.test(candidate)) {
      score -= 0.55;
      warnings.push("活用または接続語の結合不良");
    }
    if (/問題.{0,14}という問題/.test(candidate)) {
      score -= 0.4;
      warnings.push("同義語の不自然な接続");
    }
    return { score: Math.max(0, score), warnings };
  }

  styleScore(source, candidate, level, eraId = "all") {
    const eraProfile = this.eraProfiles.resolve(eraId);
    const logModel = eraProfile.id === "all" ? this.styleModel.ngrams : eraProfile.ngrams;
    const logCalibration = eraProfile.id === "all"
      ? this.calibration.log
      : this.eraCalibrations.get(eraProfile.id);
    const candidateLogRaw = scoreNgrams(candidate, logModel);
    const sourceLogRaw = scoreNgrams(source, logModel);
    const candidateNovelRaw = scoreNgrams(candidate, this.novelModel.ngrams);
    const sourceNovelRaw = scoreNgrams(source, this.novelModel.ngrams);
    const logAffinity = this.ngramAffinity(candidate, logModel, logCalibration);
    const novelAffinity = this.ngramAffinity(candidate, this.novelModel.ngrams, this.calibration.novel);
    const relativeScale = Math.max(0.05, (logCalibration.standardDeviation + this.calibration.novel.standardDeviation) / 2);
    const relativeImprovement = sigmoid((((candidateLogRaw - sourceLogRaw) + (candidateNovelRaw - sourceNovelRaw)) / 2) / relativeScale);
    const markerCount = (candidate.match(styleMarkers) || []).length;
    const expectedMarkers = Math.max(level === 1 ? 1 : 2, candidate.length / 34);
    const markerScore = Math.min(1, markerCount / expectedMarkers);
    const candidateDimensions = styleDimensions(candidate);
    const sourceDimensions = styleDimensions(source);
    let gainedDimensions = 0;
    for (const dimension of candidateDimensions) if (!sourceDimensions.has(dimension)) gainedDimensions += 1;
    const targetDimensions = level === 1 ? 2 : level === 2 ? 4 : 5.5;
    const dimensionScore = Math.min(1, (candidateDimensions.size * 0.65 + gainedDimensions * 0.35) / targetDimensions);
    const features = extractFeatures(candidate);
    const targetKeys = ["connectiveRate", "certaintyRate", "comparisonRate", "amplificationRate"];
    const featureScores = targetKeys.map((key) => {
      const target = eraProfile.id === "all" ? this.styleModel.baseline[key] : eraProfile.features[key];
      if (!target) return 0.5;
      const distance = Math.abs(features[key] - target.mean);
      return Math.exp(-distance / Math.max(0.002, target.standardDeviation * 2.5));
    });
    const featureScore = mean(featureScores);
    const seriesCentroidScores = eraProfile.id === "all"
      ? new Map()
      : this.seriesVectorClassifier.scores(candidate);
    const seriesNeighborScores = eraProfile.id === "all"
      ? new Map()
      : this.seriesNeighborClassifier.scores(candidate);
    const seriesVectorScores = new Map(Array.from(seriesCentroidScores, ([id, centroidScore]) => [
      id,
      centroidScore * 0.35 + (seriesNeighborScores.get(id) || 0) * 0.65,
    ]));
    const sortedSeriesVectors = Array.from(seriesVectorScores, ([id, cosineSimilarity]) => ({ id, cosineSimilarity }))
      .sort((left, right) => right.cosineSimilarity - left.cosineSimilarity);
    const seriesVectorCosine = seriesVectorScores.get(eraProfile.id) || 0;
    // 重心との生コサインは短文だと小さくなるため、選抜点だけ0..1へ拡大する。
    // 生値と全系列順位は別フィールドで保持し、検証時に隠さない。
    const seriesVectorAffinity = Math.min(1, seriesVectorCosine * 4);
    const seriesVectorRank = eraProfile.id === "all"
      ? null
      : sortedSeriesVectors.findIndex(({ id }) => id === eraProfile.id) + 1;
    const baseStyleScore = logAffinity * 0.1
      + novelAffinity * 0.1
      + relativeImprovement * 0.12
      + markerScore * 0.1
      + dimensionScore * 0.3
      + featureScore * 0.1;
    return {
      score: eraProfile.id === "all"
        ? baseStyleScore / 0.82
        : baseStyleScore + seriesVectorAffinity * 0.18,
      logAffinity,
      novelAffinity,
      relativeImprovement,
      markerScore,
      dimensionScore,
      dimensions: Array.from(candidateDimensions),
      featureScore,
      era: eraProfile.id,
      eraAffinity: logAffinity,
      seriesVectorAffinity,
      seriesVectorCosine,
      seriesCentroidCosine: seriesCentroidScores.get(eraProfile.id) || 0,
      seriesNeighborCosine: seriesNeighborScores.get(eraProfile.id) || 0,
      seriesVectorRank,
      seriesVectorTop: sortedSeriesVectors[0]?.id || null,
      seriesVectorScores: Object.fromEntries(sortedSeriesVectors.map(({ id, cosineSimilarity }) => [
        id,
        Number(cosineSimilarity.toFixed(6)),
      ])),
    };
  }

  validate(source, candidate, level, eraId = "all") {
    const semantics = this.semanticScore(source, candidate);
    const style = this.styleScore(source, candidate, level, eraId);
    const fluency = this.fluencyScore(candidate);
    const faithfulQuoteSignatures = this.faithfulQuoteGrammar.signatures(candidate);
    const faithfulQuotePriority = this.faithfulQuoteGrammar.priority(candidate);
    const faithfulQuoteRoles = this.faithfulQuoteGrammar.roles(candidate);
    const faithfulQuoteEvidence = this.faithfulQuoteGrammar.evidence(candidate);
    const faithfulModel = this.contextNarrative.extractModel(source, [source]);
    const applicableFaithfulSignatures = new Set(
      this.faithfulQuoteGrammar.applicableSignatures(source, faithfulModel),
    );
    const faithfulContextMismatch = faithfulQuoteSignatures.some((signature) => (
      !applicableFaithfulSignatures.has(signature)
    ));
    const eraRows = this.eraGrammar.signatures(candidate);
    const eraSignatures = eraRows.map((row) => row.id);
    const eraRoles = eraRows.map((row) => row.role);
    const requestedEra = this.eraProfiles.resolve(eraId).id;
    const eraContextMatch = requestedEra === "all"
      ? eraRows.length === 0
      : eraRows.length === 1 && eraRows[0].eraId === requestedEra;
    // 検証済みの系列談話句は入力内容を置き換えず、前後へ付く外枠である。
    // その長さだけを理由に意味保持点を落とさず、内容語・極性・保護値を
    // 系列外枠とは独立に採点する。
    const semanticScore = requestedEra !== "all" && eraContextMatch
      ? semantics.contentRetention * 0.68
        + semantics.polarityMatch * 0.22
        + (semantics.missingProtected.length ? 0 : 0.1)
      : semantics.score;
    const weights = level === 1
      ? { semantics: 0.62, style: 0.23, fluency: 0.15 }
      : level === 2
        ? { semantics: 0.44, style: 0.41, fluency: 0.15 }
        : { semantics: 0.34, style: 0.51, fluency: 0.15 };
    let total = semanticScore * weights.semantics + style.score * weights.style + fluency.score * weights.fluency;
    if (normalizeForSearch(source) === normalizeForSearch(candidate)) total -= level === 1 ? 0.05 : 0.16;
    if (source.length <= 16 && /という事実$/.test(candidate)) {
      total -= level === 1 ? 0.08 : 0.2;
    }
    if (source.length <= 16 && candidate.length <= source.length + 8) {
      total -= level === 1 ? 0.06 : 0.18;
    }
    if (semantics.missingProtected.length) total -= 0.35;
    const warnings = [...fluency.warnings];
    if (semantics.missingProtected.length) warnings.push(`保持できなかった値: ${semantics.missingProtected.join("、")}`);
    if (semantics.polarityMatch < 0.8) warnings.push("肯定・否定が変化した可能性");
    if (semantics.contentRetention < 0.7) warnings.push("内容語の保持率が低い");
    if (faithfulContextMismatch) warnings.push("入力の出来事型と語録の機能が不一致");
    if (!eraContextMatch) warnings.push("指定系列と系列構文が不一致");

    return {
      total: Math.max(0, Math.min(1, total)),
      semantic: semanticScore,
      contentRetention: semantics.contentRetention,
      polarity: semantics.polarityMatch,
      style: style.score,
      logAffinity: style.logAffinity,
      novelAffinity: style.novelAffinity,
      styleDimensions: style.dimensions,
      fluency: fluency.score,
      lengthRatio: semantics.lengthRatio,
      faithfulQuoteCount: faithfulQuoteSignatures.length,
      faithfulQuoteSignatures,
      faithfulQuotePriority,
      faithfulQuoteRoles,
      faithfulQuoteEvidence,
      faithfulContextMatch: !faithfulContextMismatch,
      era: requestedEra,
      eraAffinity: style.eraAffinity,
      seriesVectorAffinity: style.seriesVectorAffinity,
      seriesVectorCosine: style.seriesVectorCosine,
      seriesCentroidCosine: style.seriesCentroidCosine,
      seriesNeighborCosine: style.seriesNeighborCosine,
      seriesVectorRank: style.seriesVectorRank,
      seriesVectorTop: style.seriesVectorTop,
      seriesVectorScores: style.seriesVectorScores,
      eraSignatureCount: eraSignatures.length,
      eraSignatures,
      eraRoles,
      eraContextMatch,
      warnings,
      passed: !semantics.missingProtected.length
        && semanticScore >= 0.62
        && semantics.polarityMatch >= 0.8
        && fluency.score >= 0.65
        && !faithfulContextMismatch
        && eraContextMatch,
    };
  }

  transformSentence(source, options) {
    const random = options.random || Math.random;
    const references = this.retrieve(source, 6, options.era, random);
    const candidates = this.generateCandidates(source, references, options.level, options.customRules, random, options.era);
    const ranked = candidates
      .map((text) => ({ text, validation: this.validate(source, text, options.level, options.era) }))
      .sort((left, right) => right.validation.total - left.validation.total);
    const passing = ranked.filter((candidate) => candidate.validation.passed);
    const obligated = passing.filter((candidate) => meetsLevelObligations(source, candidate.text, options.level));
    const maximumFaithfulQuoteCount = passing.reduce((maximum, candidate) => (
      Math.max(maximum, candidate.validation.faithfulQuoteCount)
    ), 0);
    const requiredFaithfulQuoteCount = options.level >= 2
      ? Math.min(1, maximumFaithfulQuoteCount)
      : 0;
    const obligatedQuotes = options.level >= 2
      ? obligated.filter((candidate) => candidate.validation.faithfulQuoteCount === requiredFaithfulQuoteCount)
      : [];
    const passingQuotes = options.level >= 2
      ? passing.filter((candidate) => candidate.validation.faithfulQuoteCount === requiredFaithfulQuoteCount)
      : [];
    const quoteObligated = obligatedQuotes.length ? obligatedQuotes : passingQuotes;
    const selectionPool = quoteObligated.length ? quoteObligated : obligated.length ? obligated : passing;
    const bestPassingScore = selectionPool[0]?.validation.total;
    const shortlist = selectionPool.filter((candidate) => (
      candidate.validation.total >= bestPassingScore - 0.08
      && candidate.validation.semantic >= 0.7
      && candidate.validation.style >= 0.45
    ));
    const shuffledShortlist = shuffleValues(shortlist, random);
    const sourceKey = normalizeForSearch(source);
    const recent = options.avoidRepeat ? this.recentSelections.get(sourceKey) : null;
    const freshFamily = shuffledShortlist.filter((candidate) => !recent?.families.includes(variationFamily(candidate.text)));
    const freshText = shuffledShortlist.filter((candidate) => !recent?.texts.includes(candidate.text));
    const baseSelectable = freshFamily.length ? freshFamily : freshText.length ? freshText : shuffledShortlist;
    const quoteFamilyLeaders = selectionPool.filter((candidate, index, values) => {
      const signatureKey = candidate.validation.faithfulQuoteSignatures.slice().sort().join("+");
      return signatureKey && values.findIndex((other) => (
        other.validation.faithfulQuoteSignatures.slice().sort().join("+") === signatureKey
      )) === index;
    });
    const maximumQuotePriority = quoteFamilyLeaders.reduce((maximum, candidate) => (
      Math.max(maximum, candidate.validation.faithfulQuotePriority)
    ), 0);
    const preferredQuoteLeaders = quoteFamilyLeaders.filter((candidate) => (
      candidate.validation.faithfulQuotePriority === maximumQuotePriority
    ));
    const preferredSelectionPool = selectionPool.filter((candidate) => (
      candidate.validation.faithfulQuotePriority === maximumQuotePriority
    ));
    const shuffledQuoteLeaders = shuffleValues(quoteFamilyLeaders, random);
    const shuffledPreferredLeaders = shuffleValues(preferredQuoteLeaders, random);
    const freshQuoteLeaders = shuffledPreferredLeaders.filter((candidate) => !recent?.texts.includes(candidate.text));
    const selectable = quoteObligated.length
      ? freshQuoteLeaders.length ? freshQuoteLeaders : shuffledPreferredLeaders
      : baseSelectable;
    const unusedSelectable = options.usedFaithfulSignatures
      ? selectable.filter((candidate) => candidate.validation.faithfulQuoteSignatures.every((signature) => (
        !options.usedFaithfulSignatures.has(signature)
      )))
      : [];
    const unusedQuoteCandidates = options.usedFaithfulSignatures && !unusedSelectable.length
      ? shuffleValues(preferredSelectionPool.filter((candidate) => candidate.validation.faithfulQuoteSignatures.every((signature) => (
        !options.usedFaithfulSignatures.has(signature)
      ))), random)
      : [];
    let selected = unusedSelectable[0] || unusedQuoteCandidates[0] || selectable[0] || ranked[0];
    let verificationPasses = 1;

    if (!selected.validation.passed || selected.validation.style < 0.42) {
      verificationPasses += 1;
      const conservative = cleanCandidate(this.applyEraSurface(replaceAll(source, safeReplacements), options.era));
      const conservativeResult = { text: formatCorpusEnding(conservative), validation: this.validate(source, formatCorpusEnding(conservative), 1, options.era) };
      if (!selected.validation.passed && conservativeResult.validation.semantic > selected.validation.semantic) {
        selected = conservativeResult;
      }
    }

    if (options.avoidRepeat) {
      const history = this.recentSelections.get(sourceKey) || { texts: [], families: [] };
      this.recentSelections.set(sourceKey, {
        texts: [selected.text, ...history.texts.filter((text) => text !== selected.text)].slice(0, 6),
        families: [variationFamily(selected.text), ...history.families.filter((family) => family !== variationFamily(selected.text))].slice(0, 3),
      });
    }
    for (const signature of selected.validation.faithfulQuoteSignatures || []) {
      options.usedFaithfulSignatures?.add(signature);
    }

    const optionSource = [
      selected,
      ...shuffledPreferredLeaders,
      ...shuffledQuoteLeaders,
      ...shuffledShortlist.filter((candidate) => candidate.validation.styleDimensions.length >= 2),
      ...shuffledShortlist,
      ...ranked.filter((candidate) => candidate.validation.passed),
    ];
    const faithfulOptionSource = optionSource.filter((candidate) => (
      candidate.validation.faithfulQuoteCount === requiredFaithfulQuoteCount
    ));
    const optionCandidates = options.level >= 2
      ? chooseDiverseFaithfulCandidates(faithfulOptionSource.length >= 3 ? faithfulOptionSource : optionSource, 3)
      : chooseDiverseCandidates(optionSource, 3);

    return {
      source,
      output: selected.text,
      candidateCount: candidates.length,
      verificationPasses,
      requiredFaithfulQuoteCount,
      validation: selected.validation,
      diff: diffTokens(source, selected.text),
      references: references.slice(0, 3),
      alternatives: ranked.slice(0, 3).map((candidate) => ({
        text: candidate.text,
        total: candidate.validation.total,
        semantic: candidate.validation.semantic,
        style: candidate.validation.style,
      })),
      options: optionCandidates.map((candidate) => ({ text: candidate.text, validation: candidate.validation })),
    };
  }

  validateNarrative(source, candidate, level, eraId = "all") {
    const base = this.validate(source, candidate, Math.max(2, level), eraId);
    const quoteSignatures = this.contextNarrative.quoteGrammar.signatures(candidate);
    const quoteFunctionalRoles = this.contextNarrative.quoteGrammar.roles(candidate);
    const anchorSignatures = this.contextNarrative.anchorGrammar.signatures(candidate);
    const sourceModel = this.contextNarrative.extractModel(source, splitSentences(source));
    const normalizedCandidate = normalizeForSearch(candidate);
    const repeatedFacts = splitSentences(source).filter((sentence) => {
      const casual = replaceAll(sentence, safeReplacements);
      const styled = replaceAll(casual, mediumReplacements);
      const needle = normalizeForSearch(this.applyEraSurface(styled, eraId));
      if (needle.length < 10) return false;
      const first = normalizedCandidate.indexOf(needle);
      return first >= 0 && normalizedCandidate.indexOf(needle, first + needle.length) >= 0;
    });
    const candidateLines = candidate.split(/\n+/);
    const repeatedRhetoricalMoves = [
      { id: "perception", pattern: /見切|見落と/ },
      { id: "nonfiction", pattern: /ノンフィクション/ },
      { id: "humility", pattern: /謙虚|それほどでもない/ },
    ].filter(({ pattern }) => candidateLines.filter((line) => pattern.test(line)).length > 1);
    const achievementBeatPatterns = [
        /俺|知り合い|LS|一級と言われ/,
        /騒い|泣き|手も足も|助けを求め|深い悲しみ|ｓＹレならん|混乱|手遅れ|いくえ不明|顔面蒼白|ｹﾞｰﾑｵｰﾊﾞｰ|生まれもった|一般社会で頼り|最強の義務|普通は普通|Ｐｽｷﾙの高い|Ｐスキルの高い/,
        /参戦|手を出|本気を出|封印がとけ|カウンター|ｶｳﾝﾀｰ|準備運動|シュミレート|ﾉｰﾘｽｸ|武の心|一手だけ|雷属性|静かに前に出|掃除すると/,
        /ｶｶッ|圧倒的|完了|成功|完成|作成|導入|間に合|戻った|勝利|短縮|減った|おかわり|片付いた/,
        /驚き|尊敬|感心|格が違|見習う|グーの音|ギクッ|おいィ|完全\s*解決|勝つる|拳を上げ|god job|証明された|笑顔/,
        /どこもおかしくはない|それほどでもない|確定的に明らか|一歩引く|心の広さ|自慢はしない|近づけるように|ノンフィクション|狩る側|Ｐスキル|勝率は１００％|特に触れなくて良い/,
      ];
    const stateBeatPatterns = [
        /俺|知り合い|LS|一級と言われ/,
        /一般人|弱音|貧弱|格の違い|同じに考える/,
        /黄金の鉄の塊|ノーダメージ|防御もかなりかたい|ダイヤモンド・パワー|長寿ﾀｲﾌﾟ|長寿タイプ|生まれもった光属性/,
        /それほどでもない|一歩引く|心の広さ|自慢はしない|ノンフィクション|勝率は１００％|特に触れなくて良い/,
      ];
    const observationBeatPatterns = [
        /聞いた話|LSで|ノンフィクション|おいィ|格の違いが出た日の話/,
        /一般人/,
        /見落とす|見切った|見切る|細部まで/,
        /今の結果が見えたか|唯一ぬにの|証明された/,
        /それほどでもない|ノンフィクション|Ｐｽｷﾙ|Ｐスキル|Pスキル|勝率は１００％|特に触れなくて良い/,
      ];
    const evaluationBeatPatterns = [
        /聞いた話|LSで|ノンフィクション|おいィ|格の違いが出た日の話/,
        /一般人/,
        /表面だけ|格まで|原因まで|見切った|見切る/,
        /今の結果が見えたか|唯一ぬにの|証明された/,
        /それほどでもない|ノンフィクション|Ｐｽｷﾙ|Ｐスキル|Pスキル|勝率は１００％|特に触れなくて良い/,
      ];
    const anchorBeatPatterns = {
      gratitude: [
        /俺|知り合い|LS|一級と言われ/,
        /わかった|分かった|理解|判明|気づ|納得|助かった/,
        />>[^\s\n、。！？!?]{1,24}感謝/,
        /礼を言うべき|確定的に明らか|反論の余地/,
        /グーの音|おいィ|完全\s*解決|勝つる|god job|証明された|笑顔|一歩引く|心の広さ|自慢はしない|それほどでもない|ノンフィクション|狩る側|勝率は１００％/,
      ],
      agreement: [
        /俺|知り合い|LS|一級と言われ/,
        /賛成|同意|支持|意見|提案|考え/,
        />>[^\s\n、。！？!?]{1,24}(?:の意見)?に(?:賛成|同意)/,
        /同じ結論|確定的に明らか/,
        /グーの音|おいィ|完全\s*解決|勝つる|god job|証明された|笑顔|一歩引く|心の広さ|自慢はしない|それほどでもない|ノンフィクション|狩る側|勝率は１００％/,
      ],
      evidence: [
        /俺|知り合い|LS|一級と言われ/,
        /証拠|証明|データ|ログ|記録|確認でき|明らか/,
        />>[^\s\n、。！？!?]{1,24}(?:が|の).{0,24}(?:証明|証拠|示して)/,
        /記録まで揃|反論の余地|口だけではなく/,
        /グーの音|おいィ|完全\s*解決|勝つる|god job|証明された|笑顔|一歩引く|心の広さ|自慢はしない|それほどでもない|ノンフィクション|狩る側|勝率は１００％/,
      ],
    };
    const beatPatterns = anchorBeatPatterns[sourceModel.eventFrame]
      || (sourceModel.eventFrame === "observation"
        ? observationBeatPatterns
        : sourceModel.eventFrame === "evaluation"
          ? evaluationBeatPatterns
          : sourceModel.hasAchievement ? achievementBeatPatterns : stateBeatPatterns);
    const narrativeBeats = beatPatterns.filter((pattern) => pattern.test(candidate)).length;
    const narrativeScore = narrativeBeats / beatPatterns.length;
    const requiredNarrativeBeats = anchorBeatPatterns[sourceModel.eventFrame]
      ? 5
      : ["observation", "evaluation"].includes(sourceModel.eventFrame) ? 5 : sourceModel.hasAchievement ? 5 : 4;
    const requiredAnchorByFrame = {
      gratitude: "fused_performative",
      agreement: "agreement_target",
      evidence: "evidence_source",
    };
    const requiredAnchor = requiredAnchorByFrame[sourceModel.eventFrame];
    const anchorApplicable = requiredAnchor && this.contextNarrative.anchorGrammar
      .available(sourceModel)
      .some((construction) => construction.id === requiredAnchor);
    const sourceHasNegative = /ない|なかった|ません|ぬ|ず|無い|なく|できない/.test(source);
    const candidateHasNegative = /ない|なかった|ません|ぬ|ず|無い|なく|できない/.test(candidate);
    const narrativePolarity = !sourceHasNegative || candidateHasNegative ? 1 : 0.35;
    const missingProtected = extractProtectedValues(source).filter((value) => (
      !candidate.normalize("NFKC").includes(value.normalize("NFKC"))
    ));
    const expansionAwareSemantic = base.contentRetention * 0.68
      + narrativePolarity * 0.22
      + (missingProtected.length ? 0 : 0.1);
    const adjustedSemantic = Math.max(base.semantic, Math.min(1, expansionAwareSemantic));
    const narrativeFluency = Math.max(
      0,
      base.fluency - (repeatedFacts.length ? 0.45 : 0) - (repeatedRhetoricalMoves.length ? 0.25 : 0),
    );
    const total = Math.max(0, Math.min(
      1,
      base.total * 0.78
        + narrativeScore * 0.22
        - (repeatedFacts.length ? 0.18 : 0)
        - repeatedRhetoricalMoves.length * 0.08,
    ));
    const warnings = base.warnings.filter((warning) => warning !== "肯定・否定が変化した可能性");
    if (narrativeBeats < requiredNarrativeBeats) warnings.push("入力の出来事型に必要な展開段階が不足");
    if (quoteSignatures.length < 3) warnings.push("名言集由来の展開型が不足");
    if (quoteFunctionalRoles.length < 3) warnings.push("語録が担う展開機能の種類が不足");
    if (anchorApplicable && !anchorSignatures.includes(requiredAnchor)) warnings.push("入力中の参照先に対応するアンカー構文が不足");
    if (repeatedFacts.length) warnings.push("原文の同一事実を重複して使用");
    if (repeatedRhetoricalMoves.length) warnings.push("同じ談話機能を近接して反復");

    return {
      ...base,
      total,
      semantic: adjustedSemantic,
      polarity: narrativePolarity,
      fluency: narrativeFluency,
      narrativeScore,
      narrativeBeats,
      quotePatternCount: quoteSignatures.length,
      quoteSignatures,
      quoteFunctionalRoleCount: quoteFunctionalRoles.length,
      quoteFunctionalRoles,
      anchorConstructionCount: anchorSignatures.length,
      anchorSignatures,
      grammarPatternCount: quoteSignatures.length + anchorSignatures.length,
      repeatedFactCount: repeatedFacts.length,
      repeatedRhetoricalMoveCount: repeatedRhetoricalMoves.length,
      warnings,
      passed: !missingProtected.length
        && adjustedSemantic >= 0.62
        && narrativePolarity >= 0.8
        && narrativeFluency >= 0.65
        && narrativeBeats >= requiredNarrativeBeats
        && quoteSignatures.length >= 3
        && quoteFunctionalRoles.length >= 3
        && repeatedRhetoricalMoves.length === 0
        && base.eraContextMatch
        && (!anchorApplicable || anchorSignatures.includes(requiredAnchor)),
    };
  }

  convertFullContext(source, options) {
    const plainFacts = splitSentences(source).map((sentence) => {
      const casual = replaceAll(sentence, safeReplacements);
      const styled = options.level >= 2 ? replaceAll(casual, mediumReplacements) : casual;
      return formatCorpusEnding(cleanCandidate(styled));
    });
    const baseRawCandidates = this.contextNarrative.candidates(source, {
      random: options.random,
      plainFacts,
    });
    const rawCandidates = options.era === "all"
      ? baseRawCandidates
      : baseRawCandidates.flatMap((candidate) => this.eraGrammar.candidates(candidate, options.era, options.random));
    const candidates = Array.from(new Set(rawCandidates.map((rawCandidate) => {
      let candidate = this.applyEraSurface(rawCandidate, options.era);
      for (const rule of options.customRules.slice(0, 100)) {
        const from = String(rule.from || "").trim();
        const to = String(rule.to || "").trim();
        if (from && to) candidate = candidate.split(from).join(to);
      }
      return cleanCandidate(candidate);
    }).filter(Boolean)));
    const ranked = candidates
      .map((text) => ({ text, validation: this.validateNarrative(source, text, options.level, options.era) }))
      .sort((left, right) => right.validation.total - left.validation.total);
    const passing = ranked.filter((candidate) => candidate.validation.passed);
    const bestScore = passing[0]?.validation.total;
    const shortlist = passing.filter((candidate) => candidate.validation.total >= bestScore - 0.1);
    const shuffled = shuffleValues(shortlist.length ? shortlist : passing.length ? passing : ranked, options.random);
    const sourceKey = `full:${normalizeForSearch(source)}`;
    const recent = options.avoidRepeat ? this.recentSelections.get(sourceKey) : null;
    const freshFamily = shuffled.filter((candidate) => !recent?.families.includes(narrativeFamily(candidate.text)));
    const freshText = shuffled.filter((candidate) => !recent?.texts.includes(candidate.text));
    const localPool = freshFamily.length ? freshFamily : freshText.length ? freshText : shuffled;
    const globalHistory = options.avoidRepeat ? this.recentSelections.get("full:__global__") : null;
    const recentQuoteSignatures = new Set((globalHistory?.signatureBatches || []).flat());
    const immediatelyPreviousSignatures = new Set(globalHistory?.signatureBatches?.[0] || []);
    const recentFamilies = new Set(globalHistory?.families || []);
    const noveltyRows = localPool.map((candidate) => ({
      candidate,
      adjacentOverlap: candidate.validation.quoteSignatures.filter((signature) => immediatelyPreviousSignatures.has(signature)).length,
      historicalOverlap: candidate.validation.quoteSignatures.filter((signature) => recentQuoteSignatures.has(signature)).length
        + (recentFamilies.has(narrativeFamily(candidate.text)) ? 2 : 0),
    }));
    const minimumAdjacentOverlap = Math.min(...noveltyRows.map((row) => row.adjacentOverlap));
    const adjacentNoveltyRows = noveltyRows.filter((row) => row.adjacentOverlap === minimumAdjacentOverlap);
    const minimumHistoricalOverlap = Math.min(...adjacentNoveltyRows.map((row) => row.historicalOverlap));
    const noveltyPool = adjacentNoveltyRows
      .filter((row) => row.historicalOverlap === minimumHistoricalOverlap)
      .map((row) => row.candidate);
    const selected = noveltyPool[0] || localPool[0] || ranked[0];
    if (!selected) throw new Error("完全ブロントナイズ候補を生成できませんでした");

    if (options.avoidRepeat) {
      const history = this.recentSelections.get(sourceKey) || { texts: [], families: [] };
      this.recentSelections.set(sourceKey, {
        texts: [selected.text, ...history.texts.filter((text) => text !== selected.text)].slice(0, 8),
        families: [narrativeFamily(selected.text), ...history.families.filter((family) => family !== narrativeFamily(selected.text))].slice(0, 4),
      });
      const global = this.recentSelections.get("full:__global__") || { signatureBatches: [], families: [] };
      this.recentSelections.set("full:__global__", {
        signatureBatches: [
          selected.validation.quoteSignatures,
          ...global.signatureBatches,
        ].slice(0, 8),
        families: [
          narrativeFamily(selected.text),
          ...global.families.filter((family) => family !== narrativeFamily(selected.text)),
        ].slice(0, 6),
      });
    }

    const optionCandidates = chooseDiverseNarratives([
      selected,
      ...shuffled.filter((candidate) => candidate.text !== selected.text),
      ...ranked,
    ], 3);
    const references = this.retrieve(source, 6, options.era, options.random);
    const comparison = {
      source,
      output: selected.text,
      candidateCount: candidates.length,
      verificationPasses: 1,
      validation: selected.validation,
      diff: diffTokens(source, selected.text),
      references: references.slice(0, 3),
      alternatives: ranked.slice(0, 3).map((candidate) => ({
        text: candidate.text,
        total: candidate.validation.total,
        semantic: candidate.validation.semantic,
        style: candidate.validation.style,
      })),
      options: optionCandidates.map((candidate) => ({ text: candidate.text, validation: candidate.validation })),
      unit: "paragraph",
    };
    const suggestions = optionCandidates.map((candidate) => ({
      text: candidate.text,
      averageTotal: candidate.validation.total,
      averageSemantic: candidate.validation.semantic,
      averageStyle: candidate.validation.style,
    }));

    return {
      text: selected.text,
      suggestions,
      level: options.level,
      contextMode: "full",
      series: options.era,
      era: options.era,
      engine: "corpus-comparison",
      usesLlm: false,
      summary: {
        sentenceCount: 1,
        unit: "paragraph",
        passedCount: selected.validation.passed ? 1 : 0,
        verificationPasses: 1,
        averageTotal: selected.validation.total,
        averageSemantic: selected.validation.semantic,
        averageStyle: selected.validation.style,
        averageFluency: selected.validation.fluency,
      },
      comparisons: [comparison],
    };
  }

  convert(input, options = {}) {
    const source = String(input ?? "").trim();
    if (!source) throw new Error("変換する文章が空です");
    if (source.length > 5000) throw new Error("文章は5000文字以内にしてください");
    const level = Math.min(3, Math.max(1, Number(options.level) || 2));
    const customRules = Array.isArray(options.customRules) ? options.customRules : [];
    const random = createRandom(options.seed);
    const avoidRepeat = options.seed === undefined || options.seed === null || options.seed === "";
    const contextMode = options.contextMode === "full" ? "full" : "faithful";
    const era = this.eraProfiles.resolve(options.series ?? options.era).id;
    if (contextMode === "full") {
      return this.convertFullContext(source, { level, customRules, random, avoidRepeat, era });
    }
    const comparisons = [];
    const comparisonParagraphs = [];
    const outputParagraphs = [];
    const usedFaithfulSignatures = new Set();

    for (const paragraph of source.split(/\n{2,}/)) {
      const sentences = splitSentences(paragraph);
      if (!sentences.length) continue;
      const paragraphComparisons = sentences.map((sentence) => {
        const comparison = this.transformSentence(sentence, {
          level,
          customRules,
          random,
          avoidRepeat,
          usedFaithfulSignatures,
          era,
        });
        comparisons.push(comparison);
        return comparison;
      });
      comparisonParagraphs.push(paragraphComparisons);
      outputParagraphs.push(paragraphComparisons.map((comparison) => comparison.output).join("\n"));
    }

    const output = outputParagraphs.join("\n\n");
    const passedCount = comparisons.filter((comparison) => comparison.validation.passed).length;
    const averages = {
      total: mean(comparisons.map((comparison) => comparison.validation.total)),
      semantic: mean(comparisons.map((comparison) => comparison.validation.semantic)),
      style: mean(comparisons.map((comparison) => comparison.validation.style)),
      fluency: mean(comparisons.map((comparison) => comparison.validation.fluency)),
    };
    const suggestions = [];
    for (let optionIndex = 0; optionIndex < 3; optionIndex += 1) {
      const chosen = comparisonParagraphs.flatMap((paragraph) => paragraph.map((comparison) => (
        comparison.options[optionIndex] || comparison.options[0]
      )));
      const suggestionText = comparisonParagraphs.map((paragraph) => paragraph.map((comparison) => (
        comparison.options[optionIndex] || comparison.options[0]
      ).text).join("\n")).join("\n\n");
      if (!suggestionText || suggestions.some((suggestion) => suggestion.text === suggestionText)) continue;
      suggestions.push({
        text: suggestionText,
        averageTotal: mean(chosen.map((candidate) => candidate.validation.total)),
        averageSemantic: mean(chosen.map((candidate) => candidate.validation.semantic)),
        averageStyle: mean(chosen.map((candidate) => candidate.validation.style)),
      });
    }

    return {
      text: output,
      suggestions,
      level,
      contextMode: "faithful",
      series: era,
      era,
      engine: "corpus-comparison",
      usesLlm: false,
      summary: {
        sentenceCount: comparisons.length,
        passedCount,
        verificationPasses: comparisons.reduce((sum, comparison) => sum + comparison.verificationPasses, 0),
        averageTotal: averages.total,
        averageSemantic: averages.semantic,
        averageStyle: averages.style,
        averageFluency: averages.fluency,
      },
      comparisons,
    };
  }
}

module.exports = { CorpusEngine };
