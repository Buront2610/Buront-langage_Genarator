"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { CorpusEngine } = require("../lib/corpus-engine");
const { verificationStatus } = require("../lib/candidate-results");
const fixtures = require("./fixtures/design-counterexamples.json");
const engine = new CorpusEngine();

for (const fixture of fixtures.filter(({ implemented }) => implemented)) {
  test(`${fixture.id}: 独立した改変文を合格させない`, () => {
    assert.equal(verificationStatus(engine.validate(fixture.source, fixture.candidate, 2)), fixture.expected);
    assert.equal(verificationStatus(engine.validateNarrative(fixture.source, fixture.candidate, 2)), fixture.expected);
  });
}

for (const contextMode of ["faithful", "full"]) {
  for (const count of [0, 1, 2]) {
    test(`T-12: ${contextMode}経路に合格${count}案と不合格・unknownを与える`, () => {
      const local = Object.create(engine);
      local.recentSelections = new Map();
      const outputs = ["不合格の文", "要確認の文", ...["採用可能な第一案", "採用可能な第二案"].slice(0, count)];
      const validate = (_source, text) => ({
        passed: !text.includes("不合格"), total: text.includes("不合格") ? 1 : 0.8,
        semantic: 1, style: 0.8, fluency: 1,
        faithfulQuoteCount: 0, faithfulQuotePriority: 0, faithfulQuoteSignatures: [],
        eraSignatures: [], quoteSignatures: [], styleDimensions: ["certainty", "comparison"], warnings: [],
        checks: [{ status: text.includes("要確認") ? "unknown" : "pass" }],
      });
      local.generateCandidates = () => outputs;
      local.validate = validate;
      local.validateNarrative = validate;
      local.applyEraSurface = (text) => text;
      local.contextNarrative = Object.create(engine.contextNarrative);
      local.contextNarrative.candidates = () => outputs;
      // Avoid silently adding a passing conservative candidate in the zero case.
      local.validate = (source, text) => outputs.includes(text) ? validate(source, text) : { ...validate(source, text), passed: false };
      const source = "  保持する原文です。  ";
      const result = local.convert(source, { contextMode, level: 1, seed: "m0-contract" });
      assert.equal(result.candidates.length, count);
      assert.ok(result.suggestions.every((candidate) => candidate.verificationStatus === "passed"));
      assert.ok(result.candidates.every((candidate) => candidate.comparisons.every((item) => item.output === candidate.text)));
      if (!count) {
        assert.equal(result.text, source);
        assert.equal(result.selectedCandidateId, null);
        assert.equal(result.summary.passedCount, 0);
      } else {
        const selected = result.candidates.find((item) => item.id === result.selectedCandidateId);
        assert.equal(result.text, selected.text);
        assert.deepEqual(result.comparisons, selected.comparisons);
      }
    });
  }
}

test("T-09/10: 実エンジンの短文・アンカー・識別子を失わない", () => {
  for (const source of ["猫", "A", ">>123 確認しました。", "https://example.com/A?q=7"]) {
    const result = engine.convert(source, { seed: "m0-input", level: 2 });
    assert.ok(result.text.length > 0);
    if (source.startsWith(">>")) assert.ok(result.text.includes(">>123"));
    if (source.startsWith("https:")) assert.ok(result.text.includes(source));
  }
  assert.throws(() => engine.convert(123), /文字列/);
  assert.throws(() => engine.convert("\ud800"), /サロゲート/);
});
