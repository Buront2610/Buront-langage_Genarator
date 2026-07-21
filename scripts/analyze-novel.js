const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  aggregateFeatures,
  buildNgramModel,
  extractFeatures,
  splitSentences,
} = require("../lib/text-analysis");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright が見つかりません。開発環境の NODE_PATH を設定してから実行してください。");
  process.exit(1);
}

const ROOT = path.resolve(__dirname, "..");
const BASE_URL = "https://syosetu.org/novel/107412/";
const chapterCount = 23;
const browserCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

function browserPath() {
  const found = browserCandidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("Chrome または Edge が見つかりません");
  return found;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function quantile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function paragraphStructure(paragraphs) {
  const lengths = paragraphs.map((paragraph) => paragraph.length);
  const dialogueCount = paragraphs.filter((paragraph) => /^[「『]/.test(paragraph)).length;
  const narrativeCount = paragraphs.length - dialogueCount;
  return {
    paragraphCount: paragraphs.length,
    dialogueCount,
    narrativeCount,
    dialogueRate: Number((dialogueCount / Math.max(1, paragraphs.length)).toFixed(6)),
    paragraphLength: {
      minimum: Math.min(...lengths),
      q25: Number(quantile(lengths, 0.25).toFixed(2)),
      median: Number(quantile(lengths, 0.5).toFixed(2)),
      q75: Number(quantile(lengths, 0.75).toFixed(2)),
      maximum: Math.max(...lengths),
      mean: Number((lengths.reduce((sum, value) => sum + value, 0) / Math.max(1, lengths.length)).toFixed(2)),
    },
  };
}

function motifCounts(text) {
  const motifs = {
    storyLead: /これは.+(?:話|こと)なんだが|昔の話で|先日の話/g,
    contrast: /普通なら|一般人なら|だが|しかし|ところが/g,
    selfRank: /一級|最強|プロ|実力|ランク|一般人/g,
    reactionInference: /ビビった|顔真っ赤|青ざめ|驚き|眼差し|圧倒された/g,
    evidenceClaim: /事実|真実|証拠|明らか|判明|決まって/g,
    expansion: /やはり|しかも|さらに|その結果|という事/g,
    realWorldBridge: /リアル|現実|学校|仕事|クラス|店長|病院/g,
    aside: /（[^）]+）|\([^)]*\)/g,
  };
  return Object.fromEntries(
    Object.entries(motifs).map(([name, pattern]) => [name, (text.match(pattern) || []).length]),
  );
}

async function waitForChapter(page, expectedNumber) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const title = await page.title();
    const count = await page.locator("#honbun").count();
    if (count && !title.includes("しばらくお待ちください")) return;
    await page.waitForTimeout(4000);
  }
  throw new Error(`第${expectedNumber}話の本文を取得できませんでした`);
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: browserPath(),
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    locale: "ja-JP",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  const allParagraphs = [];
  const chapters = [];

  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1800);

    for (let chapterNumber = 1; chapterNumber <= chapterCount; chapterNumber += 1) {
      const url = `${BASE_URL}${chapterNumber}.html`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await waitForChapter(page, chapterNumber);

      const title = (await page.title()).replace(/^ブロント語改変集 - /, "").replace(/ - ハーメルン$/, "").trim();
      let paragraphs = (await page.locator("#honbun p").allTextContents())
        .map((value) => value.replace(/\u00a0/g, " ").trim())
        .filter((value) => value && value !== "　" && !/^[─━=-]{4,}$/.test(value));
      if (!paragraphs.length) {
        paragraphs = (await page.locator("#honbun").innerText())
          .split(/\n+/)
          .map((value) => value.trim())
          .filter(Boolean);
      }

      const body = paragraphs.join("\n");
      const sentences = splitSentences(body);
      allParagraphs.push(...paragraphs);
      chapters.push({
        number: chapterNumber,
        title,
        url,
        contentHash: sha256(body),
        characterCount: body.length,
        sentenceCount: sentences.length,
        structure: paragraphStructure(paragraphs),
        features: extractFeatures(body),
        motifs: motifCounts(body),
      });
      console.log(`${chapterNumber}/${chapterCount} ${title}: ${body.length}文字`);
      await page.waitForTimeout(650);
    }
  } finally {
    await browser.close();
  }

  const modelItems = allParagraphs.filter((paragraph) => paragraph.length >= 8 && paragraph.length <= 500);
  const combined = allParagraphs.join("\n");
  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      url: BASE_URL,
      title: "ブロント語改変集",
      chapterCount,
      combinedContentHash: sha256(combined),
      rawTextStored: false,
    },
    totals: {
      characterCount: combined.length,
      paragraphCount: allParagraphs.length,
      sentenceCount: splitSentences(combined).length,
    },
    baseline: aggregateFeatures(modelItems),
    structure: paragraphStructure(allParagraphs),
    motifs: motifCounts(combined),
    ngrams: buildNgramModel(modelItems),
    chapters,
  };

  const outputPath = path.join(ROOT, "data", "novel-model.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output)}\n`, "utf8");
  console.log(`比較モデルを保存しました: ${outputPath}`);
  console.log(`本文は保存せず、${combined.length}文字から統計量とn-gramだけを保持しました。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
