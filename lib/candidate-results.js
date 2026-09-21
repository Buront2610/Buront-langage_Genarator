"use strict";

const { createHash } = require("node:crypto");

// These states describe the checks actually performed by the legacy engine.
// They do not certify the unimplemented DocumentIR/semantic checks.
function verificationStatus(validation) {
  const checks = (validation?.checks || []).filter((check) => check.required !== false);
  if (checks.some((check) => check.status === "fail") || validation?.verificationStatus === "rejected") return "rejected";
  if (validation?.passed === false && validation.verificationStatus !== "needs_review") return "rejected";
  if (checks.some((check) => check.status === "unknown") || validation?.verificationStatus === "needs_review") return "needs_review";
  if (validation?.passed === true) return "passed";
  return validation?.passed === false ? "rejected" : "needs_review";
}

function isPassed(candidate) {
  return verificationStatus(candidate?.validation) === "passed";
}

function candidateId(source, text) {
  return `candidate-${createHash("sha256").update(JSON.stringify([source, text])).digest("hex").slice(0, 24)}`;
}

function fallbackValidation() {
  return {
    passed: false,
    verificationStatus: "needs_review",
    total: null, semantic: null, style: null, fluency: null,
    logAffinity: null, novelAffinity: null,
    faithfulQuoteSignatures: [], styleDimensions: [],
    warnings: ["採用できる変換候補がないため原文を保持しました。意味全体の確認は行っていません。"],
    checks: [{ code: "generation", status: "unknown", description: "原文保持。変換候補の検証通過とは数えません。" }],
  };
}

function summarize(comparisons, unit) {
  const mean = (field) => {
    const values = comparisons.map(({ validation }) => validation[field]);
    return values.length && values.every(Number.isFinite)
      ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  return {
    sentenceCount: comparisons.length,
    ...(unit ? { unit } : {}),
    passedCount: comparisons.filter((comparison) => !comparison.fallback && isPassed(comparison)).length,
    verificationPasses: comparisons.reduce((sum, comparison) => sum + comparison.verificationPasses, 0),
    averageTotal: mean("total"), averageSemantic: mean("semantic"),
    averageStyle: mean("style"), averageFluency: mean("fluency"),
  };
}

function unchanged(source, text) {
  const content = (value) => value.replace(/[\s。！？!?]+/gu, "");
  return content(source) === content(text);
}

function finalizeResult(source, result) {
  const candidates = [];
  for (const suggestion of result.suggestions) {
    const comparisons = suggestion.comparisons || result.comparisons;
    if (!comparisons.length || comparisons.some((comparison) => comparison.fallback || !isPassed(comparison))) continue;
    if (unchanged(source, suggestion.text) || candidates.some(({ text }) => text === suggestion.text)) continue;
    const summary = summarize(comparisons, result.summary.unit);
    candidates.push({
      id: candidateId(source, suggestion.text), text: suggestion.text,
      verificationStatus: "passed", verificationScope: "legacy-rule-checks",
      checks: comparisons.flatMap(({ validation }) => validation.checks || []),
      comparisons, summary,
      averageTotal: summary.averageTotal, averageSemantic: summary.averageSemantic, averageStyle: summary.averageStyle,
    });
    if (candidates.length === 3) break;
  }
  const selected = candidates.find(({ text }) => text === result.text) || candidates[0] || null;
  const fallback = selected ? null : { text: source, kind: "source_preserved", reason: "no_passed_candidate" };
  const fallbackComparisons = result.comparisons.map((comparison) => ({
    ...comparison, output: comparison.source, fallback: true,
    validation: fallbackValidation(),
    diff: [{ type: "same", value: comparison.source }],
  }));
  return {
    ...result,
    inputHash: createHash("sha256").update(source).digest("hex"),
    selectedCandidateId: selected?.id || null,
    candidates,
    suggestions: candidates,
    text: selected?.text ?? source,
    comparisons: selected?.comparisons || fallbackComparisons,
    summary: selected?.summary || summarize(fallbackComparisons, result.summary.unit),
    fallback,
    shortfallReason: candidates.length === 3 ? null : candidates.length ? "insufficient_passed_candidates" : "no_passed_candidate",
  };
}

module.exports = { verificationStatus, isPassed, candidateId, fallbackValidation, summarize, finalizeResult };
