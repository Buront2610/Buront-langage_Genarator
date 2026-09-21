@echo off
cd /d "%~dp0"
node scripts/diagnose.js
if errorlevel 1 (
  echo setup.ps1 を実行してから起動してください。
  pause
  exit /b 1
)
echo http://127.0.0.1:4173 をブラウザーで開いてください。
node server.js
pause
