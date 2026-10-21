const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {spawnSync} = require('node:child_process');
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'searchbefore-notes-'));
try {
  fs.writeFileSync(path.join(temp,'permits.json'),JSON.stringify([{中文名稱:'測試成分',許可證字:'測試',許可證號:'1'}]));
  const row = {作物名稱:'測試作物',病蟲害名稱:'測試防治對象',注意事項:'採收時除去外葉',備註:'僅限播種前',施藥方法:'種植前3天使用',稀釋倍數:'-'};
  const details = path.join(temp,'details.json');
  fs.writeFileSync(details,JSON.stringify({'測試-1':[row]}));
  const script = path.join(__dirname,'../scripts/audit-usage-notes.mjs');
  const output = path.join(temp,'report.json');
  const run = spawnSync(process.execPath,[script,temp,output],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const result = JSON.parse(fs.readFileSync(output));
  assert.equal(result.rows,1);
  assert.equal(result.missingSourceFields,0);
  assert.equal(result.noMultipleUniqueCombinationsRecovered,1);
  assert.equal(result.effectivePhiChanges,0);
  assert.equal(result.requiresPhiReview,false);
  const original = fs.readFileSync(output,'utf8');
  assert.notEqual(spawnSync(process.execPath,[script,temp,output]).status,0,'May not overwrite historical evidence');
  assert.equal(fs.readFileSync(output,'utf8'),original);
  fs.writeFileSync(details,JSON.stringify({'測試-1':[{...row,施藥方法:'採收前21天停止用藥'}]}));
  const reviewOutput = path.join(temp,'needs-review.json');
  assert.equal(spawnSync(process.execPath,[script,temp,reviewOutput]).status,2,'Changed harvest inference requires review, not an automatic pass');
  assert.equal(JSON.parse(fs.readFileSync(reviewOutput)).requiresPhiReview,true);
  console.log('Usage notes audit: preserved fields, no invented PHI, review gate and immutable reports passed.');
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
