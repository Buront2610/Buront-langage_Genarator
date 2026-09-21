"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fork } = require("node:child_process");
const { once } = require("node:events");
const path = require("node:path");

test("T-12: HTTP経由でも候補ID・検証・原文保持が整合する", { timeout: 30000 }, async (t) => {
  const child = fork("-e", [
    "require('./server').ready.then(app=>process.send({port:app.server.address().port}));",
  ], { cwd: path.resolve(__dirname, ".."), env: { ...process.env, PORT: "0" }, silent: true });
  child.stdout.resume();
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
  });
  const ready = new Promise((resolve, reject) => {
    child.once("message", resolve);
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`Server exited (${code}): ${stderr}`)));
  });
  const { port } = await ready;
  const sessionResponse = await fetch(`http://127.0.0.1:${port}/api/v1/session`, { method: "POST", headers: { "X-Buront-Client": "1", "Content-Type": "application/json" }, body: "{}" });
  const token = (await sessionResponse.json()).token;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Cookie: sessionResponse.headers.get("set-cookie").split(";")[0] };
  for (let i = 0; i < 100; i++) {
    const status = await fetch(`http://127.0.0.1:${port}/api/v1/status`, { headers });
    if ((await status.json()).ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const post = async (body) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/convert`, {
      method: "POST", headers, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const normal = await post({ text: "今日は寒い", level: 2, seed: "m0-http" });
  assert.equal(normal.status, 200);
  const selected = normal.body.candidates.find(({ id }) => id === normal.body.selectedCandidateId);
  assert.equal(selected.text, normal.body.text);
  assert.deepEqual(selected.comparisons, normal.body.comparisons);
  assert.ok(normal.body.suggestions.every(({ verificationStatus }) => verificationStatus === "passed"));
  const fallback = await post({ text: "  100円  ", level: 2, seed: "m0-http", customRules: [{ from: "100円", to: "1100円" }] });
  assert.equal(fallback.status, 200);
  assert.equal(fallback.body.text, "  100円  ");
  assert.equal(fallback.body.selectedCandidateId, null);
  assert.deepEqual(fallback.body.candidates, []);
  assert.equal(fallback.body.summary.passedCount, 0);
  assert.equal((await post({ text: 123 })).status, 400);
});
