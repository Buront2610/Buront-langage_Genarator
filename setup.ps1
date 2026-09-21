param([switch]$Offline)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 24 が必要です。インストール後に再実行してください。' }
$nodeMajor = & node -p "process.versions.node.split('.')[0]"
if ($nodeMajor -ne '24') { throw '対応環境は Node.js 24 です。' }
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { throw 'uv が必要です。公式の uv インストーラーを使い、再実行してください。' }
if ($Offline) {
  npm ci --offline
  if ($LASTEXITCODE -ne 0) { throw 'npm キャッシュに不足があります。初回はネットワーク接続で実行してください。' }
  uv venv --offline --allow-existing --python 3.11.15 .venv
  if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 のローカルキャッシュがありません。' }
  uv pip install --offline --python .venv/Scripts/python.exe --require-hashes -r services/japanese-analysis/requirements.lock.txt
} else {
  npm ci
  if ($LASTEXITCODE -ne 0) { throw 'npm の依存導入に失敗しました。' }
  uv venv --allow-existing --python 3.11.15 .venv
  if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 環境の作成に失敗しました。' }
  uv pip install --python .venv/Scripts/python.exe --require-hashes -r services/japanese-analysis/requirements.lock.txt
}
if ($LASTEXITCODE -ne 0) { throw 'Python の固定依存導入に失敗しました。' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'ビルドに失敗しました。' }
npm run build:assets
if ($LASTEXITCODE -ne 0) { throw '資産ビルドに失敗しました。' }
npm run diagnose
if ($LASTEXITCODE -ne 0) { throw '環境診断に失敗しました。' }
Write-Output '準備完了。npm start で起動してください。通常起動にはネットワーク接続は不要です。'
