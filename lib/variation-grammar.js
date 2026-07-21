"use strict";

function createRandom(seed) {
  if (seed === undefined || seed === null || seed === "") return Math.random;
  let state = 2166136261;
  for (const character of String(seed)) {
    state ^= character.codePointAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length) % values.length];
}

function shuffle(random, values) {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

class VariationGrammar {
  constructor(posts) {
    const corpusText = posts.map((post) => post.content).join("\n");
    this.endings = [
      {
        evidence: "でしょう",
        observed: /でしょう/.test(corpusText),
        pattern: /でしょう/,
        apply: (predicate) => `${predicate}でしょう？`,
      },
      {
        evidence: "なんだが",
        observed: /なんだが/.test(corpusText),
        pattern: /んだが/,
        apply: (predicate) => `${predicate}んだが？`,
      },
      {
        evidence: "確定的に明らか",
        observed: /確定的に明らか/.test(corpusText),
        pattern: /確定的に明らか/,
        apply: (predicate) => `${predicate}のは確定的に明らか`,
      },
      {
        evidence: "だろ",
        observed: /だろ/.test(corpusText),
        pattern: /だろ/,
        apply: (predicate) => `${predicate}だろ・・`,
      },
    ].filter((ending) => ending.observed);
  }

  createEndingBag(random) {
    let bag = [];
    return (predicate) => {
      if (!bag.length) bag = shuffle(random, this.endings);
      return bag.shift().apply(predicate);
    };
  }

  coldCandidates(source, random) {
    if (!/(?:寒い|寒すぎる|寒過ぎる|冷え|気温.{0,8}低い)/.test(source)) return [];

    const time = source.match(/今日|今夜|今朝|昨日|明日/)?.[0] || "今";
    const applyEnding = this.createEndingBag(random);
    const subjects = [
      {
        text: `${time}の冷え込み`,
        thresholds: [
          { text: "激しくなりすぎている", intensifiable: true },
          { text: "防寒装備を貫通する勢いになっている", intensifiable: false },
          { text: "普通の寒さの域を超えている", intensifiable: false },
        ],
      },
      {
        text: `${time}の寒気`,
        thresholds: [
          { text: "強くなりすぎている", intensifiable: true },
          { text: "防寒装備を貫通する勢いになっている", intensifiable: false },
          { text: "普通の寒さの域を超えている", intensifiable: false },
        ],
      },
      {
        text: `${time}の気温`,
        thresholds: [
          { text: "低くなりすぎている", intensifiable: true },
          { text: "貧弱一般人が耐えられる温度ではない", intensifiable: false },
          { text: "防寒装備では耐えられない低温になっている", intensifiable: false },
        ],
      },
      {
        text: `${time}の冷気`,
        thresholds: [
          { text: "強くなりすぎている", intensifiable: true },
          { text: "防寒装備を貫通する勢いになっている", intensifiable: false },
          { text: "普通の寒さの域を超えている", intensifiable: false },
        ],
      },
    ];
    const intensifiers = ["かなり", "圧倒的に", "あもりにも", "本気で"];
    const physicalEffects = [
      "指先の感覚がなくなる",
      "手足の震えが止まらなくなる",
      "吐く息が真っ白になる",
      "身体の動きが鈍くなる",
    ];
    const consequences = [
      "体温を一瞬で持っていかれる",
      "防寒装備なしでは時既に時間切れ",
      "貧弱一般人なら致命的な致命傷になる",
      "寒さで寿命がﾏｯﾊになる",
    ];

    const builders = [
      () => {
        const subject = pick(random, subjects);
        const threshold = pick(random, subject.thresholds);
        const emphasis = threshold.intensifiable ? pick(random, intensifiers) : "";
        return applyEnding(`${subject.text}は${emphasis}${threshold.text}`);
      },
      () => applyEnding(`${time}は${pick(random, physicalEffects)}ほど${pick(random, intensifiers)}冷え込んでいる`),
      () => `${pick(random, subjects).text}を甘く見て外に出ると${pick(random, consequences)}`,
      () => `${pick(random, subjects).text}が本気を出したせいで${pick(random, physicalEffects)}`,
    ];

    const candidates = new Set();
    for (let round = 0; round < 4; round += 1) {
      for (const build of shuffle(random, builders)) candidates.add(build());
    }
    return Array.from(candidates);
  }

  genericCandidates(source, random) {
    const stem = String(source ?? "").trim().replace(/[。！？!?]+$/g, "");
    if (stem.length < 3 || stem.length > 48) return [];

    const openers = ["やはり", "どうやら", "俺が見た限りでは", "つまり"];
    const reactions = [
      "周りも驚きの眼差しになった",
      "貧弱一般人は言葉を失う",
      "俺の驚きがﾏｯﾊになった",
      "一般人にも格の違いがわかる",
    ];
    const judgments = [
      "普通ではないでしょう？",
      "確定的に明らか",
      "かなりの破壊力",
      "貧弱一般人には真似できない",
    ];
    const storyFrames = [
      () => `${stem}という話なんだが？`,
      () => `${stem}という話を聞いたんだが？`,
      () => `前から思ってた事なんだが${stem}`,
      () => `どうやら${stem}という話らしい`,
    ];
    const builders = [
      () => `${pick(random, openers)}${stem}`,
      () => pick(random, storyFrames)(),
      () => `${stem}という現実に${pick(random, reactions)}`,
      () => `${stem}という時点で${pick(random, judgments)}`,
    ];

    const candidates = new Set();
    for (let round = 0; round < 3; round += 1) {
      for (const build of shuffle(random, builders)) candidates.add(build());
    }
    return Array.from(candidates);
  }

  candidates(source, options = {}) {
    const random = options.random || Math.random;
    const text = String(source ?? "").trim();
    const semantic = this.coldCandidates(text, random);
    return semantic.length ? semantic : this.genericCandidates(text, random);
  }
}

module.exports = { VariationGrammar, createRandom };
