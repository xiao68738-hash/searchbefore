const assert = require("node:assert/strict");
const farm = require("../farm-records.js");

const cultivation = farm.createRecord({
  plotId: "plot-1",
  type: "cultivation",
  date: "2026-07-14",
  operator: "測試者",
  details: { activity: "灌溉", method: "滴灌 30 分鐘" }
}, () => "farm-1");
assert.equal(cultivation.id, "farm-1");
assert.equal(cultivation.details.activity, "灌溉");
assert.equal(farm.summary(cultivation), "灌溉 · 滴灌 30 分鐘");

const fertilizer = farm.createRecord({
  plotId: "plot-1",
  type: "fertilizer",
  date: "2026-07-15",
  notes: "雨後施用",
  details: { materialName: "有機質肥料", quantity: "20", unit: "kg", method: "撒施", lotNo: "A123" }
}, () => "farm-2");
assert.equal(fertilizer.details.quantity, "20");
assert.match(farm.summary(fertilizer), /有機質肥料/);

const harvest = farm.createRecord({
  plotId: "plot-1",
  type: "harvest",
  date: "2026-07-20",
  details: { quantity: "30", unit: "kg", batchNo: "H001" },
  safetyCheck: { status: "safe", safeDate: "2026-07-18", daysRemaining: 0, recordCount: 2, checkedAt: "2026-07-20T00:00:00.000Z" }
}, () => "farm-3");
assert.equal(harvest.safetyCheck.status, "safe");
assert.equal(harvest.safetyCheck.recordCount, 2);

assert.throws(() => farm.createRecord({
  plotId: "plot-1",
  type: "harvest",
  date: "2026-02-30",
  details: { quantity: "3", unit: "kg" }
}), /日期格式不正確/);

assert.throws(() => farm.createRecord({
  plotId: "plot-1",
  type: "materialPurchase",
  date: "2026-07-14",
  details: { category: "肥料", materialName: "測試肥", quantity: "1", unit: "包" }
}), /供應商/);

const csv = farm.exportCsv([fertilizer, cultivation], id => id === "plot-1" ? "番茄 / A區" : "");
assert.ok(csv.startsWith("\uFEFF"));
assert.match(csv, /番茄 \/ A區/);
assert.match(csv, /施肥/);
assert.ok(csv.indexOf("2026-07-14") < csv.indexOf("2026-07-15"));

const pesticide = { id: "rec-1", plotId: "plot-1", crop: "番茄", pest: "疫病", agent: "測試藥", date: "2026-07-16", phi: 3, dil: "1000" };
const timeline = farm.buildTimeline([pesticide], [cultivation, fertilizer, harvest], "plot-1");
assert.equal(timeline.length, 4);
assert.equal(timeline[0].id, "farm-3");
assert.equal(timeline.find(event => event.id === "rec-1").kind, "pesticide");
const coverage = farm.recordCoverage([pesticide], [cultivation, fertilizer, harvest], "plot-1");
assert.equal(coverage.counts.pesticide, 1);
assert.equal(coverage.counts.harvest, 1);
assert.equal(coverage.total, 4);
const combined = farm.exportCombinedCsv([pesticide], [cultivation, fertilizer, harvest], {
  plotName: () => "番茄 / A區",
  safeDate: () => "2026-07-20"
});
assert.match(combined, /事件類型/);
assert.match(combined, /用藥/);
assert.match(combined, /H001/);
assert.match(combined, /safe \/ 2026-07-18/);

const backup = farm.buildBackup({ records: [], farmRecords: [fertilizer], fieldPlots: [] }, "1.4.0");
assert.equal(backup.product, "searchbefore-backup");
assert.equal(farm.readBackup(backup).farmRecords.length, 1);
assert.throws(() => farm.readBackup({ product: "other", formatVersion: 1, data: {} }), /不是噴前查/);
assert.throws(() => farm.readBackup({ product: "searchbefore-backup", formatVersion: 1, data: { records: {} } }), /records/);

console.log("✓ 田間作業紀錄建立、驗證與摘要正確");
console.log("✓ CSV 匯出與完整備份格式正確");
console.log("✓ 用藥與農務紀錄可建立整合時間軸、概況與 CSV");
