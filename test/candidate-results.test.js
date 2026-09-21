"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { verificationStatus, finalizeResult } = require("../lib/candidate-results");

function comparison(source, output, status) {
  return { source, output, verificationPasses: 1, validation: {
    passed: status === "passed", verificationStatus: status,
    total: 0.8, semantic: 0.9, style: 0.7, fluency: 1,
  } };
}

test("必須failはunknown・高い品質点より優先し、unknownを合格にしない", () => {
  assert.equal(verificationStatus({ passed: true, checks: [{ status: "unknown" }] }), "needs_review");
  assert.equal(verificationStatus({ passed: true, checks: [{ status: "unknown" }, { status: "fail" }] }), "rejected");
  assert.equal(verificationStatus({}), "needs_review");
  assert.equal(verificationStatus({ passed: false, checks: [{ status: "unknown" }] }), "rejected");
});

test("T-12: 合格0/1/2案を水増しせず、配列順によらない採用IDを返す", () => {
  const source = "  原文。  ";
  for (let count = 0; count <= 2; count += 1) {
    const suggestions = ["rejected", "needs_review", ...Array(count).fill("passed")].map((status, index) => ({
      text: `候補${index}`, comparisons: [comparison(source, `候補${index}`, status)],
    }));
    const wanted = suggestions.at(-1);
    const result = finalizeResult(source, { text: wanted.text, suggestions, comparisons: wanted.comparisons, summary: {} });
    assert.equal(result.candidates.length, count);
    assert.ok(result.candidates.every((item) => item.verificationStatus === "passed"));
    if (count) {
      assert.equal(result.text, wanted.text);
      assert.equal(result.selectedCandidateId, result.candidates.at(-1).id);
      assert.equal(result.fallback, null);
    } else {
      assert.equal(result.text, source);
      assert.equal(result.selectedCandidateId, null);
      assert.equal(result.summary.passedCount, 0);
      assert.equal(result.summary.averageSemantic, null);
      assert.equal(result.fallback.kind, "source_preserved");
    }
  }
});

test("原文の返却や句点の削除だけを有効な変換案に数えない", () => {
  const source = "原文。";
  const comparisons = [comparison(source, "原文", "passed")];
  const result = finalizeResult(source, { text: "原文", suggestions: [{ text: "原文", comparisons }], comparisons, summary: {} });
  assert.equal(result.selectedCandidateId, null);
  assert.equal(result.text, source);
});
