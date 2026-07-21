"use strict";

const { stripLeadingConnective } = require("./context-model");
const { pick } = require("./random-utils");

class ObservationFrameComposer {
  constructor(quoteGrammar) {
    this.quoteGrammar = quoteGrammar;
  }

  compose(model, helpers) {
    if (!["observation", "evaluation"].includes(model.eventFrame)) return null;

    const candidates = new Set();
    const aliases = [
      { hero: "俺", family: "self" },
      { hero: "俺の知り合いのナイト", family: "acquaintance" },
      { hero: `一級と言われている${model.persona}`, family: "witness" },
      { hero: `俺のフレの${model.persona}`, family: "friend" },
    ];
    const reactionIds = ["reaction_heard", "reaction_unique"];
    const conclusionIds = ["conclusion_rank", "conclusion_nonfiction", "conclusion_unrelated", "conclusion_not_much"];

    for (let round = 0; round < 30; round += 1) {
      const alias = pick(helpers.random, aliases);
      const context = helpers.quoteContext(alias.hero, alias.family);
      const contrast = this.quoteGrammar.pick("contrast", context, helpers.random).text;
      const reaction = this.quoteGrammar.render(pick(helpers.random, reactionIds), context);
      const conclusion = this.quoteGrammar.render(pick(helpers.random, conclusionIds), context);
      let interpretation = model.eventFrame === "evaluation"
        ? model.evaluationPolarity === "negative"
          ? `普通の一般人でもこの${model.evaluationNoun}は見逃せないが${alias.hero}なら原因まで見切る`
          : `普通の一般人なら表面だけ見て終わるが${alias.hero}は${model.evaluationNoun}の格まで一瞬で見切った`
        : `普通の一般人ならただ眺めて終わるところを${alias.hero}は細部まで一瞬で見切った`;

      if (/見落とす|見切る/.test(contrast)) {
        interpretation = model.eventFrame === "evaluation"
          ? model.evaluationPolarity === "negative"
            ? `普通の一般人でも違和感は持つが${alias.hero}はこの${model.evaluationNoun}の原因まで正確に把握していた`
            : `普通の一般人なら表面だけ見て終わるが${alias.hero}はこの${model.evaluationNoun}を正確に評価していた`
          : `普通の一般人ならただ眺めて終わるところを${alias.hero}は数も動きも正確に把握していた`;
      }

      candidates.add([
        helpers.openerFor(alias.hero, alias.family),
        ...model.facts.map(stripLeadingConnective),
        interpretation,
        contrast,
        reaction,
        conclusion,
      ].filter(Boolean).join("\n"));
    }

    return Array.from(candidates);
  }
}

module.exports = { ObservationFrameComposer };
