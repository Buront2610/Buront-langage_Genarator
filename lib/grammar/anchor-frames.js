"use strict";

const { stripLeadingConnective } = require("./context-model");
const { pick } = require("./random-utils");

const frameDefinitions = Object.freeze({
  gratitude: Object.freeze({
    construction: "fused_performative",
    role: "source",
    bridge: (hero) => `${hero}は礼を言うべき相手まで見誤るほど浅くはない`,
  }),
  agreement: Object.freeze({
    construction: "agreement_target",
    role: "supporter",
    bridge: (hero) => `意見の中身を見れば${hero}と同じ結論になるのは確定的に明らか`,
  }),
  evidence: Object.freeze({
    construction: "evidence_source",
    role: "source",
    bridge: () => "口だけではなく記録まで揃っているので反論の余地がにい",
  }),
});

class AnchorFrameComposer {
  constructor(anchorGrammar) {
    this.anchorGrammar = anchorGrammar;
  }

  compose(model, helpers) {
    const frame = frameDefinitions[model.eventFrame];
    if (!frame) return null;
    const selectedTarget = this.anchorGrammar.selectTarget(
      model,
      frame.role,
      helpers.random,
      { allowAny: false },
    );
    if (!selectedTarget.target) return null;

    const candidates = new Set();
    const facts = model.facts.map(stripLeadingConnective);
    const anchorLine = this.anchorGrammar.render(frame.construction, {
      target: selectedTarget.target,
    });
    for (let round = 0; round < 30; round += 1) {
      const alias = pick(helpers.random, helpers.heroAliases);
      const lines = [
        helpers.openerFor(alias.hero, alias.family),
        ...facts,
        anchorLine,
        frame.bridge(alias.hero),
        helpers.crisisFor(alias.hero, alias.family),
        helpers.reactionFor(alias.hero, alias.family),
        helpers.conclusionFor(alias.hero, alias.family),
      ].filter(Boolean);
      candidates.add(lines.join("\n"));
    }
    return Array.from(candidates);
  }
}

module.exports = { AnchorFrameComposer, frameDefinitions };
