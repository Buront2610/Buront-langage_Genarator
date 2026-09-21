'use strict';
// Read-only source investigation. Does not rebuild corpora or create human labels.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const corpus = read('data/log-corpus.json');
const series = read('data/archive-series.json').series;
const rawPath = 'C:/Users/Glutt/OneDrive/デスクトップ/burontlog.txt';
const bytes = fs.readFileSync(rawPath), raw = bytes.toString('utf8');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
assert.equal(digest(raw.replace(/^\uFEFF/, '')), corpus.sources.localLog.sha256);
const flat = [], positions = [];
for (let i = 0; i < raw.length; i++) if (!/\s/u.test(raw[i])) { flat.push(raw[i]); positions.push(i); }
const normalized = flat.join('');
const selected = new Map();
function add(post, reason) {
  if (!post) return;
  const item = selected.get(post.id) ?? { post, reasons: [] };
  item.reasons.push(reason); selected.set(post.id, item);
}
const phrases = ['黄金の鉄の塊', 'それほどでもない', '俺の怒りは有頂天', 'どちかというと大反対', '今回のでそれが良くわかったよ',
  '９枚で良い', '俺は謙虚だから周り', 'これが会話ログ', '汚いなさすが', '致命的な致命傷', '稀にだがよくある',
  '見事な仕事', '俺がどうやって偽者', 'ギガは雷', 'もう一眠り', '黒魔が魔法使えるのはずるい', 'おい、やめろ馬鹿'];
for (const phrase of phrases) add(corpus.posts.find(post => post.content.includes(phrase)), `focused:${phrase}`);
for (const group of series) {
  const ids = new Set(group.postIds);
  const posts = corpus.posts.filter(post => ids.has(post.id));
  // Reproducible contrast to famous-quote selection, across all nine supplied series.
  for (const [label, candidates] of [['short', posts.filter(p => p.content.length >= 8 && p.content.length <= 70)], ['long', posts.filter(p => p.content.length >= 140 && p.content.length <= 1000)]]) {
    const ordered = candidates.sort((a, b) => digest('original-reread-v1:' + a.id).localeCompare(digest('original-reread-v1:' + b.id)));
    add(ordered[0], `series:${group.id}:${label}`);
  }
}
const records = [...selected.values()].map(({ post, reasons }) => {
  const needle = post.content.replace(/\s/gu, ''), index = normalized.indexOf(needle);
  const start = index < 0 ? null : positions[index], end = index < 0 ? null : positions[index + needle.length - 1] + 1;
  const line = start === null ? null : raw.slice(0, start).split('\n').length;
  return { id: post.id, reasons, thread: post.threadTitle, responseNumber: post.responseNumber, name: post.name,
    series: series.filter(s => s.postIds.includes(post.id)).map(s => s.id),
    source: { path: rawPath, line, exactTextIgnoringWhitespace: start !== null, contentHash: digest(post.content) },
    content: post.content, anchorTargets: post.anchorTargets,
    originalExcerpt: start === null ? null : raw.slice(start, end) };
});
const lengths = corpus.posts.map(p => [...p.content].length).sort((a, b) => a - b);
const patterns = { explicitAnalogy: /みたいなもの/u, sameGeneratedAnalogyEnding: /みたいなものなんだが/u, syntheticParenthetical: /[（(]ここ大事[）)]/u,
  causal: /から|ので|なぜなら|何故なら/u, conclusion: /やはり|つまり|証明|判明|決まっ/u,
  modesty: /謙虚|それほどでもない/u, refusalOrCorrection: /違う|違い|ちが|ではない|じゃない/u };
const summary = { sourceSha256: digest(bytes), corpusSha256: digest(fs.readFileSync(path.join(root, 'data/log-corpus.json'))),
  posts: corpus.posts.length, sentences: corpus.sentences.length, reviewedPosts: records.length, rawMatchedReviewedPosts: records.filter(r => r.source.exactTextIgnoringWhitespace).length,
  seriesCovered: [...new Set(records.flatMap(r => r.series))], medianPostCharacters: lengths[Math.floor(lengths.length / 2)],
  postsAtMost70Characters: lengths.filter(n => n <= 70).length,
  patternPostCounts: Object.fromEntries(Object.entries(patterns).map(([label, re]) => [label, corpus.posts.filter(p => re.test(p.content)).length])),
  scope: 'Counts are literal pattern observations, not authorship claims or human style labels. Focused examples and deterministic short/long samples are not a representative quality benchmark.' };
fs.writeFileSync(path.join(__dirname, 'evidence.json'), JSON.stringify({ summary, records }, null, 2));
fs.writeFileSync(path.join(__dirname, 'reading.md'), records.map(r => `## ${r.id} / ${r.thread} #${r.responseNumber}\n${r.reasons.join(', ')}\n原文行: ${r.source.line ?? '未照合'}\n\n${r.content}\n\n返信対象（取得済み範囲）: ${JSON.stringify(r.anchorTargets)}\n`).join('\n'));
console.log(JSON.stringify(summary, null, 2));
