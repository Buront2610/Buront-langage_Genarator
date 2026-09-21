'use strict';
const fs=require('node:fs');
const {StyleVectorAudit,mean}=require('../../dist/packages/evaluation/style-vector');
const {hash}=require('../../dist/packages/core/source');
const frozen=JSON.parse(fs.readFileSync('artifacts/vector-style-audit/reference-split.json','utf8'));
const corpus=JSON.parse(fs.readFileSync('data/log-corpus.json','utf8'));
const sentences=new Map(corpus.sentences.map(row=>[row.id,row]));
const posts=new Map(corpus.posts.map(row=>[row.id,row]));
const train=frozen.trainIds.map(id=>{const row=sentences.get(id);return {id:row.id,text:row.text,thread:posts.get(row.postId)?.threadUrl??row.postId,postId:row.postId}});
const outputs=JSON.parse(fs.readFileSync('artifacts/full-log-reread/outputs.json','utf8'));
const old=JSON.parse(fs.readFileSync('artifacts/vector-style-audit/report.json','utf8'));
const views=['raw','script_masked','phrase_masked'],models=Object.fromEntries(views.map(v=>[v,new StyleVectorAudit(train,v)]));
for(const v of views) if(models[v].modelId!==frozen.models[v].id)throw Error('REFERENCE_MODEL_CHANGED');
const measure=text=>Object.fromEntries(views.map(v=>[v,models[v].measure(text).cosine]));
const rows=outputs.rows.map(({source,result})=>({source,plain:measure(source),outputs:result.candidates.map(c=>({text:c.text,vector:measure(c.text),expansion:[...c.text].length/[...source].length,edits:c.plan.rewrite.edits.map(e=>({from:e.from,to:e.to,evidenceIds:e.evidenceIds}))})),abstention:!result.candidates.length,reason:result.shortfallReason}));
const matched=rows.filter(row=>old.rows.some(previous=>previous.source===row.source));
const comparison=Object.fromEntries(views.map(v=>[v,{
  matchedInputs:matched.length,
  previousMean:mean(matched.flatMap(row=>old.rows.find(p=>p.source===row.source).generated.map(c=>c.vector[v].cosine))),
  currentMean:mean(matched.flatMap(row=>row.outputs.map(c=>c.vector[v]))),
  ordinaryExplanationMean:mean(matched.map(row=>old.rows.find(p=>p.source===row.source).controls.find(c=>c.method==='ordinary_explanation').vector[v].cosine)),
  incoherentMean:mean(matched.map(row=>old.rows.find(p=>p.source===row.source).controls.find(c=>c.method==='incoherent').vector[v].cosine)),
}]));
const report={schemaVersion:1,engine:outputs.engine,referenceSplitHash:hash(frozen),caseCount:rows.length,generatedCases:rows.filter(r=>!r.abstention).length,outputCount:rows.flatMap(r=>r.outputs).length,meanExpansion:mean(rows.flatMap(r=>r.outputs.map(c=>c.expansion))),comparison,rows,styleConfirmed:false,humanLabels:0,limitations:['文字n-gram TF-IDFであり意味埋め込みではない。','以前と同じ参照ベクトルで測定。元ログ全体を利用する生成器の未知スレッドへの汎化検証ではない。','候補数と棄権が異なるため平均値を品質向上率と読まない。','普通の説明文や支離滅裂な対照にも近くなる指標。人間の文体判断を代替しない。','このスクリプトは人間評価パック・評価回答を書き込まない。']};
fs.writeFileSync('artifacts/full-log-reread/vector-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({cases:report.caseCount,generatedCases:report.generatedCases,outputs:report.outputCount,meanExpansion:report.meanExpansion,comparison,styleConfirmed:false},null,2));
