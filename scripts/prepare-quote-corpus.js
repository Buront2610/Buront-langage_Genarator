"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { normalizeForSearch } = require("../lib/text-analysis");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_URL = "https://kenkyonanight.xxxxxxxx.jp/goroku.html";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&gt;/gi, ">")
    .replace(/&lt;/gi, "<")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function htmlFragmentToLines(fragment) {
  return decodeEntities(fragment)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean);
}

function unique(values) {
  return Array.from(new Set(values));
}

function classify(text) {
  const families = [];
  const rules = [
    ["anger", /怒|切れ|有頂天|逆鱗|ふるかい|不快|謝/],
    ["lament", /悲し|絶望|寿命|一巻の終わり|いくえ不明|手遅れ/],
    ["warning", /危険|気をつけ|死|骨になる|病院|裏世界|犯罪|逮捕/],
    ["victory", /勝|論破|カウンター|これで勝つる|最強|唯一ぬに/],
    ["humility", /謙虚|それほどでもない|一歩引く|心が広/],
    ["evidence", /証拠|証明|事実|ノンフィクション|見ろ|確定/],
    ["prediction", /予知|最初から|目に見えて|シュミレート|発覚/],
    ["comparison", /対等|格が違|対して|よりも|ナンバー|一般社会/],
    ["surprise", /びび|ギク|驚|ほう・・|おいィ|何いきなり/],
    ["power", /パワー|破壊力|ワンパン|パンチ|ノーリスク|加速|攻撃力/],
    ["instruction", /見習|べき|勉強|注意|改心|義務|しきたり/],
    ["denial", /関係ない|はげていない|狩られる側じゃない|大反対|ノーなんで/],
  ];
  for (const [family, pattern] of rules) if (pattern.test(text)) families.push(family);
  return families.length ? families : ["general"];
}

async function fetchBytes(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "BurontLanguageGenerator/0.2 quote corpus preparation" },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`名言集の取得に失敗: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const bytes = await fetchBytes(SOURCE_URL);
  const html = new TextDecoder("shift_jis").decode(bytes);
  const headingMatches = Array.from(html.matchAll(
    /<font\b(?=[^>]*\bcolor\s*=\s*["']?#0000ff["']?)[^>]*>([\s\S]*?)<\/font>/gi,
  ));
  const strongMatches = Array.from(html.matchAll(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi));
  const logCorpus = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "log-corpus.json"), "utf8"));
  const headings = unique(headingMatches.flatMap((match) => htmlFragmentToLines(match[1])))
    .filter((line) => line.length >= 3 && line.length <= 160)
    .map((text, index) => {
      const needle = normalizeForSearch(text
        .replace(/[（(][^）)]*[）)]/g, "")
        .replace(/[「」『』○]/g, "")
        .replace(/\s+/g, ""));
      const contexts = needle.length < 5 ? [] : logCorpus.posts
        .filter((post) => post.normalized.includes(needle))
        .slice(0, 4)
        .map((post) => ({
          postId: post.id,
          threadTitle: post.threadTitle,
          responseNumber: post.responseNumber,
          postUrl: post.postUrl,
          intents: post.intents,
          anchorCount: post.anchorTargets.length,
        }));
      return {
        id: `heading_${String(index + 1).padStart(3, "0")}`,
        text,
        families: classify(text),
        contexts,
      };
    });
  const excerpts = unique(strongMatches.flatMap((match) => htmlFragmentToLines(match[1])))
    .filter((line) => line.length >= 4 && line.length <= 180)
    .filter((line) => !/^\d+\s*名前|投稿日|\bID:|^>>|^＞＞|^\[\d+\/\d+\]$/.test(line))
    .map((text, index) => ({ id: `excerpt_${String(index + 1).padStart(3, "0")}`, text, families: classify(text) }));
  const familyCounts = {};
  for (const item of [...headings, ...excerpts]) {
    for (const family of item.families) familyCounts[family] = (familyCounts[family] || 0) + 1;
  }
  const headingsWithContext = headings.filter((heading) => heading.contexts.length > 0).length;
  const contextLinks = headings.reduce((sum, heading) => sum + heading.contexts.length, 0);
  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      url: SOURCE_URL,
      title: "名言集っぽいの",
      encoding: "Shift_JIS",
      bytes: bytes.length,
      sha256: sha256(bytes),
    },
    counts: {
      headings: headings.length,
      excerpts: excerpts.length,
      headingsWithContext,
      contextLinks,
      families: familyCounts,
    },
    headings,
    excerpts,
  };
  const outputPath = path.join(ROOT, "data", "quote-corpus.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(output)}\n`, "utf8");
  console.log(`名言見出し: ${headings.length}件`);
  console.log(`強調語録: ${excerpts.length}件`);
  console.log(`原ログ文脈と接続: ${headingsWithContext}見出し / ${contextLinks}投稿`);
  console.log(`出力: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
