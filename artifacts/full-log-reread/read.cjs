'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const source = 'C:/Users/Glutt/OneDrive/デスクトップ/burontlog.txt';
const raw = fs.readFileSync(source, 'utf8');
const lines = raw.split(/\r?\n/);
const pages = []; let buffer = [], size = 0;
for (const [index, line] of lines.entries()) {
  if (!line.trim()) continue;
  // Shorten repetitive post metadata only. Keep all nonempty body lines, including quotes.
  const header = /^\s*(\d+)\s*(?:名前[：:]|[：:])(.+?)(?:[：:]\s*(?:20\d{2}|\d{2})\/|投稿日[：:]?\s*(?:20\d{2}|\d{2})\/)/u.exec(line);
  const display = header ? `[${index + 1}] #${header[1]} ${header[2].trim()}${/ID:([^\s]+)/u.exec(line)?.[1] ? ' ID:' + /ID:([^\s]+)/u.exec(line)[1] : ''}` : `[${index + 1}] ${line}`;
  if (size + display.length > 8500 && buffer.length) { pages.push(buffer.join('\n')); buffer = []; size = 0; }
  buffer.push(display); size += display.length + 1;
}
if (buffer.length) pages.push(buffer.join('\n'));
const manifest = { source, sha256: crypto.createHash('sha256').update(raw).digest('hex'), sourceLines: lines.length, nonemptyLines: lines.filter(l => l.trim()).length, pages: pages.map((p,i) => ({ page:i + 1, chars:p.length, first:p.split('\n')[0], last:p.split('\n').at(-1) })) };
fs.writeFileSync(path.join(__dirname, 'manifest.json'), JSON.stringify(manifest, null, 2));
for (const [i, page] of pages.entries()) fs.writeFileSync(path.join(__dirname, `page-${String(i+1).padStart(2,'0')}.txt`), page);
const start = Number(process.argv[2]), count = Number(process.argv[3] ?? 1);
if (start) for(let i=start-1;i<Math.min(pages.length,start-1+count);i++) console.log(`PAGE ${i+1}/${pages.length}\n${pages[i]}\nEND PAGE ${i+1}`);
else console.log(JSON.stringify({ ...manifest, pages: pages.length }));
