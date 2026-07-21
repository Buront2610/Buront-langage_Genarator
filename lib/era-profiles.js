"use strict";

const archiveSeries = require("../data/archive-series.json");
const { aggregateFeatures, buildNgramModel } = require("./text-analysis");

const descriptions = Object.freeze({
  roto: "倉庫分類『ロト時代＋暗黒騎士系』",
  yorusama: "倉庫分類『グラットンスレ系』",
  saiko: "倉庫分類『最高の騎士系』",
  night: "倉庫分類『名無し系（2003～2004）』。言行録でいう雌伏期",
  puronohito: "倉庫分類『鯖スレ系』",
  nega: "倉庫分類『ネガ侍系』",
  katuru: "倉庫分類『謙虚な騎士系』。『ナイトと忍者のLS信頼度は違いすぎた』以降",
  gg: "倉庫分類『ギルティギア系』",
  sonota: "倉庫分類『その他』",
});

const eraDefinitions = Object.freeze([
  Object.freeze({
    id: "all",
    label: "全系列",
    shortLabel: "全系列",
    description: "全2,452投稿。系列ページ外の補完73投稿を含む",
    sourceUrl: archiveSeries.sourceIndexUrl,
    postIds: null,
  }),
  ...archiveSeries.series.map((series) => Object.freeze({
    ...series,
    description: descriptions[series.id],
  })),
]);

const profileCache = new Map();

function inDefinition(post, definition) {
  if (!definition || definition.id === "all" || !definition.postIds) return true;
  if (definition.postIds instanceof Set) return definition.postIds.has(post.id);
  return definition.postIds.includes(post.id);
}

function rate(text, pattern) {
  return Number((((text.match(pattern) || []).length / Math.max(1, text.length)) * 10000).toFixed(3));
}

function dateRange(posts) {
  const dates = posts
    .map((post) => String(post.date || ""))
    .filter((date) => /^\d{4}-\d{2}-\d{2}/.test(date))
    .sort();
  return dates.length ? [dates[0], dates.at(-1)] : null;
}

class EraProfileRegistry {
  constructor(posts, sentences) {
    const cacheKey = `${archiveSeries.generatedAt}:${posts.length}:${sentences.length}:${posts[0]?.id || ""}:${posts.at(-1)?.id || ""}`;
    if (profileCache.has(cacheKey)) {
      this.profiles = profileCache.get(cacheKey);
      return;
    }
    this.profiles = new Map(eraDefinitions.map((definition) => {
      const configuredPostIds = definition.postIds ? new Set(definition.postIds) : null;
      const eraPosts = configuredPostIds
        ? posts.filter((post) => configuredPostIds.has(post.id))
        : posts;
      const postIds = new Set(eraPosts.map((post) => post.id));
      const eraSentences = sentences.filter((sentence) => postIds.has(sentence.postId));
      const texts = eraSentences.map((sentence) => sentence.text);
      const postText = eraPosts.map((post) => post.content).join("\n");
      const averagePostLength = eraPosts.reduce((sum, post) => sum + post.content.length, 0) / Math.max(1, eraPosts.length);
      return [definition.id, {
        ...definition,
        postIds,
        postCount: eraPosts.length,
        sentenceCount: eraSentences.length,
        dateRange: dateRange(eraPosts),
        averagePostLength: Number(averagePostLength.toFixed(2)),
        features: aggregateFeatures(texts),
        ngrams: buildNgramModel(texts, { sizes: [3, 4], limitPerSize: 12000 }),
        markerRates: {
          halfwidthKana: rate(postText, /[ｦ-ﾟ]/g),
          beQuestion: rate(postText, /べ[？?]/g),
          certainty: rate(postText, /確定的|決定的|明らか|証明/g),
          canonical: rate(postText, /黄金の鉄|一般人|Ｐスキル|ﾌﾟﾚｲﾔｰｽｷﾙ|遅れをとる/g),
          narrative: rate(postText, /いたんだが|見ていたら|案の定|思い出したので|アワレ/g),
          semicolonEmoticon: rate(postText, /[＾^]{2}[；;]{2,}/g),
        },
      }];
    }));
    profileCache.set(cacheKey, this.profiles);
  }

  resolve(id) {
    return this.profiles.get(id) || this.profiles.get("all");
  }

  includesSentence(sentence, id) {
    return this.resolve(id).postIds.has(sentence.postId);
  }

  status() {
    return eraDefinitions.map((definition) => {
      const profile = this.resolve(definition.id);
      return {
        id: profile.id,
        label: profile.label,
        shortLabel: profile.shortLabel,
        description: profile.description,
        sourceUrl: profile.sourceUrl,
        postCount: profile.postCount,
        sentenceCount: profile.sentenceCount,
        dateRange: profile.dateRange,
        averagePostLength: profile.averagePostLength,
        markerRates: profile.markerRates,
      };
    });
  }
}

module.exports = { EraProfileRegistry, archiveSeries, eraDefinitions, inDefinition };
