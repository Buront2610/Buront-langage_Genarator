"use strict";

const { QuoteGrammar } = require("./quote-grammar");
const { AnchorGrammar } = require("./grammar/anchor-grammar");
const { AnchorFrameComposer } = require("./grammar/anchor-frames");
const { ObservationFrameComposer } = require("./grammar/observation-frames");
const { ContextModelExtractor, stripLeadingConnective } = require("./grammar/context-model");
const { pick, shuffle } = require("./grammar/random-utils");

class ContextNarrativeGenerator {
  constructor() {
    this.quoteGrammar = new QuoteGrammar();
    this.anchorGrammar = new AnchorGrammar();
    this.anchorFrameComposer = new AnchorFrameComposer(this.anchorGrammar);
    this.observationFrameComposer = new ObservationFrameComposer(this.quoteGrammar);
    this.modelExtractor = new ContextModelExtractor(this.anchorGrammar);
  }

  extractModel(source, plainFacts) {
    return this.modelExtractor.extract(source, plainFacts);
  }

  replyAnchor(model, random = Math.random) {
    const selected = this.anchorGrammar.selectTarget(model, "opponent", random, { allowGoro: true });
    return { target: selected.target, coda: selected.coda, family: selected.family };
  }

  candidates(source, options = {}) {
    const random = options.random || Math.random;
    const model = this.extractModel(source, options.plainFacts || []);
    if (!model.facts.length) return [];

    const firstFact = model.facts[0];
    const achievementFact = model.achievementIndex >= 0
      ? model.facts[model.achievementIndex]
      : model.facts[Math.min(1, model.facts.length - 1)];
    const problemFact = model.problemIndex >= 0 ? stripLeadingConnective(model.facts[model.problemIndex]) : null;
    const futureFact = model.futureIndex >= 0 ? model.facts[model.futureIndex] : null;
    const actionFact = model.actionIndex >= 0 ? stripLeadingConnective(model.facts[model.actionIndex]) : null;
    const backgroundFacts = model.facts.filter((fact, index) => (
      index > 0
      && index < model.achievementIndex
      && ![model.actionIndex, model.problemIndex, model.futureIndex].includes(index)
    ));
    const tailFacts = model.facts.filter((fact, index) => (
      index > model.achievementIndex
      && ![model.problemIndex, model.futureIndex].includes(index)
    ));

    const personas = [
      `しがない${model.persona}`,
      `一級${model.persona}`,
      `ただの通りすがりの${model.persona}`,
      `謙虚な${model.persona}`,
    ];
    const heroAliases = [
      { family: "self", hero: "俺" },
      { family: "acquaintance", hero: "俺の知り合いのナイト" },
      { family: "witness", hero: `一級と言われている${model.persona}` },
      { family: "friend", hero: `俺のフレの${model.persona}` },
    ];
    const quoteContext = (hero, family, payload = "") => ({
      hero,
      family,
      payload,
      audience: model.audience,
      object: model.object,
      persona: model.persona,
      hasInitialCrisis: model.hasInitialCrisis,
      hasAftershock: model.hasAftershock,
      hasChallenge: model.hasChallenge,
      hasDeadline: model.hasDeadline,
      hasMissing: model.hasMissing,
      hasDanger: model.hasDanger,
      hasDialogue: model.hasDialogue,
      hasPraise: model.hasPraise,
      hasNumbers: model.hasNumbers,
      hasAchievement: model.hasAchievement,
      topic: model.topic,
      eventFrame: model.eventFrame,
      evaluationPolarity: model.evaluationPolarity,
      evaluationNoun: model.evaluationNoun,
    });
    const crisisFor = (hero = "俺", family = "self") => {
      const category = model.hasInitialCrisis || model.hasDeadline || model.hasMissing || model.hasDanger
        ? "crisis"
        : "contrast";
      const selected = this.quoteGrammar.pick(category, quoteContext(hero, family), random).text;
      if (selected) return selected;
      return model.hasInitialCrisis
        ? `${model.audience}にはこの${model.object}を処理できず時間だけが過ぎていた`
        : `普通の${model.audience}なら${model.object}を前に迷うところだが${hero}には簡単な話`;
    };
    const openerFor = (hero, family) => this.quoteGrammar
      .pick("opener", quoteContext(hero, family), random).text;
    const achievementFor = (hero) => {
      const attributed = achievementFact.replace(
        /^(?:担当者|作業者|自分|私|僕|俺)(?:が|は)/,
        `${hero}が`,
      );
      if (attributed !== achievementFact) return attributed;
      if (/^(?:今日|昨日|今朝|昼|夕方|夜|先週|先月|今回)/.test(attributed)) return attributed;
      return attributed;
    };
    const interventionFor = (hero) => {
      const attributedAchievement = achievementFor(hero);
      const interventionAchievement = attributedAchievement;
      if (actionFact) {
        const payload = `${hero}が${actionFact}\nその結果${attributedAchievement}`;
        return this.quoteGrammar.pick("intervention", quoteContext(hero, "self", payload), random).text.split("\n");
      }
      return this.quoteGrammar
        .pick("intervention", quoteContext(hero, "self", interventionAchievement), random).text.split("\n");
    };
    const backgroundLines = backgroundFacts.map((fact) => (
      /^原因/.test(fact) ? `調べると${fact}` : `その時点で${stripLeadingConnective(fact)}`
    ));
    const entranceFor = (hero) => pick(random, [
      `そこで${hero}がきょうきょ参戦した`,
      `そこへ${hero}がｶｶッっと現れた`,
      `ここでようやく${hero}が本気を出した`,
    ]);
    const reactionFor = (hero, family) => this.quoteGrammar
      .pick("reaction", quoteContext(hero, family), random).text;
    const problemFor = (hero) => problemFact ? pick(random, [
      `ところが${problemFact}というアワレな事態まで発覚した`,
      `因みにその後${problemFact}という超状現象が起きた`,
      `だが${problemFact}らしく貧弱一般人ならここで終了`,
      `しかも${problemFact}という事態が${hero}を試すように現れた`,
    ]) : null;
    const resolutionFor = (hero) => pick(random, [
      futureFact ? `${hero}はソッコーで対策を決めたので${futureFact}` : `だが${hero}がｶｶッっと処理すると問題は静かになった`,
      futureFact ? `${futureFact}が${hero}にとってはすでに勝負はついている` : `${hero}が本気を出すと問題は一瞬で終了した`,
      futureFact ? `${hero}がその場で方針を決め、${futureFact}` : `当然${hero}は圧倒的な速度で対策した`,
    ]);
    const conclusionFor = (hero, family) => this.quoteGrammar
      .pick("conclusion", quoteContext(hero, family), random).text;

    const anchorCandidates = this.anchorFrameComposer.compose(model, {
      random,
      heroAliases,
      openerFor,
      crisisFor,
      reactionFor,
      conclusionFor,
    });
    if (anchorCandidates) return anchorCandidates;

    const observationCandidates = this.observationFrameComposer.compose(model, {
      random,
      quoteContext,
      openerFor,
    });
    if (observationCandidates) return observationCandidates;

    if (!model.hasAchievement) {
      const stateFacts = model.facts.map(stripLeadingConnective);
      const stateCandidates = new Set();
      const stateAliases = [
        { hero: "俺", family: "self" },
        { hero: "俺の知り合いのナイト", family: "acquaintance" },
        { hero: `一級と言われている${model.persona}`, family: "witness" },
        { hero: `俺のフレの${model.persona}`, family: "friend" },
      ];
      for (let round = 0; round < 30; round += 1) {
        const alias = pick(random, stateAliases);
        const context = quoteContext(alias.hero, alias.family);
        const firstState = this.quoteGrammar.pick("state", context, random);
        const secondState = this.quoteGrammar.pick("state", context, random, new Set([firstState.id]));
        const ending = conclusionFor(alias.hero, alias.family);
        const lines = [
          openerFor(alias.hero, alias.family),
          ...stateFacts,
          pick(random, [
            `普通の${model.audience}ならここで弱音が出るところだが`,
            `この程度で騒ぐのは貧弱一般人だけ`,
            `だが${alias.hero}と一般人を同じに考えると痛い目を見る`,
          ]),
          firstState.text,
          secondState.text,
          ending,
        ].filter(Boolean);
        stateCandidates.add(lines.join("\n"));
      }
      return Array.from(stateCandidates);
    }
    const rhetoricalFamily = (line) => {
      if (/格が違/.test(line)) return "rank";
      if (/どこもおかしくはない|日常/.test(line)) return "normality";
      if (/見習う/.test(line)) return "instruction";
      if (/謙虚|それほどでもない/.test(line)) return "humility";
      return "other";
    };
    const addTail = (lines, hero, family, tailOptions = {}) => {
      lines.push(...shuffle(random, tailFacts).map((fact) => `しかも${stripLeadingConnective(fact)}`));
      const reactionLine = reactionFor(hero, family);
      lines.push(reactionLine);
      const problemLine = tailOptions.skipProblem ? null : problemFor(hero);
      if (problemLine) lines.push(problemLine);
      if (!tailOptions.skipResolution && (problemLine || futureFact)) lines.push(resolutionFor(hero));
      let conclusionLine = conclusionFor(hero, family);
      for (let retry = 0; retry < 4 && rhetoricalFamily(conclusionLine) === rhetoricalFamily(reactionLine); retry += 1) {
        conclusionLine = conclusionFor(hero, family);
      }
      lines.push(conclusionLine);
      return lines;
    };

    const structures = [
      () => {
        const persona = pick(random, personas);
        const hero = "俺";
        return addTail([
          model.achievementIndex === 0 ? `俺は${persona}なんだが` : `俺は${persona}なんだが、${firstFact}`,
          crisisFor(hero, "self"),
          ...backgroundLines,
          ...interventionFor(hero),
        ], hero, "self");
      },
      () => {
        const hero = "俺の知り合いのナイト";
        return addTail([
          model.achievementIndex === 0
            ? `これは${hero}が実力を見せた時の話なんだが`
            : `これは${hero}から後で聞いた話なんだが、${firstFact}`,
          crisisFor(hero, "acquaintance"),
          ...backgroundLines,
          ...interventionFor(hero),
        ], hero, "acquaintance");
      },
      () => {
        const hero = pick(random, heroAliases.filter((alias) => alias.family !== "self")).hero;
        return addTail([
          crisisFor(hero, "witness"),
          model.achievementIndex === 0 ? "俺はその場にいたんだが" : `俺はその場にいたんだが、${firstFact}`,
          ...backgroundLines,
          `そこへ${hero}が現れた`,
          ...interventionFor(hero),
        ], hero, "witness");
      },
      () => {
        const hero = pick(random, heroAliases).hero;
        return addTail([
          `最初に結果だけ言うと${achievementFor(hero)}`,
          `これは${hero}が圧倒的な実力を見せた時の話`,
          ...(model.achievementIndex === 0 ? [] : [firstFact]),
          crisisFor(hero, "result-first"),
          ...backgroundLines,
          entranceFor(hero),
          ...(actionFact ? [`${hero}がｶｶッっと${actionFact}`] : []),
        ], hero, "result-first");
      },
      () => {
        const hero = pick(random, heroAliases.filter((alias) => alias.family !== "self")).hero;
        return addTail([
          `LSで${hero}の噂が流れていたので調べてみた`,
          model.achievementIndex === 0 ? "話によるとただの噂ではなかった" : `話によると${firstFact}`,
          crisisFor(hero, "rumor"),
          ...backgroundLines,
          ...interventionFor(hero),
        ], hero, "rumor");
      },
      () => {
        const alias = pick(random, heroAliases);
        const hero = alias.hero;
        return addTail([
          openerFor(hero, alias.family),
          ...(model.achievementIndex === 0 ? [] : [firstFact]),
          crisisFor(hero, "quote-open"),
          ...backgroundLines,
          ...interventionFor(hero),
        ], hero, "quote-open");
      },
      () => {
        const hero = pick(random, heroAliases.filter((alias) => alias.family !== "self")).hero;
        return addTail([
          crisisFor(hero, "lament-first"),
          `普通ならここで一巻の終わりだが${firstFact}`,
          ...backgroundLines,
          `その時${hero}が静かに前に出た`,
          ...interventionFor(hero),
        ], hero, "lament-first");
      },
      () => {
        const hero = pick(random, heroAliases).hero;
        return addTail([
          `証拠から先に見せるが${achievementFor(hero)}`,
          ...(model.achievementIndex === 0 ? [] : [`そこまでの流れを説明すると${firstFact}`]),
          crisisFor(hero, "evidence-first"),
          ...backgroundLines,
          entranceFor(hero),
          ...(actionFact ? [`${hero}が${actionFact}`] : []),
        ], hero, "evidence-first");
      },
      () => {
        const hero = pick(random, heroAliases.filter((alias) => alias.family !== "self")).hero;
        const problemOpening = problemFact
          ? `後になって${problemFact}という事態が発覚した`
          : crisisFor(hero, "aftershock-first");
        return addTail([
          problemOpening,
          `だがこの時点ですでに${hero}は結末をシュミレートしていた`,
          firstFact,
          crisisFor(hero, "aftershock-first"),
          ...backgroundLines,
          ...interventionFor(hero),
        ], hero, "aftershock-first", { skipProblem: Boolean(problemFact) });
      },
      () => {
        const hero = pick(random, heroAliases).hero;
        const replyAnchor = this.replyAnchor(model, random);
        const retort = this.quoteGrammar.pick("retort", {
          ...quoteContext(hero, "challenge"),
          replyTarget: replyAnchor.target,
          replyCoda: replyAnchor.coda,
        }, random).text;
        return addTail([
          `${model.audience}が${hero}に張り合おうとしてきた`,
          retort,
          firstFact,
          ...backgroundLines,
          ...interventionFor(hero),
        ], hero, "challenge");
      },
      () => {
        const hero = pick(random, heroAliases).hero;
        const anchor = this.anchorGrammar.selectTarget(model, "opponent", random, { allowGoro: false });
        return addTail([
          this.anchorGrammar.render("evaluation_target", {
            target: anchor.target,
            evaluation: `${hero}に勝負を挑むにはかなり準備不足`,
          }),
          firstFact,
          crisisFor(hero, "challenge-evaluation"),
          ...backgroundLines,
          ...interventionFor(hero),
        ], hero, "challenge-evaluation");
      },
      () => {
        const hero = pick(random, heroAliases).hero;
        const anchor = this.anchorGrammar.selectTarget(model, "source", random, { allowAny: false });
        return addTail([
          this.anchorGrammar.render("embedded_argument", {
            target: anchor.target,
            claim: "この判断が正しいという事実",
          }),
          ...(model.achievementIndex === 0 ? [] : [firstFact]),
          crisisFor(hero, "source-reference"),
          ...backgroundLines,
          ...interventionFor(hero),
        ], hero, "source-reference");
      },
      () => {
        const hero = pick(random, heroAliases).hero;
        const targets = model.anchorTargets.map((target) => target.value);
        return addTail([
          this.anchorGrammar.render("coordination", {
            targets,
            evaluation: `${hero}の実力を理解しているので話が早い`,
          }),
          ...(model.achievementIndex === 0 ? [] : [firstFact]),
          crisisFor(hero, "multi-reference"),
          ...backgroundLines,
          ...interventionFor(hero),
        ], hero, "multi-reference");
      },
      () => {
        const hero = pick(random, heroAliases).hero;
        const anchor = this.anchorGrammar.selectTarget(model, "opponent", random, { allowGoro: false });
        return addTail([
          this.anchorGrammar.render("vocative", {
            target: anchor.target,
            message: `勝手にライバル視するな　${hero}との実力差を考えるべき`,
          }),
          firstFact,
          crisisFor(hero, "challenge-vocative"),
          ...backgroundLines,
          ...interventionFor(hero),
        ], hero, "challenge-vocative");
      },
      () => {
        const hero = pick(random, heroAliases).hero;
        const anchor = this.anchorGrammar.selectTarget(model, "source", random, { allowAny: false });
        return addTail([
          ...(model.achievementIndex === 0 ? [] : [firstFact]),
          crisisFor(hero, "source-tail"),
          ...backgroundLines,
          ...interventionFor(hero),
          this.anchorGrammar.render("sentence_tail_reference", {
            target: anchor.target,
            claim: "この判断の元になった説明も正しかった",
          }),
        ], hero, "source-tail");
      },
      () => {
        const hero = pick(random, heroAliases).hero;
        const target = pick(random, model.anchorTargets.filter((candidate) => (
          Array.from(candidate.roles).some((role) => role !== "any")
        )));
        return addTail([
          this.anchorGrammar.render("standalone_reply", { target: target?.value }),
          ...(model.achievementIndex === 0 ? [] : [firstFact]),
          crisisFor(hero, "standalone-reference"),
          ...backgroundLines,
          ...interventionFor(hero),
        ], hero, "standalone-reference");
      },
      () => {
        const hero = pick(random, heroAliases).hero;
        const anchor = this.anchorGrammar.selectTarget(model, "opponent", random, { allowGoro: false });
        return addTail([
          this.anchorGrammar.render("prefixed_clause", {
            target: anchor.target,
            claim: "は口だけで勝てると思ってるのか？",
          }),
          firstFact,
          crisisFor(hero, "challenge-prefixed"),
          ...backgroundLines,
          ...interventionFor(hero),
        ], hero, "challenge-prefixed");
      },
    ];

    const compatibleStructures = structures.filter((structure, index) => {
      if (index === 6) return model.hasInitialCrisis;
      if (index === 7) return model.hasNumbers;
      if (index === 8) return model.hasAftershock;
      if (index === 9) return model.hasChallenge;
      if (index === 10) return model.hasChallenge
        && Boolean(this.anchorGrammar.selectTarget(model, "opponent", () => 0, { allowGoro: false }).target);
      if (index === 11) return Boolean(this.anchorGrammar.selectTarget(model, "source", () => 0, { allowAny: false }).target);
      if (index === 12) return model.anchorTargets.length >= 2;
      if (index === 13) return model.hasChallenge
        && Boolean(this.anchorGrammar.selectTarget(model, "opponent", () => 0, { allowGoro: false }).target);
      if (index === 14) return Boolean(this.anchorGrammar.selectTarget(model, "source", () => 0, { allowAny: false }).target);
      if (index === 15) return model.anchorTargets.some((candidate) => (
        Array.from(candidate.roles).some((role) => role !== "any")
      ));
      if (index === 16) return model.hasChallenge
        && Boolean(this.anchorGrammar.selectTarget(model, "opponent", () => 0, { allowGoro: false }).target);
      return true;
    });

    const candidates = new Set();
    let structureBag = [];
    for (let round = 0; round < 25; round += 1) {
      if (!structureBag.length) structureBag = shuffle(random, compatibleStructures);
      candidates.add(structureBag.shift()().filter(Boolean).join("\n"));
    }
    return Array.from(candidates);
  }
}

module.exports = { ContextNarrativeGenerator };
