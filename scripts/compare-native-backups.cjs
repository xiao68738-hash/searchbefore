'use strict';
// Read-only release acceptance helper. Never prints record values, IDs, or input paths.
const fs = require('node:fs');
const { isDeepStrictEqual } = require('node:util');
const MAX_BYTES = 10 * 1024 * 1024;
const collections = ['fieldPlots', 'records', 'farmRecords', 'recipes', 'recentCrops'];
const fields = [...collections, 'schemaVersion', 'activePlotId', 'lastFarmOperator'];
const envelope = ['product', 'formatVersion', 'appVersion', 'exportedAt', 'data'];

function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.product !== 'searchbefore-backup' || value.formatVersion !== 1 ||
      Object.keys(value).some(key => !envelope.includes(key)) ||
      !value.data || typeof value.data !== 'object' || Array.isArray(value.data)) {
    throw new Error('Unsupported backup envelope');
  }
  if (collections.some(key => !Array.isArray(value.data[key]))) {
    throw new Error('Incomplete backup collections');
  }
  if (!Number.isInteger(value.data.schemaVersion) || value.data.schemaVersion < 1 ||
      value.data.schemaVersion > 100 || typeof value.data.activePlotId !== 'string' ||
      typeof value.data.lastFarmOperator !== 'string') {
    throw new Error('Incomplete backup metadata');
  }
  return value;
}

function compareBackups(before, after) {
  validate(before); validate(after);
  const changedFields = fields.filter(key => !isDeepStrictEqual(before.data[key], after.data[key]));
  const unknownBefore = Object.fromEntries(Object.entries(before.data).filter(([key]) => !fields.includes(key)));
  const unknownAfter = Object.fromEntries(Object.entries(after.data).filter(([key]) => !fields.includes(key)));
  if (!isDeepStrictEqual(unknownBefore, unknownAfter)) changedFields.push('otherDataFields');
  return {
    equal: isDeepStrictEqual(before.data, after.data),
    changedFields,
    counts: Object.fromEntries(collections.map(key => [key, {
      before: before.data[key].length, after: after.data[key].length
    }])),
    scope: 'Full data payload only; export time/app version ignored. Does not prove login, server sync, display preferences or Play installation.'
  };
}

function readBackup(file) {
  if (fs.statSync(file).size > MAX_BYTES) throw new Error('Backup exceeds size limit');
  return validate(JSON.parse(fs.readFileSync(file, 'utf8')));
}

if (require.main === module) {
  try {
    if (process.argv.length !== 4) throw new Error('Two files required');
    const result = compareBackups(readBackup(process.argv[2]), readBackup(process.argv[3]));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.equal ? 0 : 1;
  } catch {
    // Node's parse/fs errors can contain private values/paths. Do not print them.
    console.error('Backup comparison failed: provide two readable, supported JSON backups (max 10 MiB each). No private content was logged.');
    process.exitCode = 2;
  }
}
module.exports = { compareBackups, readBackup };
