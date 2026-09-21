"use strict";

const { buildDiscourseGraph } = require("./discourse-graph");
const { paraphraseFact } = require("./fact-paraphraser");
const { pick } = require("./random-utils");

function rewritePlain(value, role, random = Math.random) {
  const text = String(value);
  const aggressiveParticles = !/[「『、,]/.test(text)
    && text.length <= 70
    && (text.match(/が/g) || []).length <= 1;
  return paraphraseFact(value, role, random, { aggressiveParticles });
}

function renderNode(node, random = Math.random) {
  return rewritePlain(node.source, node.role, random);
}

class DiscoursePlanner {
  constructor(quoteGrammar) {
    this.quoteGrammar = quoteGrammar;
  }

  compose(model, helpers) {
    const graph = buildDiscourseGraph(model.facts);
    if (!graph.hasNarrativeArc) return null;

    const candidates = new Set();
    const setupNodes = graph.nodes.filter((node) => node.index < graph.crisisIndex);
    const escalationNodes = graph.nodes.filter((node) => (
      node.index >= graph.crisisIndex && node.index < graph.interventionIndex
    ));
    const interventionNodes = graph.nodes.filter((node) => (
      node.index >= graph.interventionIndex && node.index < graph.resolutionIndex
    ));
    const resultNode = graph.nodes[graph.resolutionIndex];
    const aftermathNodes = graph.nodes.filter((node) => node.index > graph.resolutionIndex);
    const revealNode = escalationNodes.find((node) => node.index === graph.revealIndex);

    for (let round = 0; round < 42; round += 1) {
      const focalActor = graph.focalActor || pick(helpers.random, helpers.heroAliases).hero;
      const context = {
        ...helpers.quoteContext(focalActor, "witness"),
        hasInitialCrisis: true,
        hasDanger: true,
        hasAchievement: true,
      };
      const opener = this.quoteGrammar.pick("opener", context, helpers.random).text;
      const crisis = this.quoteGrammar.pick("crisis", context, helpers.random, new Set(["crisis_game_over"])).text;
      const setup = setupNodes.map((node) => renderNode(node, helpers.random));
      const aftermath = aftermathNodes.map((node) => renderNode(node, helpers.random));
      const chronologicalEscalation = escalationNodes.map((node) => renderNode(node, helpers.random));
      const escalationWithoutReveal = escalationNodes
        .filter((node) => node !== revealNode)
        .map((node) => renderNode(node, helpers.random));
      const renderedReveal = revealNode ? renderNode(revealNode, helpers.random) : null;
      const interventionPayload = interventionNodes
        .map((node) => renderNode(node, helpers.random))
        .join("\n");
      const intervention = this.quoteGrammar.pick("intervention", {
        ...context,
        payload: interventionPayload,
      }, helpers.random).text;
      const result = renderNode(resultNode, helpers.random);
      const reaction = this.quoteGrammar.pick("reaction", context, helpers.random).text;
      const conclusion = this.quoteGrammar.pick("conclusion", context, helpers.random).text;
      const chronological = [
        opener,
        ...setup,
        crisis,
        ...chronologicalEscalation,
        intervention,
        result,
        reaction,
        ...aftermath,
        conclusion,
      ];
      const resultFirst = [
        this.quoteGrammar.render("opener_prophecy", context),
        result,
        ...setup,
        crisis,
        ...chronologicalEscalation,
        intervention,
        reaction,
        ...aftermath,
        conclusion,
      ];
      const turningFirst = [
        renderedReveal,
        opener,
        ...setup,
        crisis,
        ...escalationWithoutReveal,
        intervention,
        result,
        reaction,
        ...aftermath,
        conclusion,
      ];
      candidates.add(pick(helpers.random, [chronological, resultFirst, turningFirst]).filter(Boolean).join("\n"));
    }
    return Array.from(candidates);
  }
}

module.exports = {
  DiscoursePlanner,
  renderNode,
  rewritePlain,
};
