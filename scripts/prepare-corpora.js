const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  aggregateFeatures,
  buildNgramModel,
  intentTags,
  normalizeForPresence,
  normalizeForSearch,
  splitSentences,
  tokenize,
} = require("../lib/text-analysis");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_LOCAL_LOG = "C:\\Users\\Glutt\\OneDrive\\デスクトップ\\burontlog.txt";
const localLogPath = path.resolve(process.argv[2] || process.env.BURONT_LOG_PATH || DEFAULT_LOCAL_LOG);
const archiveBaseUrl = "https://kenkyonanight.xxxxxxxx.jp/";
const archiveParts = Array.from({ length: 5 }, (_, index) => `buront3_posts_0${index + 1}.js`);

async function fetchText(url, attempts = 4, encoding = "utf-8") {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "BurontLanguageGenerator/0.2 corpus preparation" },
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      return new TextDecoder(encoding).decode(bytes);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 900));
      }
    }
  }
  throw lastError;
}

function parseArchivePart(source, filename) {
  const pushIndex = source.indexOf(".push(...");
  const start = source.indexOf("[", pushIndex);
  const end = source.lastIndexOf("]");
  if (pushIndex < 0 || start < 0 || end <= start) {
    throw new Error(`${filename} の配列を解析できませんでした`);
  }
  return JSON.parse(source.slice(start, end + 1));
}

function stripAnchorLines(content) {
  return String(content ?? "")
    .replace(/^\s*(?:>>|＞＞)\s*\d+\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function extractPageText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, "")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function longestCommonSubsequence(left, right) {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => new Uint16Array(columns));
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      matrix[row][column] = left[row - 1] === right[column - 1]
        ? matrix[row - 1][column - 1] + 1
        : Math.max(matrix[row - 1][column], matrix[row][column - 1]);
    }
  }
  const matches = [];
  let row = left.length;
  let column = right.length;
  while (row > 0 && column > 0) {
    if (left[row - 1] === right[column - 1]) {
      matches.unshift([row - 1, column - 1]);
      row -= 1;
      column -= 1;
    } else if (matrix[row - 1][column] >= matrix[row][column - 1]) {
      row -= 1;
    } else {
      column -= 1;
    }
  }
  return matches;
}

function deriveEdits(before, after) {
  const left = tokenize(before);
  const right = tokenize(after);
  const matches = longestCommonSubsequence(left, right);
  const edits = [];
  let leftIndex = 0;
  let rightIndex = 0;

  for (const [leftMatch, rightMatch] of [...matches, [left.length, right.length]]) {
    const removed = left.slice(leftIndex, leftMatch).join("");
    const inserted = right.slice(rightIndex, rightMatch).join("");
    if (removed || inserted) {
      edits.push({
        type: removed && inserted ? "replace" : removed ? "remove" : "insert",
        before: removed.slice(0, 120),
        after: inserted.slice(0, 120),
      });
    }
    leftIndex = leftMatch + 1;
    rightIndex = rightMatch + 1;
  }
  return edits.filter((edit) => edit.before || edit.after).slice(0, 30);
}

async function loadComparisonStages() {
  const html = await fetchText(`${archiveBaseUrl}aaa.html`, 4, "shift_jis");
  const text = extractPageText(html);
  const start = text.indexOf("昨日バイト先で");
  if (start < 0) return { stages: [], sourceHash: sha256(html) };
  const relevant = text.slice(start).split(/＞＞戻る|戻る/)[0];
  const blocks = relevant
    .split(/\n?↓(?:（[^）]+）)?\n?/)
    .map((block) => block.trim().replace(/^更に話を膨らませて自慢っぽくする\s*/, ""))
    .filter((block) => block.includes("333円") && block.length > 60)
    .slice(0, 5);

  return {
    sourceHash: sha256(html),
    sourceUrl: `${archiveBaseUrl}aaa.html`,
    stages: blocks.map((textValue, index) => ({
      index,
      features: require("../lib/text-analysis").extractFeatures(textValue),
      editsFromPrevious: index === 0 ? [] : deriveEdits(blocks[index - 1], textValue),
    })),
  };
}

async function main() {
  if (!fs.existsSync(localLogPath)) {
    throw new Error(`手元ログが見つかりません: ${localLogPath}`);
  }

  const localLog = fs.readFileSync(localLogPath, "utf8").replace(/^\uFEFF/, "");
  const localFlat = normalizeForPresence(localLog);
  const archivePosts = [];
  const partHashes = {};

  for (const filename of archiveParts) {
    process.stdout.write(`${filename} を取得中... `);
    const source = await fetchText(`${archiveBaseUrl}${filename}`);
    const posts = parseArchivePart(source, filename);
    archivePosts.push(...posts);
    partHashes[filename] = sha256(source);
    console.log(`${posts.length}件`);
  }

  let localMatchCount = 0;
  const posts = archivePosts.map((post) => {
    const content = stripAnchorLines(post.content);
    const presenceNeedle = normalizeForPresence(content);
    const presentInLocalLog = presenceNeedle.length >= 6 && localFlat.includes(presenceNeedle);
    if (presentInLocalLog) localMatchCount += 1;
    return {
      id: post.id,
      board: post.board || "不明",
      threadTitle: post.thread_title || "不明",
      threadUrl: post.thread_url || null,
      postUrl: post.post_url || null,
      responseNumber: post.res_no || null,
      name: post.name || null,
      date: post.date || null,
      posterId: post.poster_id || null,
      content,
      normalized: normalizeForSearch(content),
      intents: intentTags(content),
      presentInLocalLog,
      anchorTargets: Array.isArray(post.anchor_targets)
        ? post.anchor_targets.slice(0, 4).map((target) => ({
            responseNumber: target.res_no || null,
            content: String(target.content || "").slice(0, 500),
          }))
        : [],
    };
  });

  const sentences = [];
  for (const post of posts) {
    for (const sentence of splitSentences(post.content)) {
      if (sentence.length < 4 || sentence.length > 700) continue;
      sentences.push({
        id: `${post.id}_${sentences.length}`,
        postId: post.id,
        text: sentence,
        normalized: normalizeForSearch(sentence),
        tokens: tokenize(sentence, { contentOnly: true }),
        intents: intentTags(sentence),
        local: post.presentInLocalLog,
      });
    }
  }

  const modelSentences = sentences
    .filter((sentence) => sentence.text.length >= 12 && sentence.text.length <= 360)
    .map((sentence) => sentence.text);
  const comparison = await loadComparisonStages();
  const generatedAt = new Date().toISOString();
  const dataDirectory = path.join(ROOT, "data");
  fs.mkdirSync(dataDirectory, { recursive: true });

  const corpus = {
    schemaVersion: 2,
    generatedAt,
    sources: {
      localLog: {
        filename: path.basename(localLogPath),
        bytes: Buffer.byteLength(localLog),
        sha256: sha256(localLog),
      },
      archive: {
        baseUrl: archiveBaseUrl,
        partHashes,
      },
    },
    comparison: {
      archivePosts: posts.length,
      archiveSentences: sentences.length,
      postsPresentInLocalLog: localMatchCount,
      archiveOnlyPosts: posts.length - localMatchCount,
    },
    posts,
    sentences,
  };

  const styleModel = {
    schemaVersion: 2,
    generatedAt,
    sourcePostCount: posts.length,
    sourceSentenceCount: modelSentences.length,
    baseline: aggregateFeatures(modelSentences),
    ngrams: buildNgramModel(modelSentences),
    comparisonStages: comparison,
  };

  fs.writeFileSync(path.join(dataDirectory, "log-corpus.json"), `${JSON.stringify(corpus)}\n`, "utf8");
  fs.writeFileSync(path.join(dataDirectory, "style-model.json"), `${JSON.stringify(styleModel)}\n`, "utf8");
  console.log(`構造化投稿: ${posts.length}件`);
  console.log(`文インデックス: ${sentences.length}件`);
  console.log(`手元ログと一致: ${localMatchCount}件`);
  console.log(`倉庫で補完: ${posts.length - localMatchCount}件`);
  console.log(`出力: ${dataDirectory}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
