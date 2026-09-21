"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { protectedOccurrences, missingProtectedValues } = require("../lib/protected-values");
const { splitSentences } = require("../lib/text-analysis");

test("T-01/02: 数量全体・符号・単位・出現数を照合する", () => {
  for (const [source, output] of [
    ["100円", "1100円"], ["3個", "13個"], ["-5度", "5度"],
    ["5台", "5個"], ["3台と3台", "3台"], ["3kg", "13kg"], ["-5.5度", "5.5度"],
  ]) assert.ok(missingProtectedValues(source, output).length, `${source} -> ${output}`);
  assert.deepEqual(missingProtectedValues("１００円と－５度", "100円と-5度"), []);
});

test("T-10: URL・メール・識別子・アンカーは原値で照合し、内部の数値を重複登録しない", () => {
  const source = "https://example.com/A?q=7 dev@example.jp API123 >>412";
  assert.deepEqual(protectedOccurrences(source).map(({ raw }) => raw), ["https://example.com/A?q=7", "dev@example.jp", "API123", ">>412"]);
  for (const output of [source.replace("/A", "/a"), source.replace("q=7", "q=70"), source.replace("API123", "API1234"), source.replace(">>412", ">>4120")]) {
    assert.ok(missingProtectedValues(source, output).length);
  }
  assert.deepEqual(missingProtectedValues(source, `参照は${source}です`), []);
});

test("T-09: 一文字・記号・行頭アンカーを空出力にしない", () => {
  for (const source of ["猫", "A", "😀", ">>123", ">>社員 本文。", "猫\nA"]) {
    assert.equal(splitSentences(source).join("\n"), source);
  }
});

test("数量の部分一致を幅広い値で拒否する", () => {
  for (let value = 1; value <= 250; value += 1) {
    assert.deepEqual(missingProtectedValues(`${value}円`, `1${value}円`), [`${value}円`]);
    assert.deepEqual(missingProtectedValues(`-${value}度`, `${value}度`), [`-${value}度`]);
  }
});
