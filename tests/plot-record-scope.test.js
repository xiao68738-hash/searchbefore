const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const farm = require('../farm-records.js');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function source(name) {
  const start = html.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' exists');
  return html.slice(start, html.indexOf('\nfunction ', start + 1));
}
const plot = { id: 'new-plot', crop: '豌豆', plantDate: '2026-09-08' };
const records = [
  { id: 'unassigned', crop: '豌豆', date: '2026-08-30', agent: '舊測試', phi: 3 },
  { id: 'other-plot', plotId: 'old-plot', crop: '豌豆', date: '2026-08-30' },
  { id: 'other-crop', crop: '番茄', date: '2026-09-08' },
  { id: 'wrong-crop', plotId: plot.id, crop: '番茄', date: '2026-09-08' }
];
const ctx = vm.createContext({ records, plotMatchesRecordCrop: (p, c) => p.crop === c });
vm.runInContext(source('recordMatchesPlot') + source('recordsForPlot'), ctx);
assert.equal(ctx.recordsForPlot(plot).length, 0, '新田區不得計入未指定田區或其他田區的同作物紀錄');
records.push({ id: 'assigned', plotId: plot.id, crop: '豌豆', date: '2026-09-08', agent: '本田區', phi: 3 });
assert.deepEqual(Array.from(ctx.recordsForPlot(plot), r => r.id), ['assigned']);
assert.equal(farm.recordCoverage(ctx.recordsForPlot(plot), [], plot.id).counts.pesticide, 1);
assert.equal(farm.buildTimeline(ctx.recordsForPlot(plot), [], plot.id).length, 1);
assert.equal(ctx.recordMatchesPlot(null, plot), false);
assert.equal(ctx.recordMatchesPlot(records[0], null), false);

vm.runInContext(source('unassignedRecordsForPlot') + source('unassignedPlotNotice'), ctx);
assert.deepEqual(Array.from(ctx.unassignedRecordsForPlot(plot), r => r.id), ['unassigned']);
assert.match(ctx.unassignedPlotNotice(plot), /另有 1 筆同作物用藥尚未指定田區/);
assert.match(ctx.unassignedPlotNotice(plot), /不列入本田區/);
assert.match(ctx.unassignedPlotNotice(plot), /不代表已確認可採收/);
assert.equal(ctx.unassignedPlotNotice({id:'x',crop:'蘭花'}), '');
assert.equal(records[0].plotId, undefined, '不可自动指派或改寫舊紀錄');
assert.equal(records.length, 5, '所有紀錄仍保留供全部歷史及備份使用');

// Render the real detail/card functions with minimal DOM and safe fixture helpers.
const nodes = { plotDetailBody: {}, plotRecordBox: {} };
Object.assign(ctx, {
  document: { getElementById: id => nodes[id], addEventListener() {} },
  plotDetailId: plot.id, activePlotId: '', fieldPlots: [plot], farmRecords: [],
  plotById: id => id === plot.id ? plot : null,
  PQC_FARM: farm, esc: s => String(s ?? '').replaceAll('<', '&lt;'),
  plotDisplayName: p => p.crop, plotMetaLabel: p => p.plantDate, plotPlantLabel: p => p.plantDate,
  riskGaugeSvg: () => '', resistanceRisk: list => ({ label:'資料不足', text: list.length + ' 次施藥' }),
  timelineRecordHtml: event => '<span>' + event.source.agent + '</span>',
  ensureRecordPlotCompatibility: () => {}, daysLeft: () => 0,
  plotCropLinkState: () => ({label:'登記作物',custom:false}),
  refreshExportPlotOptions: () => {}, renderFarmRecordBox: () => {}
});
vm.runInContext(source('renderPlotDetail') + source('renderPlotRecordBox'), ctx);
ctx.renderPlotDetail();
ctx.renderPlotRecordBox();
assert.match(nodes.plotDetailBody.innerHTML, /1 次施藥/);
assert.match(nodes.plotDetailBody.innerHTML, /本田區<\/span>/);
assert.match(nodes.plotRecordBox.innerHTML, /1 筆用藥/);
for (const node of Object.values(nodes)) {
  assert.match(node.innerHTML, /另有 1 筆同作物用藥尚未指定田區/);
}
assert.match(source('exportRecordsAs'), /recordMatchesPlot/);
assert.match(source('currentHarvestSafety'), /PQC_SAFETY.harvestStatus\(records,plotId,date\)/,
  '不因計數修正變更安全採收引擎的輸入');
console.log('plot-record-scope: assignment, notices, rendering, exports and preservation passed');

// Optional offline visual fixture: only synthetic data, no app scripts or cloud.
const previewArg = process.argv.indexOf('--preview');
if (previewArg >= 0) {
  const target = process.argv[previewArg + 1];
  assert.ok(target, '--preview requires an output file');
  ctx.records = records.filter(r => r.id !== 'assigned');
  ctx.renderPlotDetail();
  ctx.renderPlotRecordBox();
  const style = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i)[1];
  const staticHtml = (nodes.plotRecordBox.innerHTML + nodes.plotDetailBody.innerHTML)
    .replace(/\son[a-z]+="[^"]*"/g, '').replace(/<button\b/g, '<button disabled');
  fs.writeFileSync(target, '<!doctype html><html lang="zh-Hant"><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">'
    + '<title>田區修正驗證：假資料</title><style>' + style + '</style>'
    + '<main style="max-width:760px;margin:auto;padding:16px"><h1>田區修正驗證：假資料</h1>'
    + '<p>新田區沒有施藥；另有一筆舊同作物紀錄未指定田區。此頁不連線、不儲存資料，按鈕停用。</p>'
    + staticHtml + '</main></html>');
}
