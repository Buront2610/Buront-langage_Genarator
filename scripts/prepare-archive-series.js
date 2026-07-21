"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { normalizeForPresence } = require("../lib/text-analysis");

const ROOT = path.resolve(__dirname, "..");
const BASE_URL = "https://kenkyonanight.xxxxxxxx.jp/";
const SERIES = Object.freeze([
  { id: "roto", label: "ロト時代＋暗黒騎士系", shortLabel: "ロト時代", file: "roto.html" },
  { id: "yorusama", label: "グラットンスレ系", shortLabel: "グラットンスレ", file: "yorusama.html" },
  { id: "saiko", label: "最高の騎士系", shortLabel: "最高の騎士", file: "saiko.html" },
  { id: "night", label: "名無し系（2003～2004）", shortLabel: "名無し・雌伏期", file: "night.html" },
  { id: "puronohito", label: "鯖スレ系", shortLabel: "鯖スレ", file: "puronohito.html" },
  { id: "nega", label: "ネガ侍系", shortLabel: "ネガ侍", file: "nega.html" },
  { id: "katuru", label: "謙虚な騎士系", shortLabel: "謙虚な騎士", file: "katuru.html" },
  { id: "gg", label: "ギルティギア系", shortLabel: "ギルティギア", file: "gg.html" },
  { id: "sonota", label: "その他", shortLabel: "その他", file: "sonota.html" },
]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function extractPageText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h\d|dt)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&gt;/gi, ">")
    .replace(/&lt;/gi, "<")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, "");
}

async function fetchShiftJis(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "BurontLanguageGenerator/0.2 archive series preparation" },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new TextDecoder("shift_jis").decode(await response.arrayBuffer());
}

async function main() {
  const corpusPath = path.join(ROOT, "data", "log-corpus.json");
  const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
  const pages = new Map();

  for (const definition of SERIES) {
    const url = `${BASE_URL}${definition.file}`;
    process.stdout.write(`${definition.label} を取得中... `);
    const html = await fetchShiftJis(url);
    pages.set(definition.id, {
      html,
      normalizedText: normalizeForPresence(extractPageText(html)),
      sourceHash: sha256(html),
    });
    console.log(`${html.length.toLocaleString("ja-JP")}文字`);
  }

  const assignments = new Map(SERIES.map((definition) => [definition.id, []]));
  const unclassifiedPostIds = [];
  const ambiguous = [];
  let disambiguatedByThread = 0;

  for (const post of corpus.posts) {
    const content = normalizeForPresence(post.content);
    const contentMatches = SERIES.filter((definition) => (
      content.length >= 6 && pages.get(definition.id).normalizedText.includes(content)
    ));
    let selected = contentMatches;

    if (contentMatches.length > 1) {
      const title = normalizeForPresence(post.threadTitle);
      const titleMatches = contentMatches.filter((definition) => (
        title.length >= 4 && pages.get(definition.id).normalizedText.includes(title)
      ));
      if (titleMatches.length === 1) {
        selected = titleMatches;
        disambiguatedByThread += 1;
      }
    }

    if (selected.length === 1) {
      assignments.get(selected[0].id).push(post.id);
    } else if (selected.length === 0) {
      // all.html の新しい補完投稿でも、系列ページに本文がなければ推測で割り振らない。
      unclassifiedPostIds.push(post.id);
    } else {
      ambiguous.push({ postId: post.id, series: selected.map((item) => item.id) });
    }
  }

  if (ambiguous.length) {
    throw new Error(`系列を一意に決められない投稿があります: ${JSON.stringify(ambiguous.slice(0, 10))}`);
  }

  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceIndexUrl: `${BASE_URL}log.html`,
    classifiedPostCount: corpus.posts.length - unclassifiedPostIds.length,
    unclassifiedPostCount: unclassifiedPostIds.length,
    disambiguatedByThread,
    series: SERIES.map((definition) => ({
      id: definition.id,
      label: definition.label,
      shortLabel: definition.shortLabel,
      sourceUrl: `${BASE_URL}${definition.file}`,
      sourceHash: pages.get(definition.id).sourceHash,
      postIds: assignments.get(definition.id),
    })),
    unclassifiedPostIds,
  };

  const outputPath = path.join(ROOT, "data", "archive-series.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(result)}\n`, "utf8");
  for (const series of result.series) console.log(`${series.label}: ${series.postIds.length}投稿`);
  console.log(`系列ページ外（全系列だけで使用）: ${unclassifiedPostIds.length}投稿`);
  console.log(`出力: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
