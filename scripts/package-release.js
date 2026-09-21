"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, ".."), name = `buront-local-${require("../package.json").version}`;
let destination = path.join(root, "artifacts", name);
let suffix = 1;
while (fs.existsSync(destination)) destination = path.join(root, "artifacts", `${name}-${suffix++}`);
fs.mkdirSync(destination, { recursive: true });
const include = ["apps", "assets", "packages", "services", "lib", "scripts", "data", "docs", "examples", "test", "package.json", "package-lock.json", "build-info.json", "tsconfig.json", ".python-version", "server.js", "request-state.js", "app.js", "index.html", "setup.ps1", "start.bat", "styles.css", "README.md", "artifacts/v1-evaluation", "artifacts/v1-verification.json", "artifacts/v1-all-tests.txt", "artifacts/m0-counterexample-audit.json"];
function copy(source, target) {
  if (fs.lstatSync(source).isSymbolicLink()) throw new Error("Release cannot contain symbolic links");
  if (fs.statSync(source).isDirectory()) { fs.mkdirSync(target, { recursive: true }); for (const entry of fs.readdirSync(source)) if (!["node_modules", "__pycache__", ".venv"].includes(entry)) copy(path.join(source, entry), path.join(target, entry)); }
  else fs.copyFileSync(source, target);
}
include.push("artifacts/v1-evaluation-experimental.3", "artifacts/v1-all-tests-experimental.3.txt", "artifacts/v1-verification-experimental.3.json", "artifacts/audit-regressions-before.txt", "artifacts/v1-evaluation-experimental.2", "artifacts/v1-verification-experimental.2.json", "artifacts/v1-all-tests-experimental.2.txt");
for (const relative of include) { const source = path.join(root, relative); if (relative.startsWith("artifacts/") && !fs.existsSync(source)) continue; copy(source, path.join(destination, relative)); }
const files = {};
function inventory(directory) { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const file = path.join(directory, entry.name); if (entry.isDirectory()) inventory(file); else files[path.relative(destination, file).split(path.sep).join("/")] = createHash("sha256").update(fs.readFileSync(file)).digest("hex"); } }
inventory(destination);
fs.writeFileSync(path.join(destination, "LOCAL-BUNDLE-MANIFEST.json"), JSON.stringify({ schemaVersion: 1, version: require("../package.json").version, platformTested: "Windows x64", rights: "Corpus redistribution is unverified. This is a local development bundle, not approved for public redistribution.", dependencies: "package-lock.json and services/japanese-analysis/requirements.lock.txt", files }, null, 2));
console.log(JSON.stringify({ directory: destination, fileCount: Object.keys(files).length, publicRedistributionApproved: false }));
