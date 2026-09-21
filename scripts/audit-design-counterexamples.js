"use strict";

// Pending design requirements remain visible; this audit exits nonzero until
// every independent counterexample is rejected by both validation paths.
const { CorpusEngine } = require("../lib/corpus-engine");
const { verificationStatus } = require("../lib/candidate-results");
const fixtures = require("../test/fixtures/design-counterexamples.json");

const engine = new CorpusEngine();
const results = fixtures.map(({ id, requirement, source, candidate, expected, implemented }) => {
  const faithful = verificationStatus(engine.validate(source, candidate, 2));
  const full = verificationStatus(engine.validateNarrative(source, candidate, 2));
  return { id, requirement, source, candidate, expected, implemented, faithful, full, matches: faithful === expected && full === expected };
});
const unresolved = results.filter(({ matches }) => !matches).map(({ id }) => id);
console.log(JSON.stringify({ runtime: process.version, fixtureCount: results.length, unresolved, results }, null, 2));
if (unresolved.length) process.exitCode = 1;
