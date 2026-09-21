const fs = require('node:fs');
const { PythonClient } = require('../../dist/packages/runtime/python-client');
const { compileAssets } = require('../../dist/packages/core/assets');
const { generate } = require('../../dist/packages/core/engine');
const { verifyGeneratedResult } = require('../../dist/packages/runtime/semantic-verification');
const sources = [...new Set([
  '私は最強だ。', 'すでに時間切れだった。', '敵を瞬殺した。', '私は動かないです。', '存在感が桁外れだ。',
  '今日は寒い。', '今日は寒いです。', '田中が佐藤を助けた。',
  '田中がAを復旧した。Bは停止中で、私は明日確認する。',
  '私は処理の速度をアピールしました。', '全員に助言したが、雰囲気は悪かった。',
  '私は怒りが頂点に達した。', '私はとても悲しかった。',
  '資料は貴重です。', '全然動かない。', 'それは確実だ。',
  '全員が速さとスピードを比較した。', '速度制限を確認した。',
  '私は明日確認するかもしれない。', '私は確認しませんでした。',
  '田中は「私は全員に助言します」と言った。', '私は助言したと田中が言った。',
  '私は100件の記録を確認した。', '私はAからBへ3個を渡した。',
  '確認してくれてありがとうございます。', 'どうすればいいですか？',
  'もし全員が来れば確認する。', '私立学校で雰囲気を調べた。',
  ...JSON.parse(fs.readFileSync('artifacts/vector-style-audit/report.json','utf8')).rows.map(row=>row.source),
])];
(async () => {
 const python = new PythonClient(), assets = compileAssets(), rows = [];
 try { await python.start(); for (const source of sources) {
  const request = { source, task: 'rewrite', contextMode: 'faithful', noveltyMode: 'blend', intensity: source === '存在感が桁外れだ。' ? 3 : 2, series: 'all', backend: 'structured', clientRevision: 0, seed: 'full-read-check' };
  const analysis = await python.analyze(source);
  const result = await verifyGeneratedResult(generate(request, analysis, assets), python, analysis);
  rows.push({source, result}); console.log(JSON.stringify({source, candidates:result.candidates.map(c=>c.text), review:result.reviewCandidates.map(c=>({text:c.text,checks:c.checks.filter(x=>x.status!=='pass')})),shortfall:result.shortfallReason}));
 } fs.writeFileSync('artifacts/full-log-reread/outputs.json', JSON.stringify({engine:assets.manifest.engine,rows},null,2)); }
 finally {python.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
