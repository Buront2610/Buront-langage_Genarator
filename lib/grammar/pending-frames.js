"use strict";

const { stripLeadingConnective } = require("./context-model");
const { pick } = require("./random-utils");

class PendingFrameComposer {
  constructor(quoteGrammar) {
    this.quoteGrammar = quoteGrammar;
  }

  compose(model, helpers) {
    if (model.hasAchievement) return null;
    const mode = model.hasUnresolved
      ? "unresolved"
      : model.eventFrame === "future" ? "future" : null;
    if (!mode) return null;

    const candidates = new Set();
    const aliases = [
      { hero: "俺", family: "self" },
      { hero: "俺の知り合いのナイト", family: "acquaintance" },
      { hero: `一級と言われている${model.persona}`, family: "witness" },
      { hero: `俺のフレの${model.persona}`, family: "friend" },
    ];
    const futureInsights = [
      (hero) => `${hero}は実行前から必要な手順まで見切っている`,
      (hero) => `${hero}は予定と完了を同じに扱うほど浅くはない`,
      (hero) => `準備の段階で${hero}と一般人の格の違いが出ている`,
      (hero) => `${hero}はまだ始まっていない仕事ほど段取りを先に固める`,
    ];
    const futureRestraints = [
      "終わってもいない事を成功扱いするのは三流",
      "実行後の結果が出るまでは勝利宣言をしない",
      "予定は予定なので完了したという事実にはならない",
    ];
    const unresolvedInsights = [
      (hero) => `${hero}は未解決と解決済みを同じに扱わない`,
      (hero) => `${hero}は今わかっている範囲だけを正確に見切っている`,
      (hero) => `原因が確定していない以上${hero}は勝手な勝利宣言をしない`,
      (hero) => `${hero}は復旧していない事実を見落とすほど浅くはない`,
    ];
    const unresolvedRestraints = [
      "まだ決着はついていないので騒ぐと危険",
      "ここで解決したふりをするのは貧弱一般人",
      "復旧していない以上は見事な仕事と言う段階ではない",
    ];

    for (let round = 0; round < 36; round += 1) {
      const alias = pick(helpers.random, aliases);
      const context = helpers.quoteContext(alias.hero, alias.family);
      const opener = this.quoteGrammar.render(
        pick(helpers.random, ["opener_heard", "opener_nonfiction"]),
        context,
      );
      const contrast = this.quoteGrammar.render("contrast_ordinary", context);
      // 系列外枠が冒頭へ付いても、対比・時間判断・結論の3機能を必ず残す。
      // nonfiction を冒頭と結論で重ねると同じ談話機能の反復になるため使わない。
      const conclusion = this.quoteGrammar.render("conclusion_step_back", context);
      const insight = mode === "future"
        ? pick(helpers.random, futureInsights)(alias.hero)
        : pick(helpers.random, unresolvedInsights)(alias.hero);
      const contextualizedInsight = mode === "future"
        ? this.quoteGrammar.render("intervention_simulation", { ...context, payload: insight })
        : insight;
      const lines = mode === "future"
        ? [
          opener,
          ...model.facts.map(stripLeadingConnective),
          contrast,
          contextualizedInsight,
          pick(helpers.random, futureRestraints),
          conclusion,
        ]
        : [
          opener,
          ...model.facts.map(stripLeadingConnective),
          helpers.crisisFor(alias.hero, alias.family),
          contrast,
          contextualizedInsight,
          pick(helpers.random, unresolvedRestraints),
          conclusion,
        ];
      candidates.add(lines.filter(Boolean).join("\n"));
    }
    return Array.from(candidates);
  }
}

module.exports = { PendingFrameComposer };
