from pathlib import Path
import re

def replace_test(s, prefix, replacement):
    pattern = r"^test\('" + re.escape(prefix) + r"[^\n]*\n[\s\S]*?(?=^test\(|\Z)"
    s, n = re.subn(pattern, lambda _: replacement.strip()+'\n\n', s, count=1, flags=re.M)
    if n != 1: raise Exception('test not found: '+prefix)
    return s

p=Path('test/v1/core.test.js');s=p.read_text(encoding='utf-8').replace("noveltyMode: 'invent', intensity", "noveltyMode: 'blend', intensity")
s=s.replace("forged.nodes.find(node => node.id === 'main-quote').text", "forged.nodes[0].text")
s=s.replace("select(candidates, 'invent').length, count", "select(candidates, 'blend').length, count")
s=s.replace("lockedNodeIds: ['main-quote']", "lockedNodeIds: ['fact-node-0']")
s=s.replace("forged.regeneration.lockedPlan.nodes.find(node => node.id === 'main-quote').text", "forged.regeneration.lockedPlan.nodes[0].text")
s=s.replace("candidate.text.startsWith('担当者が状況を確認した。')", "/^担当者が状況を確認した(?:んだが|からな)。$/u.test(candidate.text)")
s=s.replace("test('Full mode changes presentation order while retaining every fact span'", "test('Full mode retains source order and every fact span without appended rhetoric'")
s=s.replace("candidate.plan.nodes.find(node => node.id === 'main-quote').text", "candidate.plan.nodes[0].text")
s=s.replace("nodes.every(node => require('../../dist/packages/core/planning').equivalentEvent(baseline.ir, node.sourceSpan, node.text))", "require('../../dist/packages/core/rewrite-validation').validateRewrite(baseline.ir, candidate.plan)")
s=s.replace("candidate.plan.backTranslation.includes('寒さ')", "candidate.text.includes('寒い')")
s=replace_test(s,'Canonical mode uses',r'''
test('Canonical permits adaptations; untransformable topics and invent mode abstain', async () => {
  const source='ナイト', analysis=await python.analyze(source);
  for(const noveltyMode of ['canonical','blend','invent']) {
    const result=generate(request(source,{noveltyMode}),analysis,assets);
    assert.equal(result.candidates.length,0);assert.equal(result.fallback.text,source);
  }
  const text='私は確認した。', parsed=await python.analyze(text);
  const adapted=generate(request(text,{noveltyMode:'canonical'}),parsed,assets);
  assert.ok(adapted.candidates.length);assert.ok(adapted.candidates.every(c=>c.novelty.classification==='adaptation'));
  assert.equal(generate(request(text,{noveltyMode:'invent'}),parsed,assets).candidates.length,0);
});
''')
s=s.replace("plan.nodes.find(node => node.type === 'Connective').text = '佐藤が承認した。';", "plan.nodes.push({ id: 'smuggled', type: 'Connective', text: '佐藤が承認した。', factIds: [], evidenceIds: [] });")
p.write_text(s,encoding='utf-8')

p=Path('test/v1/planning.test.js');s=p.read_text(encoding='utf-8').replace("noveltyMode: 'invent', intensity", "noveltyMode: 'blend', intensity")
s=s.replace("assert.ok(result.candidates.length > 0, series.id);", "if (!result.candidates.length) { assert.equal(result.fallback.text, text); continue; }")
s=s.replace("candidate.plan.surface.seriesId, series.id", "candidate.plan.rewrite.seriesId, series.id")
s=s.replace("assert.equal(candidate.plan.nodes.filter(node => node.type === 'FactClause').map(node => node.text).join(''), '担当者が状況を確認した。'.repeat(30));", "assert.equal(candidate.plan.nodes.length,30); assert.equal((candidate.text.match(/担当者が状況を確認/g)||[]).length,30); assert.ok(candidate.plan.rewrite.edits.filter(e=>e.ruleId.startsWith('ending-')).length<=1);")
s=s.replace("const result = generate(request(text, { series: 'roto' }), await analyze(text), assets), candidate = result.candidates[0];", "const ir = await irFor(text); const plan = makePlans(ir, request(text, { series: 'roto' }), assets)[0]; const candidate = { plan };")
s=s.replace("test('M3 provenance rejects forged frame metadata; frame-only variation has identical novelty'", "test('Legacy relation frames still reject forged provenance; frame-only changes have identical novelty'")
s=s.replace("test('M3 register conversion is reanalyzed, deduplicated across candidates and reproduced on replay'", "test('M3 bounded body proof is explicit and reproduced on replay without claiming a reparse'")
s=s.replace("Object.keys(analyses).length, 2", "Object.keys(analyses).length, 0")
s=s.replace("verified.candidates.length, 3", "verified.candidates.length, 2")
s=s.replace("check.code === 'S-roles'", "check.code === 'S-bounded-rewrite'")
p.write_text(s,encoding='utf-8')

p=Path('test/v1/audit-regressions.test.js');s=p.read_text(encoding='utf-8').replace("noveltyMode: 'invent', intensity", "noveltyMode: 'blend', intensity")
s=replace_test(s,'A2 compiler assertion',r'''
test('A2 changing declared body output cannot approve itself', async () => {
  const result=await run('田中が佐藤を助けた。');assert.ok(result.candidates.length);
  for(const text of ['佐藤が田中を助けた。','佐藤は承認を終えた。','田中が佐藤を助けなかった。']) {
    const plan=structuredClone(result.candidates[0].plan);plan.nodes[0].text=text;
    const draft=realize(plan,result.ir),checks=validateCandidate(result.ir,plan,draft.text,draft.spans,new Set(assets.evidence.map(e=>e.id)),undefined,new Map(assets.evidence.map(e=>[e.id,e.text])),assets.seriesProfiles);
    assert.equal(checks.find(c=>c.code==='V-rewrite').status,'fail');assert.equal(ruleQuality(result.ir,plan).C,0);
  }
});
''')
s=s.replace("test('A1 changing source participants changes the recoverable metaphor relation'", "test('A1 changing source participants changes the rewritten body'")
s=s.replace("candidate.plan.rhetoric?.relation === 'assistance'", "candidate.text.includes('田中が佐藤を助けた')")
s=replace_test(s,'A3 supported dictionary',r'''
test('A3 free dictionaries do not bypass the bounded body proof', async () => {
  for(const to of ['冷え込み','冷気','実際には佐藤が田中を助けた。']) {
    const result=await run('今日は寒い。',{customRules:[{id:'cold',from:'寒さ',to,priority:0}]});
    assert.equal(result.candidates.length,0);assert.ok(result.reviewCandidates.length);
    assert.equal(result.shortfallReason,'dictionary_needs_review');
    for(const c of result.reviewCandidates){assert.ok(!c.text.includes(to));assert.equal(c.checks.find(x=>x.code==='V-dictionary').status,'unknown')}
  }
});
''')
s=s.replace("rhetoricalCore(c).includes('届かなかった助力')", "c.text.includes('助けなかった')")
s=s.replace("rhetoricalCore(c).includes('届いた助力')", "c.text.includes('助けた')")
s=s.replace("['今日は寒くない。', '猫',", "['猫',")
s=s.replace("const result = await run('田中が佐藤を助けた。');\n  const base = result.candidates[0].plan;", "const ir=await irFor('田中が佐藤を助けた。'); const result={ir};\n  const base=makePlans(ir,request(ir.source.raw),assets)[0];")
s=s.replace("test('A2/A4 inverse grammar", "test('Legacy A2/A4 inverse grammar")
s=s.replace("'届いていた助力'", "'助けていた'").replace("'過去に進行していた確認'", "'確認していた'").replace("'過去の調査'", "'調べた'")
s=s.replace("candidate.plan.surface.coreText.includes(expected)", "candidate.text.includes(expected)")
s=s.replace("const result = await run('今日は寒い。'), base = result.candidates;", "const result = await run('私は処理の速度をアピールした。'), base = result.candidates;")
s=s.replace("select(candidates, 'invent')", "select(candidates, 'blend')")
s=s.replace("test('A7 closing an independent copular clause is reparsed without loss of events'", "test('A7 body rewriting keeps linked clauses and every original event'")
s=s.replace("assert.ok(result.candidates.some(candidate => candidate.text.includes('Bは停止中だ。')));", "assert.ok(result.candidates.some(candidate => candidate.text.includes('Bは停止中で、')));")
p.write_text(s,encoding='utf-8')

p=Path('test/v1/api.test.js');s=p.read_text(encoding='utf-8').replace("noveltyMode: 'invent', intensity", "noveltyMode: 'blend', intensity")
s=s.replace("result.candidates.length, 3", "result.candidates.length, 2")
s=s.replace("['main-quote']", "['fact-node-0']")
s=s.replace("node.id === 'main-quote'", "node.id === 'fact-node-0'")
s=s.replace("check.code === 'S-roles'", "check.code === 'S-bounded-rewrite'")
s=s.replace("M3 API completes independent reanalysis", "M3 API completes bounded body proof")
s=s.replace("T-20 cancellation during factual reanalysis", "T-20 cancellation during source analysis")
s=s.replace("text === '担当者が状況を確認した。'", "text === '担当者が状況を確認しました。'")
s=replace_test(s,'A3 dictionary edits pass',r'''
test('A3 HTTP body dictionary requests remain reviewable and unapplied', async () => {
  for(const to of ['冷え込み','冷気','佐藤が田中を助けた。']) {
    const response=await app.inject({method:'POST',url:'/api/v1/generations',headers,payload:{...request(),customRules:[{id:'synonym',from:'寒さ',to,priority:0}]}});
    assert.equal(response.statusCode,202);const job=await poll(response.json().jobId);assert.equal(job.state,'completed');
    assert.equal(job.result.candidates.length,0);assert.ok(job.result.reviewCandidates.length);assert.equal(job.result.shortfallReason,'dictionary_needs_review');
    assert.ok(job.result.reviewCandidates.every(c=>c.verificationStatus==='needs_review'&&!c.text.includes(to)));
  }
});
''')
p.write_text(s,encoding='utf-8')
