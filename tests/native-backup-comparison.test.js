'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compareBackups } = require('../scripts/compare-native-backups.cjs');
const before = {
  product: 'searchbefore-backup', formatVersion: 1, appVersion: '1.1.3-internal', exportedAt: 'old',
  data: { schemaVersion: 1, activePlotId: 'synthetic', lastFarmOperator: 'PRIVATE_TEST_VALUE',
    fieldPlots: [{ id: 'synthetic', crop: 'synthetic-crop' }], records: [{ id: 'record', amount: 1 }],
    farmRecords: [], recipes: [], recentCrops: ['one', 'two'] }
};
const clone = () => structuredClone(before);
const after = clone(); after.appVersion = '1.1.4'; after.exportedAt = 'new';
assert.equal(compareBackups(before, after).equal, true);
after.data.records[0].amount = 2;
const changed = compareBackups(before, after);
assert.equal(changed.equal, false);
assert.deepEqual(changed.changedFields, ['records']);
assert.deepEqual(changed.counts.records, { before: 1, after: 1 });
assert.ok(!JSON.stringify(changed).includes('PRIVATE_TEST_VALUE'));
const reordered = clone(); reordered.data.recentCrops.reverse();
assert.equal(compareBackups(before, reordered).equal, false);
const reorderedKeys = clone(); reorderedKeys.data = Object.fromEntries(Object.entries(before.data).reverse());
assert.equal(compareBackups(before, reorderedKeys).equal, true);
const unknown = clone(); unknown.data.PRIVATE_TEST_KEY = 'PRIVATE_TEST_VALUE';
assert.deepEqual(compareBackups(before, unknown).changedFields, ['otherDataFields']);
const missing = clone(); delete missing.data.recipes;
assert.throws(() => compareBackups(before, missing));
const missingMetadata = clone(); delete missingMetadata.data.schemaVersion;
assert.throws(() => compareBackups(missingMetadata, missingMetadata));
assert.throws(() => compareBackups(before, { ...before, formatVersion: 2 }));
assert.throws(() => compareBackups(before, { ...before, unexpected: 'private' }));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'searchbefore-backup-comparison-'));
try {
  const a = path.join(temp, 'a.json'), b = path.join(temp, 'b.json');
  fs.writeFileSync(a, JSON.stringify(before)); fs.writeFileSync(b, JSON.stringify(after));
  const run = () => spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/compare-native-backups.cjs'), a, b], { encoding: 'utf8' });
  assert.equal(run().status, 1);
  fs.writeFileSync(b, JSON.stringify(before)); assert.equal(run().status, 0);
  fs.writeFileSync(b, 'PRIVATE_TEST_VALUE{malformed');
  const bad = run(); assert.equal(bad.status, 2);
  assert.ok(!bad.stderr.includes('PRIVATE_TEST_VALUE'));
  assert.ok(!bad.stderr.includes(temp));
  fs.writeFileSync(b, ' '.repeat(10 * 1024 * 1024 + 1)); assert.equal(run().status, 2);
} finally {
  fs.unlinkSync(path.join(temp, 'a.json')); fs.unlinkSync(path.join(temp, 'b.json')); fs.rmdirSync(temp);
}
console.log('Native backup comparison: content changes, ordering, metadata, schema and private error handling passed.');
