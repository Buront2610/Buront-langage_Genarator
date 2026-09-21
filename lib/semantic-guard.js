"use strict";

// Conservative independent checks for the known legacy counterexamples. This is
// not a general parser; structured generation proves literal fact preservation.
function semanticGuard(source, candidate) {
  const failures = [];
  const boundValues = (text) => [...text.matchAll(/([+\-－−]?[0-9０-９]+(?:[.．][0-9０-９]+)?(?:円|個|度|件|台)?)(から|より|を|に)/gu)]
    .map((match) => `${match[1].normalize("NFKC")}:${match[2]}`);
  const bindings = boundValues(source), outputBindings = boundValues(candidate);
  if (bindings.length > 1 && bindings.some((value) => !outputBindings.includes(value))) failures.push("quantity-role");
  const argumentsOf = (text) => [...text.matchAll(/([\p{Script=Han}\p{Script=Katakana}A-Za-zー]{1,20})(が|は|を)/gu)]
    .map((match) => ({ name: match[1], role: match[2] === "は" ? "が" : match[2], index: match.index }));
  const before = argumentsOf(source), after = argumentsOf(candidate);
  for (const item of before) {
    if (!after.some((other) => other.name === item.name && other.role === item.role) && after.some((other) => other.name === item.name && other.role !== item.role)) failures.push("argument-role");
  }
  const clauses = (text) => text.split(/[。！？\n]|(?<=で)、/u).filter(Boolean);
  const negative = (text) => /ない|なかった|ません|せず|未完了|停止中/u.test(text);
  for (const clause of clauses(source)) {
    const subject = argumentsOf(clause).find((item) => item.role === "が");
    if (!subject) continue;
    const corresponding = clauses(candidate).filter((item) => item.includes(subject.name));
    if (corresponding.length === 1 && negative(clause) !== negative(corresponding[0])) failures.push("predicate-polarity");
    if (/明日|予定|つもり|今後/u.test(clause) && corresponding.some((item) => /終え|済ませ|完了した|確認した/u.test(item)) && !corresponding.some((item) => /明日|予定|つもり|今後/u.test(item))) failures.push("future-promoted");
  }
  if (/(?:と|って)[^。！？]{0,30}(?:言|話|聞|述べ)|との(?:こと|報告)/u.test(source) && !/(?:と|って)[^。！？]{0,30}(?:言|話|聞|述べ)|との(?:こと|報告)/u.test(candidate)) failures.push("attribution-removed");
  if (/停止中|未解決|復旧していない/u.test(source) && !/停止中|未解決|復旧していない/u.test(candidate) && /復旧し|解決し|終え/u.test(candidate)) failures.push("unresolved-promoted");
  return [...new Set(failures)].map((code) => ({ code: `legacy-${code}`, status: "fail", required: true }));
}
module.exports = { semanticGuard };
