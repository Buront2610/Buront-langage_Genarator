"use strict";
const { protectedOccurrences } = require("./protected-values");
function applyDictionaryOnce(text, rules = [], limit = 12000) {
  const ordered = rules.map((rule, index) => {
    if (!rule || typeof rule.from !== "string" || !rule.from || typeof rule.to !== "string" || rule.from.length > 256 || rule.to.length > 256) throw new Error("追加辞書の形式が不正です");
    return { ...rule, id: rule.id ?? String(index).padStart(4, "0"), priority: rule.priority ?? 0 };
  }).sort((a, b) => b.from.length - a.from.length || b.priority - a.priority || a.id.localeCompare(b.id));
  const protectedSpans = protectedOccurrences(text);
  for (const match of text.matchAll(/「[^」]*」|『[^』]*』/gu)) protectedSpans.push({ start: match.index, end: match.index + match[0].length });
  let output = "", count = 0;
  for (let offset = 0; offset < text.length;) {
    const rule = ordered.find((rule) => text.startsWith(rule.from, offset) && !protectedSpans.some((span) => offset < span.end && offset + rule.from.length > span.start));
    const value = rule ? rule.to : String.fromCodePoint(text.codePointAt(offset));
    count += [...value].length;
    if (count > limit) throw new Error("候補の文字数上限を超えました");
    output += value; offset += rule ? rule.from.length : value.length;
  }
  return output;
}
module.exports = { applyDictionaryOnce };
