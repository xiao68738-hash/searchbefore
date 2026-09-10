// Research harness. Reuses the existing scorer's exact polygon implementation.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const [mode,gtArg,predArg,featureArg,policyArg,reportArg,predOutArg]=process.argv.slice(2);
if(!['train','evaluate'].includes(mode)||!reportArg)throw Error('train|evaluate GT PRED FEATURES POLICY REPORT [NEW_PRED_OUT]');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
// Keep the production default on the local private root, while allowing the
// synthetic regression test to use an isolated CI temp directory.
const privateRoot=path.resolve(process.env.SEARCHBEFORE_PRIVATE_ROOT||'D:/SearchBefore/private');
const safeNew=p=>{const full=path.resolve(p),rel=path.relative(privateRoot,full);if(!rel||rel.startsWith('..')||path.isAbsolute(rel)||fs.existsSync(full))throw Error('Output must be new and private: '+p);return full;};
safeNew(reportArg);if(mode==='train')safeNew(policyArg);if(predOutArg)safeNew(predOutArg);
const manifest=read(path.join(gtArg,'manifest.json'));
if(mode==='train'&&(!manifest.documents.every(d=>d.split==='train')||manifest.purpose!=='development-only'))throw Error('Policy selection restricted to development-only official train');
const scorer=fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'score-ocr-cell-benchmark.mjs'),'utf8');
const start=scorer.indexOf('function area('),end=scorer.indexOf('function polygonCenter(');
if(start<0||end<=start)throw Error('Scorer geometry changed; review harness');
const iou=vm.runInNewContext(scorer.slice(start,end)+'; iou;',{}, {timeout:1000});
const features=new Map(read(featureArg).documents.map(d=>[d.id,d.edges]));
const docs=[];
for(const entry of manifest.documents){
  const gt=read(path.join(gtArg,entry.groundTruth)),prediction=read(path.join(predArg,entry.id+'.json'));
  const cells=(prediction.tables||[]).flatMap(t=>t.cells||[]),edges=features.get(entry.id);
  if(!edges||edges.length!==cells.length||edges.some(e=>e.length!==4||e.some(v=>!Number.isFinite(v)||v<0||v>1)))throw Error('Invalid/aligned features required');
  const candidates=[];
  const bounds=p=>[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];
  const gb=gt.cells.map(c=>bounds(c.polygon)),pb=cells.map(c=>bounds(c.polygon));
  for(let gi=0;gi<gt.cells.length;gi++)for(let pi=0;pi<cells.length;pi++){
    const a=gb[gi],b=pb[pi];if(a[2]<b[0]||b[2]<a[0]||a[3]<b[1]||b[3]<a[1])continue;
    const score=iou(gt.cells[gi].polygon,cells[pi].polygon);if(score>=.5)candidates.push({gi,pi,score});
  }
  candidates.sort((a,b)=>b.score-a.score);
  docs.push({id:entry.id,gt:gt.cells.length,cells,prediction,candidates,support:edges.map(e=>[...e].sort((a,b)=>b-a)[1])});
}
function score(threshold){
  const rows=docs.map(d=>{const kept=new Set(d.support.flatMap((x,i)=>x>=threshold?[i]:[])),ug=new Set(),up=new Set();for(const c of d.candidates){if(!kept.has(c.pi)||ug.has(c.gi)||up.has(c.pi))continue;ug.add(c.gi);up.add(c.pi);}return {id:d.id,groundTruth:d.gt,predicted:kept.size,tp:ug.size,fp:kept.size-ug.size,fn:d.gt-ug.size};});
  const sum=rows.reduce((a,r)=>({tp:a.tp+r.tp,fp:a.fp+r.fp,fn:a.fn+r.fn}),{tp:0,fp:0,fn:0});
  const precision=sum.tp/Math.max(1,sum.tp+sum.fp),recall=sum.tp/Math.max(1,sum.tp+sum.fn);
  return {threshold,...sum,precision,recall,f1:2*sum.tp/Math.max(1,2*sum.tp+sum.fp+sum.fn),documents:rows};
}
const baseline=score(0);
let policy,sweep;
if(mode==='train'){
  sweep=[0,.05,.1,.15,.2,.25,.3,.4,.5].map(score);
  const chosen=sweep.filter(x=>x.recall>=baseline.recall*.98).sort((a,b)=>b.f1-a.f1||a.threshold-b.threshold)[0];
  policy={version:1,selectedOn:'official-train-only',threshold:chosen.threshold,rule:'Keep cell if at least two polygon edges meet support threshold',recallRetentionMinimum:.98,trainingDocuments:docs.length,trainingIds:docs.map(d=>d.id),scorerSha256:crypto.createHash('sha256').update(scorer).digest('hex')};
  fs.mkdirSync(path.dirname(policyArg),{recursive:true});fs.writeFileSync(policyArg,JSON.stringify(policy,null,2)+'\n');
}else{policy=read(policyArg);if(policy.selectedOn!=='official-train-only'||!Number.isFinite(policy.threshold)||policy.threshold<0||policy.threshold>1)throw Error('Invalid frozen policy');if(docs.some(d=>policy.trainingIds.includes(d.id)))throw Error('Evaluation overlaps policy training documents');}
const candidate=score(policy.threshold);
const report={generatedAt:new Date().toISOString(),mode,policy,baseline,candidate,sweep:sweep?.map(({documents,...r})=>r),limitations:['Structure-only filtering; does not recognize text or recover missing cells.','The historical holdout has been inspected in prior work; not an untouched final test set.','No latency claim: original predictions contain timings from earlier runs.'],delta:{tp:candidate.tp-baseline.tp,fp:candidate.fp-baseline.fp,fn:candidate.fn-baseline.fn,f1:candidate.f1-baseline.f1}};
fs.mkdirSync(path.dirname(reportArg),{recursive:true});fs.writeFileSync(reportArg,JSON.stringify(report,null,2)+'\n');
if(predOutArg){fs.mkdirSync(predOutArg,{recursive:true});for(const d of docs){const p=structuredClone(d.prediction);let i=0;for(const t of p.tables||[])t.cells=(t.cells||[]).filter(()=>d.support[i++]>=policy.threshold);p.processingMs=null;p.researchFilter={name:'polygon-edge-support-v12-candidate',threshold:policy.threshold,requiresHumanReview:true};fs.writeFileSync(path.join(predOutArg,d.id+'.json'),JSON.stringify(p)+'\n');}}
console.log(JSON.stringify({mode,documents:docs.length,threshold:policy.threshold,baseline:{tp:baseline.tp,fp:baseline.fp,fn:baseline.fn,f1:baseline.f1},candidate:{tp:candidate.tp,fp:candidate.fp,fn:candidate.fn,f1:candidate.f1},delta:report.delta,sweep:report.sweep},null,2));
