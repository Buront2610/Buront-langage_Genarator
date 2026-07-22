"use strict";

const { shuffle } = require("./random-utils");

// log.html が示す9系列ごとの談話構造。evidence は必ず同じ系列ページ内の
// 投稿で照合し、別系列で見つかっただけの語句は有効化しない。
const eraFrameDefinitions = Object.freeze({
  roto: Object.freeze([
    {
      id: "roto_decided",
      role: "direct-verdict",
      evidence: "決まってるべ",
      marker: /これで決まってるべ[？?]?$/,
      render: (base) => `どう考えても\n${base}\nこれで決まってるべ？`,
    },
    {
      id: "roto_no_objection",
      role: "challenge-to-reader",
      evidence: "文句ないべ",
      marker: /文句ないべ[？?]?$/,
      render: (base) => `${base}\n文句ないべ？`,
    },
    {
      id: "roto_understood",
      role: "reader-confirmation",
      evidence: "よくわかったべな",
      marker: /よくわかったべな[？?]?$/,
      render: (base) => `${base}\nおまえらもよくわかったべな？`,
    },
  ]),
  yorusama: Object.freeze([
    {
      id: "yorusama_elite_proof",
      role: "equipment-status-proof",
      evidence: "一級廃人の証",
      marker: /これが一級廃人の証$/,
      render: (base) => `ちなみに俺はこの話を見切ってるんだが\n${base}\nこれが一級廃人の証`,
    },
    {
      id: "yorusama_admiration",
      role: "admiration-consequence",
      evidence: "うらやましがられて尊敬され",
      marker: /この(?:結果なら|準備なら実行後に)うらやましがられて尊敬される$/,
      render: (base) => `${base}\nこの結果ならうらやましがられて尊敬される`,
      renderPending: (base) => `${base}\nこの準備なら実行後にうらやましがられて尊敬される`,
    },
    {
      id: "yorusama_authority",
      role: "status-authority",
      evidence: "発言権強く",
      marker: /この事実だけで発言権が強くなる$/,
      render: (base) => `やはり\n${base}\nこの事実だけで発言権が強くなる`,
    },
  ]),
  saiko: Object.freeze([
    {
      id: "saiko_needed",
      role: "needed-hero-entry",
      evidence: "ナイトならではの出来事",
      marker: /最高のナイトならではの出来事というリアル話$/,
      render: (base) => `どうやら俺の力が必要らしい\n${base}\n最高のナイトならではの出来事というリアル話`,
    },
    {
      id: "saiko_in_demand",
      role: "social-demand-boast",
      evidence: "おれほどのスキルの持ち主は常に引っ張りだこ",
      marker: /おれほどのスキルの持ち主は常に引っ張りだこ$/,
      render: (base) => `${base}\nおれほどのスキルの持ち主は常に引っ張りだこ`,
    },
    {
      id: "saiko_entry",
      role: "reluctant-intervention",
      evidence: "最高の騎士",
      marker: /これが最高の騎士の(?:実力|段取り)$/,
      render: (base) => `仕方ないから参入したところ\n${base}\nこれが最高の騎士の実力`,
      renderPending: (base) => `仕方ないから参入前の手順を見切ったところ\n${base}\nこれが最高の騎士の段取り`,
    },
  ]),
  night: Object.freeze([
    {
      id: "night_win_confirming",
      role: "accumulating-victory-proof",
      evidence: "勝ちは確定してきた",
      marker: /この(?:事実で勝ちは確定してきた|準備だけで勝ちは確定してきたとはまだ言わない)$/,
      render: (base) => `お前らは馬鹿すぐる\n${base}\nこの事実で勝ちは確定してきた`,
      renderPending: (base) => `お前らは馬鹿すぐる\n${base}\nこの準備だけで勝ちは確定してきたとはまだ言わない`,
    },
    {
      id: "night_iron",
      role: "ancient-knight-superiority",
      evidence: "黄金の鉄の塊",
      marker: /黄金の鉄の塊なら遅れをとるはずは無い$/,
      render: (base) => `俺はただの通りすがりの古代からいるナイトだが\n${base}\n黄金の鉄の塊なら遅れをとるはずは無い`,
    },
    {
      id: "night_superlative",
      role: "canonical-superlative",
      evidence: "高確率で一番最強",
      marker: /この結論は高確率で一番最強$/,
      render: (base) => `やはり\n${base}\nこの結論は高確率で一番最強`,
    },
  ]),
  puronohito: Object.freeze([
    {
      id: "puronohito_gear_gap",
      role: "professional-equipment-gap",
      evidence: "超装備",
      marker: /これが超装備と一般装備の格の違い$/,
      render: (base) => `プロから見ると\n${base}\nこれが超装備と一般装備の格の違い`,
    },
    {
      id: "puronohito_guidance",
      role: "professional-guidance",
      evidence: "もっと上を目指すべき",
      marker: /もっと上を目指すべき$/,
      render: (base) => `ほう、おまえは少しは力をわかってるようだな\n${base}\nもっと上を目指すべき`,
    },
    {
      id: "puronohito_proof",
      role: "professional-dismissal",
      evidence: "ここまで言ってわからないのはザコの証拠となる",
      marker: /ここまで言ってわからないのはザコの証拠となる$/,
      render: (base) => `やはり\n${base}\nここまで言ってわからないのはザコの証拠となる`,
    },
  ]),
  nega: Object.freeze([
    {
      id: "nega_campaign",
      role: "sarcastic-rebuttal",
      evidence: "ネガキャン",
      marker: /これ以上のネガキャンは見苦しい[\^;]*$/,
      render: (base) => `たいがいにしろ\n${base}\nこれ以上のネガキャンは見苦しい＾＾；；`,
    },
    {
      id: "nega_top_ranker",
      role: "ranked-analysis",
      evidence: "トップランカー",
      marker: /トップランカーから見ればこの結論で終了$/,
      render: (base) => `トップランカーの視点で見ると\n${base}\nトップランカーから見ればこの結論で終了`,
    },
    {
      id: "nega_no_risk",
      role: "mechanical-dismissal",
      evidence: "ノーリスク",
      marker: /ノーリスクなのに否定する理由がないでしょう[\^;]*$/,
      render: (base) => `${base}\nノーリスクなのに否定する理由がないでしょう＾＾；；`,
    },
  ]),
  katuru: Object.freeze([
    {
      id: "katuru_witness",
      role: "witnessed-sequence",
      evidence: "案の定",
      marker: /案の定(?:この結果|ここまでが準備の結果)$/,
      render: (base) => `俺はその場にいたんだが\n${base}\n案の定この結果`,
      renderPending: (base) => `俺はその予定を聞いたんだが\n${base}\n案の定ここまでが準備の結果`,
    },
    {
      id: "katuru_victory",
      role: "urgent-victory",
      evidence: "これで勝つる",
      marker: /これで勝つる(?:と言うのは実行後)?$/,
      render: (base) => `おれはジュノにいたので急いだ\n${base}\nこれで勝つる`,
      renderPending: (base) => `おれはジュノにいたので急いで段取りを組んだ\n${base}\nこれで勝つると言うのは実行後`,
    },
    {
      id: "katuru_urgent",
      role: "compressed-achievement",
      evidence: "きょうきょ参戦",
      marker: /普通ならまだかかる時間で(?:きょうきょ完了|今はきょうきょ準備)$/,
      render: (base) => `きょうきょ参戦すると\n${base}\n普通ならまだかかる時間できょうきょ完了`,
      renderPending: (base) => `きょうきょ準備すると\n${base}\n普通ならまだかかる時間で今はきょうきょ準備`,
    },
  ]),
  gg: Object.freeze([
    {
      id: "gg_experience",
      role: "combat-experience",
      evidence: "ほう、経験が生きたな",
      marker: /ほう、経験が(?:生きた|生きる段取りだ)な$/,
      render: (base) => `何いきなり話かけて来てるわけ？と言われたが\n${base}\nほう、経験が生きたな`,
      renderPending: (base) => `何いきなり予定を話して来てるわけ？と言われたが\n${base}\nほう、経験が生きる段取りだな`,
    },
    {
      id: "gg_victory_condition",
      role: "rule-bound-victory",
      evidence: "限られたルールの中で勝利条件を満たしただけ",
      marker: /限られた(?:ルールの中で結果を満たした|予定の中で条件を満たす段取りを組んだ)だけ$/,
      render: (base) => `${base}\n時既に時間切れ\n限られたルールの中で結果を満たしただけ`,
      renderPending: (base) => `${base}\n時既に準備時間\n限られた予定の中で条件を満たす段取りを組んだだけ`,
    },
    {
      id: "gg_timeup",
      role: "combat-taunt",
      evidence: "俺はこのままﾀｲﾑｱｯﾌﾟでもいいんだが",
      marker: /俺はこのままでもいいんだが[？?]?$/,
      render: (base) => `お前それで良いのか？\n${base}\n俺はこのままでもいいんだが？`,
    },
  ]),
  sonota: Object.freeze([
    {
      id: "sonota_objective",
      role: "self-declared-objectivity",
      evidence: "中立の超客観的意見",
      marker: /これは中立の超客観的意見$/,
      render: (base) => `客観的に見て\n${base}\nこれは中立の超客観的意見`,
    },
    {
      id: "sonota_no_assumption",
      role: "anti-assumption",
      evidence: "証拠もないのに決め付けてんじゃねーよ",
      marker: /証拠もないのに決め付けるな$/,
      render: (base) => `俺はただの通りすがりなんだが\n${base}\n証拠もないのに決め付けるな`,
    },
    {
      id: "sonota_true_form",
      role: "direct-challenge",
      evidence: "真実の姿で挑め",
      marker: /真実の姿で挑め$/,
      render: (base) => `正々堂々と受けて立つ\n${base}\n真実の姿で挑め`,
    },
  ]),
});

function normalize(value) {
  return String(value ?? "").normalize("NFKC");
}

class EraGrammar {
  constructor(posts, eraRegistry) {
    this.eraRegistry = eraRegistry;
    this.frames = eraFrameDefinitions;
    this.evidenceLedger = [];
    for (const [eraId, frames] of Object.entries(this.frames)) {
      const profile = this.eraRegistry.resolve(eraId);
      const corpus = normalize(posts
        .filter((post) => profile.postIds.has(post.id))
        .map((post) => post.content)
        .join("\n"));
      for (const frame of frames) {
        const observed = corpus.includes(normalize(frame.evidence));
        this.evidenceLedger.push({ eraId, frame: frame.id, evidence: frame.evidence, observed });
      }
    }
    const missing = this.evidenceLedger.filter((entry) => !entry.observed);
    if (missing.length) {
      throw new Error(`系列構文の系列別根拠が見つかりません: ${missing.map((entry) => entry.frame).join("、")}`);
    }
  }

  candidates(base, eraId, random = Math.random, options = {}) {
    const frames = this.frames[eraId] || [];
    return shuffle(random, frames).map((frame) => (
      options.temporalPending && frame.renderPending
        ? frame.renderPending(base)
        : frame.render(base)
    ));
  }

  signatures(text) {
    const value = normalize(text);
    return Object.entries(this.frames).flatMap(([eraId, frames]) => frames
      .filter((frame) => frame.marker.test(value))
      .map((frame) => ({ eraId, id: frame.id, role: frame.role })));
  }

  status() {
    return {
      frameCount: Object.values(this.frames).flat().length,
      evidenceLinkedFrames: this.evidenceLedger.filter((entry) => entry.observed).length,
      framesByEra: Object.fromEntries(Object.entries(this.frames).map(([eraId, frames]) => [
        eraId,
        frames.map((frame) => frame.id),
      ])),
    };
  }
}

module.exports = { EraGrammar, eraFrameDefinitions };
