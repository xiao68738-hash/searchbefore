// Run after the JVM test, so this reads an actual Kotlin export, not another JS export.
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const farm=require('../farm-records.js');
const {migrationFixture}=require('./native-backup-fixture.cjs');
const output=path.join(__dirname,'../android-native/app/build/native-validation/web-roundtrip.json');
assert.ok(fs.existsSync(output),'Run native JVM tests first');
const actual=farm.readBackup(JSON.parse(fs.readFileSync(output,'utf8'))), expected=migrationFixture().expected;
for(const key of ['records','fieldPlots','farmRecords']) {
  assert.equal(actual[key].length,expected[key].length);
  actual[key].forEach((row,i)=>{
    assert.ok(Date.parse(row.updatedAt)>Date.parse(expected[key][i].updatedAt),`${key}: importing must advance the sync timestamp`);
    row.updatedAt=expected[key][i].updatedAt;
  });
}
assert.deepEqual(actual,expected);
console.log('PASS: web → Kotlin native import/export → web; 2 plots, 2 use records, all 6 farm types, 2 recipes and supported metadata preserved. Synthetic data only.');
