"use strict";
// The built server serves only apps/web/dist and dispatches CPU work to Piscina.
const { start } = require("./dist/apps/server/index.js");
const ready = start();
ready.catch(() => { console.error("SERVER_START_FAILED: npm run build と npm run diagnose を確認してください。"); process.exitCode = 1; });
module.exports = { ready };
