"use strict";

const { achievementScore, isProblemFact, stripLeadingConnective } = require("./context-model");
const { paraphraseFact } = require("./fact-paraphraser");
const { pick } = require("./random-utils");

function cleanFact(value) {
  return stripLeadingConnective(value).replace(/[。！？!?]+$/g, "").trim();
}

function clauses(value) {
  return cleanFact(value).split(/[、,]/).map((item) => item.trim()).filter(Boolean);
}

function splitActionResult(model, index, fact) {
  if (index !== model.achievementIndex || index !== model.actionIndex) return null;
  const parts = clauses(fact);
  if (parts.length < 2) return null;
  const splitAt = parts.findIndex((part, partIndex) => partIndex > 0 && achievementScore(part) > 0);
  if (splitAt < 1) return null;
  return {
    action: parts.slice(0, splitAt).join("、"),
    result: parts.slice(splitAt).join("、"),
  };
}

function factRole(model, index, fact) {
  if (index === model.problemIndex && index > model.achievementIndex) return "aftershock";
  if (index === model.futureIndex) return "future";
  if (index === model.achievementIndex) return "result";
  if (index === model.actionIndex
    || /(?:俺|私|僕|自分)(?:は|が).{0,80}(?:作り|作成|用意|実装|導入|構築|開発|自動化|切り替え|組み|修正)/.test(fact)) {
    return "action";
  }
  if (index === 0) return "setting";
  if (/締切|期限|時間切れ|半分しか終わ|未完了/.test(fact)) return "problem";
  if (isProblemFact(fact)) return "problem";
  if (achievementScore(fact) > 0) return "result";
  return "background";
}

function paraphraseRole(role) {
  return ({
    aftershock: "aftermath",
    action_result: "result",
  })[role] || role;
}

function attributeActor(fact, hero) {
  return String(fact ?? "").replace(
    /^((?:そこで|そのため|すると)?)(?:俺|私|僕|自分)(は|が)/,
    `$1${hero}$2`,
  );
}

function directRewrite(fact, role, hero, random) {
  const text = paraphraseFact(
    attributeActor(fact, hero),
    paraphraseRole(role),
    random,
    { aggressiveParticles: true },
  );
  if (role === "action" && !/ｶｶッ/.test(text)) {
    const boundary = text.indexOf("　");
    return boundary >= 0
      ? `${text.slice(0, boundary + 1)}ｶｶッっと${text.slice(boundary + 1)}`
      : `ｶｶッっと${text}`;
  }
  if (role === "aftershock" && !/超状現象/.test(text)) {
    return `因みに${text.replace(/^因みに/, "")}　これが超状現象`;
  }
  return text;
}

function rewriteFact(model, index, hero = "俺", random = Math.random) {
  const fact = model.facts[index];
  const combined = splitActionResult(model, index, fact);
  if (combined) {
    return {
      index,
      role: "action_result",
      source: fact,
      text: [
        directRewrite(combined.action, "action", hero, random),
        directRewrite(combined.result, "result", hero, random),
      ].join("\n"),
    };
  }
  const role = factRole(model, index, fact);
  return {
    index,
    role,
    source: fact,
    text: directRewrite(fact, role, hero, random),
  };
}

function rewriteFactList(model, hero = "俺", random = Math.random) {
  return model.facts.flatMap((fact, index) => {
    const combined = splitActionResult(model, index, fact);
    if (!combined) return [rewriteFact(model, index, hero, random)];
    return [
      { index, role: "action", source: fact, text: directRewrite(combined.action, "action", hero, random) },
      { index, role: "result", source: fact, text: directRewrite(combined.result, "result", hero, random) },
    ];
  });
}

class LongFormComposer {
  constructor(quoteGrammar, anchorGrammar) {
    this.quoteGrammar = quoteGrammar;
    this.anchorGrammar = anchorGrammar;
  }

  eventAnchor(model, context, random) {
    if (model.eventFrame === "gratitude") {
      const selected = this.anchorGrammar.selectTarget(model, "source", random, { allowAny: false });
      return this.anchorGrammar.render("fused_performative", { target: selected.target });
    }
    if (model.eventFrame === "agreement") {
      const selected = this.anchorGrammar.selectTarget(model, "supporter", random, { allowAny: false });
      return this.anchorGrammar.render("agreement_target", { target: selected.target });
    }
    if (model.eventFrame === "evidence") {
      const selected = this.anchorGrammar.selectTarget(model, "source", random, { allowAny: false });
      return this.anchorGrammar.render("evidence_source", { target: selected.target });
    }
    if (model.eventFrame === "challenge") {
      const selected = this.anchorGrammar.selectTarget(model, "opponent", random, { allowGoro: true });
      return this.quoteGrammar.render("retort_fangs", {
        ...context,
        replyTarget: selected.target,
        replyCoda: selected.coda,
      });
    }
    return "";
  }

  compose(model, helpers) {
    if (model.facts.length < 4 || !model.hasAchievement) return null;
    const candidates = new Set();
    const aliases = helpers.heroAliases;

    for (let round = 0; round < 42; round += 1) {
      const alias = pick(helpers.random, aliases);
      const context = helpers.quoteContext(alias.hero, alias.family);
      const rewritten = rewriteFactList(model, alias.hero, helpers.random);
      const byRole = (role) => rewritten.filter((item) => item.role === role).map((item) => item.text);
      const setting = [...byRole("setting"), ...byRole("background")];
      const problems = byRole("problem");
      const actions = byRole("action");
      const results = byRole("result");
      const aftershocks = byRole("aftershock");
      const futures = byRole("future");
      const crisis = helpers.crisisFor(alias.hero, alias.family);
      const interventionPayload = actions.length
        ? actions.join("\n")
        : `${alias.hero}は状況を一瞬で見切って必要な一手だけ出した`;
      const intervention = this.quoteGrammar
        .pick("intervention", { ...context, payload: interventionPayload }, helpers.random).text;
      const reaction = helpers.reactionFor(alias.hero, alias.family);
      const conclusion = helpers.conclusionFor(alias.hero, alias.family);
      const anchor = this.eventAnchor(model, context, helpers.random);
      const chronological = [
        helpers.openerFor(alias.hero, alias.family),
        ...setting,
        crisis,
        ...problems,
        anchor,
        intervention,
        ...results,
        reaction,
        ...aftershocks,
        ...futures,
        conclusion,
      ];
      const resultFirst = [
        this.quoteGrammar.render("opener_prophecy", context),
        ...results,
        ...setting,
        crisis,
        ...problems,
        anchor,
        intervention,
        reaction,
        ...aftershocks,
        ...futures,
        conclusion,
      ];
      const disruptionFirst = [
        ...(aftershocks.length ? aftershocks : [crisis]),
        helpers.openerFor(alias.hero, alias.family),
        ...setting,
        ...(aftershocks.length ? [crisis] : []),
        ...problems,
        anchor,
        intervention,
        ...results,
        reaction,
        ...futures,
        conclusion,
      ];
      const evidenceFirst = [
        this.quoteGrammar.render("opener_evidence", context),
        ...results,
        ...setting,
        crisis,
        ...problems,
        anchor,
        intervention,
        reaction,
        ...aftershocks,
        ...futures,
        conclusion,
      ];
      const plans = model.hasNumbers
        ? [chronological, resultFirst, disruptionFirst, evidenceFirst]
        : [chronological, resultFirst, disruptionFirst];
      candidates.add(pick(helpers.random, plans).filter(Boolean).join("\n"));
    }
    return Array.from(candidates);
  }
}

module.exports = {
  LongFormComposer,
  factRole,
  rewriteFact,
  rewriteFactList,
};
