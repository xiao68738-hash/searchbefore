/* Read an existing official snapshot, audit preservation, write a NEW report only.
   No source fetch, DATA rebuild, product write or publication. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import safety from '../safety.js';
import { isActive, keyOf, makeEntry, text } from './data-rules.mjs';
const [sourceDir, output] = process.argv.slice(2);
if (!sourceDir || !output || process.argv.length !== 4) throw Error('Usage: audit-usage-notes.mjs SNAPSHOT_DIR NEW_REPORT.json');
const read = name => fs.readFileSync(path.join(sourceDir, name));
const permitBytes = read('permits.json'), detailBytes = read('details.json');
const permits = JSON.parse(permitBytes), details = JSON.parse(detailBytes);
const meaningful = v => text(v) && !/^[-－—–]+$/.test(text(v));
const oldNote = d => text(d['注意事項']) && text(d['注意事項']) !== '-' ? text(d['注意事項']) : text(d['備註']);
const result = { snapshotDir: path.resolve(sourceDir), generatedAt: new Date().toISOString(),
  sourceSha256: Object.fromEntries([['permits.json', permitBytes], ['details.json', detailBytes]].map(([k,v]) => [k,crypto.createHash('sha256').update(v).digest('hex')])),
  rows: 0, withMethod: 0, dualNotes: 0, changedNotes: 0, missingSourceFields: 0,
  noMultipleRowsRecovered: 0, noMultipleUniqueCombinationsRecovered: 0, examples: [],
  effectivePhiChanges: 0, effectivePhiReview: [],
  productionDataChanged: false, publicationApproved: false };
const recovered = new Set();
for (const p of permits) {
  if (!isActive(p) || !text(p['中文名稱'])) continue;
  for (const d of details[keyOf(p)] || []) {
    if (!text(d['作物名稱']) || !text(d['病蟲害名稱'])) continue;
    const e = makeEntry(p,d), before = oldNote(d);
    result.rows++;
    if (meaningful(d['施藥方法'])) result.withMethod++;
    if (meaningful(d['注意事項']) && meaningful(d['備註'])) result.dualNotes++;
    if (e.note !== before) result.changedNotes++;
    const oldPhi = safety.effectivePhi({...e,note:before}).phi;
    const newPhi = safety.effectivePhi(e).phi;
    if (oldPhi !== newPhi) {
      result.effectivePhiChanges++;
      const change = {crop:text(d['作物名稱']),pest:text(d['病蟲害名稱']),name:e.name,oldPhi,newPhi,before,after:e.note};
      if (!result.effectivePhiReview.some(r => JSON.stringify(r) === JSON.stringify(change))) result.effectivePhiReview.push(change);
    }
    for (const field of ['注意事項','備註','施藥方法']) {
      if (meaningful(d[field]) && !e.note.includes(text(d[field]))) result.missingSourceFields++;
    }
    assert.equal(e.dilution, text(d['稀釋倍數']));
    assert.equal(e.dose, text(d['每公頃使用用藥量']));
    assert.equal(e.times, text(d['施用次數']));
    if (!meaningful(d['稀釋倍數']) && meaningful(d['施藥方法']) && !before.includes(text(d['施藥方法']))) {
      result.noMultipleRowsRecovered++;
      const key = [d['作物名稱'], d['病蟲害名稱'], e.name, text(d['施藥方法']), before];
      recovered.add(JSON.stringify(key));
      if (result.examples.length < 8) result.examples.push({crop:key[0], pest:key[1], name:e.name, before, after:e.note});
    }
  }
}
result.noMultipleUniqueCombinationsRecovered = recovered.size;
result.requiresPhiReview = result.effectivePhiChanges > 0;
assert.ok(result.rows > 0, 'Empty snapshot cannot pass');
assert.equal(result.missingSourceFields, 0, 'A source method/caution/note was lost');
fs.writeFileSync(output, JSON.stringify(result,null,2)+'\n', {flag:'wx'});
console.log(JSON.stringify({...result, examples:undefined},null,2));
if (result.requiresPhiReview) process.exitCode = 2;
