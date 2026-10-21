const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'searchbefore-compare-'));
try {
  const scripts = path.join(temp,'scripts'), cache = path.join(temp,'mrl-data','source-cache'), snapshot = path.join(temp,'snapshot');
  for (const dir of [scripts,cache,snapshot]) fs.mkdirSync(dir,{recursive:true});
  fs.copyFileSync(path.join(__dirname,'../scripts/compare-data.mjs'),path.join(scripts,'compare-data.mjs'));
  const base = {name:'測試', form:'WP', content:'1%', dilution:'1000',phi:15,phiText:'7-15',dose:'1',times:'2',moa:'',note:'注意事項',bl:[]};
  const wrap = row => ({作物:{病害:[row]}});
  const html = 'const DATA='+JSON.stringify(wrap(base))+';\n';
  fs.writeFileSync(path.join(temp,'index.html'),html);
  fs.writeFileSync(path.join(cache,'DATA.diff.json'),'KEEP_EXISTING_CACHE');
  fs.writeFileSync(path.join(snapshot,'DATA.built.json'),JSON.stringify(wrap({...base,phiText:'10-15',note:'注意事項\n施藥方法：浸種'})));
  const run = spawnSync(process.execPath,[path.join(scripts,'compare-data.mjs'),'--source-dir',snapshot],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  assert.equal(fs.readFileSync(path.join(cache,'DATA.diff.json'),'utf8'),'KEEP_EXISTING_CACHE');
  assert.equal(fs.readFileSync(path.join(temp,'index.html'),'utf8'),html);
  const diff = JSON.parse(fs.readFileSync(path.join(snapshot,'DATA.diff.json')));
  assert.equal(diff.identical,0);
  assert.deepEqual(diff.changed[0].diff,['phiText','note']);
  assert.equal(diff.gone.length,1);
  assert.equal(diff.added.length,1);
  // User-supplied text containing separators must not collide across fields.
  fs.writeFileSync(path.join(temp,'index.html'),'const DATA='+JSON.stringify(wrap({...base,dose:'1|2',times:'3'}))+';\n');
  fs.writeFileSync(path.join(snapshot,'DATA.built.json'),JSON.stringify(wrap({...base,dose:'1',times:'2|3'})));
  const collision = spawnSync(process.execPath,[path.join(scripts,'compare-data.mjs'),'--source-dir',snapshot],{encoding:'utf8'});
  assert.equal(collision.status,0,collision.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(snapshot,'DATA.diff.json'))).identical,0);
  console.log('Compare DATA: isolated reports, range differences and delimiter-safe keys passed.');
} finally {
  // Only this test-created directory; never touches a real repo or snapshot.
  fs.rmSync(temp,{recursive:true,force:true});
}
