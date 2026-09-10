import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(process.argv[2]||'D:/SearchBefore/private/ocr-benchmark');
const read=rel=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const frozen=read('reports/local-recovery-frozen-2026-09-09.json');
const script=path.join(path.dirname(fileURLToPath(import.meta.url)),'ocr-local-grid-recovery.py');
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(script)).digest('hex'),frozen.sha256,'Frozen algorithm must not change after evaluation');
const sets=[
  ['train','naf-cell-ground-truth-train-low-v1','train-low-gridline-v11-gated','train-local-recovery-frozen-2026-09-09'],
  ['historical-holdout','naf-cell-ground-truth-holdout-v1','holdout-gridline-v11-gated','holdout-local-recovery-b-2026-09-09'],
  ['original40','naf-cell-ground-truth-v1','gridline-v11-gated','original40-local-recovery-b-2026-09-09']
];
const results=[];
for(const [name,gt,base,next] of sets){
  const manifest=read(gt+'/manifest.json');let preserved=0,recovered=0;
  for(const e of manifest.documents){
    const a=read('predictions/'+base+'/'+e.id+'.json'),b=read('predictions/'+next+'/'+e.id+'.json');
    assert.equal(a.documentId,b.documentId);assert.equal(b.processingMs,null,'No reused latency claims');
    if(a.tables?.some(t=>t.cells?.length)){assert.deepEqual(b.tables,a.tables,'Nonempty page must be preserved');preserved++;}
    else if(b.tables?.some(t=>t.cells?.length))recovered++;
  }
  const a=read('reports/'+base+'.json'),b=read('reports/'+next+'.json');
  assert.equal(b.corpus.evaluatedDocumentCount,manifest.documents.length);
  assert.equal(b.corpus.missingPredictionCount,0);
  assert.ok(b.structure.truePositive>=a.structure.truePositive);
  assert.ok(b.structure.cellF1>=a.structure.cellF1);
  results.push({name,documents:manifest.documents.length,preservedNonemptyPages:preserved,recoveredPages:recovered,baseline:a.structure,candidate:b.structure});
}
console.log(JSON.stringify({passed:true,scriptSha256:frozen.sha256,results},null,2));
