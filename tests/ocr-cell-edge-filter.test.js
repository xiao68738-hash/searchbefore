// Synthetic research regression; no real photos, transcripts or credentials.
const assert=require('node:assert');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');
const privateRoot=fs.mkdtempSync(path.join(os.tmpdir(),'searchbefore-edge-filter-private-'));
const tmp=fs.mkdtempSync(path.join(privateRoot,'edge-filter-test-'));
const script=path.resolve(__dirname,'../scripts/evaluate-cell-edge-filter.mjs');
const write=(p,j)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(j));};
const run=args=>cp.spawnSync(process.execPath,[script,...args],{encoding:'utf8',env:{...process.env,SEARCHBEFORE_PRIVATE_ROOT:privateRoot}});
const square=x=>[[x,0],[x+10,0],[x+10,10],[x,10]];
let checks=0;
try{
  const gt=path.join(tmp,'gt'),pred=path.join(tmp,'pred'),features=path.join(tmp,'features.json');
  const policy=path.join(tmp,'policy.json');
  write(path.join(gt,'manifest.json'),{purpose:'development-only',documents:[{id:'fake-a',split:'train',groundTruth:'a.json'}]});
  write(path.join(gt,'a.json'),{cells:[{polygon:square(0)}]});
  write(path.join(pred,'fake-a.json'),{tables:[{cells:[{polygon:square(0)},{polygon:square(30)}]}]});
  write(features,{documents:[{id:'fake-a',edges:[[1,1,1,1],[0,0,0,0]]}]});
  const first=run(['train',gt,pred,features,policy,path.join(tmp,'report.json')]);assert.equal(first.status,0,first.stderr);checks++;
  const report=JSON.parse(fs.readFileSync(path.join(tmp,'report.json'),'utf8'));
  assert.deepEqual([report.baseline.tp,report.baseline.fp,report.baseline.fn],[1,1,0]);checks++;
  assert.deepEqual([report.candidate.tp,report.candidate.fp,report.candidate.fn],[1,0,0]);checks++;
  assert.equal(run(['train',gt,pred,features,policy,path.join(tmp,'another.json')]).status,1,'Must not overwrite a frozen policy');checks++;
  assert.equal(run(['evaluate',gt,pred,features,policy,path.join(tmp,'overlap.json')]).status,1,'Evaluation must reject train IDs');checks++;
  write(features,{documents:[{id:'fake-a',edges:[]}]});
  assert.equal(run(['train',gt,pred,features,path.join(tmp,'bad-policy.json'),path.join(tmp,'bad-report.json')]).status,1,'Reject misaligned features');checks++;
  write(path.join(gt,'manifest.json'),{purpose:'evaluation-only',documents:[{id:'fake-a',split:'test',groundTruth:'a.json'}]});
  assert.equal(run(['train',gt,pred,features,path.join(tmp,'test-policy.json'),path.join(tmp,'test-report.json')]).status,1,'Do not tune on test');checks++;
  console.log('ocr-cell-edge-filter.test.js: '+checks+' checks passed');
}finally{
  const resolved=fs.realpathSync(tmp),rel=path.relative(privateRoot,resolved);
  if(!rel||rel.startsWith('..')||path.isAbsolute(rel)||!path.basename(resolved).startsWith('edge-filter-test-'))throw Error('Unsafe fixture cleanup');
  fs.rmSync(resolved,{recursive:true,force:false});
  const rootResolved=fs.realpathSync(privateRoot);
  if(path.basename(rootResolved).startsWith('searchbefore-edge-filter-private-'))fs.rmSync(rootResolved,{recursive:true,force:false});
}
