"use strict";

// Positions are internal UTF-16 indexes. The scalar-span contract belongs to M1.
// Match whole occurrences rather than testing if "100" occurs inside "1100".
function protectedOccurrences(value) {
  const text = String(value ?? "");
  const patterns = [
    ["url", /https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/gi],
    ["email", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
    ["anchor", /(?:>>|＞＞)\s*(?:[0-9０-９]+|[A-Za-zぁ-んァ-ヶ一-龠々ー]{1,20}(?=\s|$))/g],
    ["identifier", /(?<![A-Za-zＡ-Ｚａ-ｚ0-9０-９_-])[A-Za-zＡ-Ｚａ-ｚ][A-Za-zＡ-Ｚａ-ｚ0-9０-９_-]*/g],
    ["quantity", /[+＋\-－−]?[0-9０-９]+(?:[,，][0-9０-９]{3})*(?:[.．][0-9０-９]+)?(?:時間|か月|ヶ月|[%％円年月日時分秒個枚人回点件歳才台度℃]|kg|km|cm|mm)?/g],
  ];
  const found = [];
  for (const [kind, pattern] of patterns) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (found.some((span) => start < span.end && end > span.start)) continue;
      found.push({ kind, raw: match[0], start, end });
    }
  }
  return found.sort((left, right) => left.start - right.start);
}

function keyOf(value) {
  const raw = value.kind === "quantity" ? value.raw.normalize("NFKC").replace(/−/g, "-") : value.raw;
  return `${value.kind}:${raw}`;
}

function missingProtectedValues(source, candidate) {
  const available = new Map();
  for (const value of protectedOccurrences(candidate)) {
    const key = keyOf(value);
    available.set(key, (available.get(key) || 0) + 1);
  }
  return protectedOccurrences(source).filter((value) => {
    const key = keyOf(value);
    const count = available.get(key) || 0;
    if (!count) return true;
    available.set(key, count - 1);
    return false;
  }).map(({ raw }) => raw);
}

module.exports = { protectedOccurrences, missingProtectedValues };
