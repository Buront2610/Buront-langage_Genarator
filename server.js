const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { CorpusEngine } = require("./lib/corpus-engine");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 4173;
const ROOT = __dirname;
let engine;
let engineError;

try {
  engine = new CorpusEngine();
} catch (error) {
  engineError = error;
  console.error("コーパス比較エンジンの読み込みに失敗しました:", error.message);
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 80_000) {
        reject(new Error("リクエストが大きすぎます"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("JSONを解析できません"));
      }
    });
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  let pathname;

  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${HOST}`).pathname);
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad request");
    return;
  }

  if (pathname === "/api/status" && request.method === "GET") {
    if (!engine) {
      sendJson(response, 503, { ready: false, error: engineError?.message || "エンジンを読み込めません" });
      return;
    }
    sendJson(response, 200, engine.status());
    return;
  }

  if (pathname === "/api/convert" && request.method === "POST") {
    if (!engine) {
      sendJson(response, 503, { error: engineError?.message || "エンジンを読み込めません" });
      return;
    }
    try {
      const body = await readJsonBody(request);
      const result = engine.convert(body.text, {
        level: body.level,
        customRules: body.customRules,
        seed: body.seed,
        contextMode: body.contextMode,
        series: body.series ?? body.era,
      });
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(ROOT, `.${requestedPath}`);

  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    fs.createReadStream(filePath).pipe(response);
  });
});

server.listen(PORT, HOST, () => {
  const status = engine ? engine.status() : null;
  console.log(`ブロント語変換機: http://${HOST}:${PORT}`);
  if (status) {
    console.log(`コーパス: ${status.posts}投稿 / ${status.sentences}文 / 改変集${status.novelChapters}話`);
    console.log("変換方式: コーパス検索 + 候補比較 + 検証（LLM不使用）");
  }
  console.log("終了するには Ctrl+C を押してください。");
});

// APIスモークテストなどから待受を安全に終了できるよう公開する。
module.exports = { server };
