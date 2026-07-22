const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractProtectedValues,
  intentTags,
  normalizeForSearch,
  splitSentences,
  tokenize,
} = require("../lib/text-analysis");

test("改行と句点の両方で文章を分割する", () => {
  assert.deepEqual(splitSentences("一文目です。二文目です！\n三文目です"), [
    "一文目です。",
    "二文目です！",
    "三文目です",
  ]);
});

test("先頭の数値・文字アンカーだけを外して後続本文を残す", () => {
  assert.deepEqual(splitSentences(">>412 数値アンカーの本文です。\n>>社員 文字アンカーの本文です。"), [
    "数値アンカーの本文です。",
    "文字アンカーの本文です。",
  ]);
});

test("数値アンカー直後の助詞と述語をアンカー名として消さない", () => {
  assert.match(normalizeForSearch(">>123は口だけデコピンで人を倒せると思ってるのか？"), /口だけデコピン/);
  assert.match(normalizeForSearch("俺は>>199に賛成だな"), /賛成/);
});

test("日本語を内容語へ分割する", () => {
  const tokens = tokenize("昨日は仕事で資料を提出しました。", { contentOnly: true });
  assert.ok(tokens.includes("昨日"));
  assert.ok(tokens.includes("仕事"));
  assert.ok(tokens.includes("資料"));
});

test("文章の意図を複数分類する", () => {
  const tags = intentTags("失敗した理由は明らかなので、とても怒っています。");
  assert.ok(tags.includes("anger"));
  assert.ok(tags.includes("criticism"));
  assert.ok(tags.includes("explanation"));
});

test("検証対象の数値と識別子を抽出する", () => {
  const values = extractProtectedValues("333円 user@example.com https://example.com API123");
  assert.ok(values.includes("333円"));
  assert.ok(values.includes("user@example.com"));
  assert.ok(values.includes("https://example.com"));
  assert.ok(values.includes("API123"));
});

test("URLのクエリ記号を文末と誤認せず後続の日本語とメールを分離して保持する", () => {
  const source = "結果をhttps://example.com/a?q=7へ送り、dev@example.jpに連絡した。";
  const values = extractProtectedValues(source);

  assert.deepEqual(splitSentences(source), [source]);
  assert.ok(values.includes("https://example.com/a?q=7"));
  assert.ok(values.includes("dev@example.jp"));
  assert.ok(!values.includes("https://example.com/a?q=7へ送り、dev@example.jpに連絡した。"));
});
