"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { RequestState } = require("../request-state");

test("T-19: 連打とキーボード実行を同じ実行ガードで抑制する", () => {
  const state = new RequestState();
  const first = state.begin({ text: "旧入力" });
  assert.equal(state.begin({ text: "重複" }), null);
  assert.equal(state.isCurrent(first), true);
});

test("T-19: クリア・入力変更後の旧応答とfinallyが新しい要求を変更しない", async () => {
  const state = new RequestState();
  const first = state.begin({ text: "旧入力" });
  let completeOld;
  const response = new Promise((resolve) => { completeOld = resolve; });
  const rendered = [];
  const oldTask = response.then((value) => {
    if (state.isCurrent(first)) rendered.push(value);
  }).finally(() => state.finish(first));
  state.invalidate();
  assert.equal(first.controller.signal.aborted, true);
  const second = state.begin({ text: "新入力" });
  completeOld("古い結果");
  await oldTask;
  assert.deepEqual(rendered, []);
  assert.equal(state.isCurrent(second), true);
  assert.equal(state.finish(second), true);
  assert.equal(state.active, null);
});
