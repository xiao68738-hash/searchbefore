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
  details: { materialName: "有機質肥料", dressing: "基肥", quantity: "20", unit: "kg", method: "撒施", lotNo: "A123" }
}, () => "farm-2");
assert.equal(fertilizer.details.quantity, "20");
assert.equal(fertilizer.details.dressing, "基肥");
assert.match(farm.summary(fertilizer), /有機質肥料/);
assert.match(farm.summary(fertilizer), /基肥/);

const harvest = farm.createRecord({
  plotId: "plot-1",
  type: "harvest",
  date: "2026-07-20",
  details: { quantity: "30", unit: "kg", batchNo: "H001" },
  safetyCheck: { status: "safe", safeDate: "2026-07-18", daysRemaining: 0, recordCount: 2, checkedAt: "2026-07-20T00:00:00.000Z" }
}, () => "farm-3");
assert.equal(harvest.safetyCheck.status, "safe");
assert.equal(harvest.safetyCheck.recordCount, 2);

const equipmentRecords = [
  farm.createRecord({
    plotId: "",
    type: "equipmentMaintenance",
    date: "2026-02-23",
    operator: "施坤寶",
    details: { equipment: ["噴霧機", "割草機"], actions: ["清潔", "保養"] }
  }, () => "farm-equipment-1"),
  farm.createRecord({
    plotId: "plot-1",
    type: "equipmentMaintenance",
    date: "2026-03-10",
    details: { equipment: ["中耕機"], otherEquipment: "自走式搬運機", actions: ["維修"] }
  }, () => "farm-equipment-2")
];
assert.equal(equipmentRecords[0].plotId, "", "共用設備管理紀錄不應強制綁定田區");
assert.deepEqual(equipmentRecords[0].details.equipment, ["噴霧機", "割草機"]);
assert.match(farm.summary(equipmentRecords[0]), /清潔、保養/);
assert.deepEqual(equipmentRecords[1].details.equipment, ["中耕機", "自走式搬運機"]);
assert.throws(() => farm.createRecord({
  type: "equipmentMaintenance",
  date: "2026-03-10",
  details: { equipment: [], actions: ["清潔"] }
}), /至少選擇一項器具/);

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

const csv = farm.exportCsv([fertilizer, cultivation].concat(equipmentRecords), id => id === "plot-1" ? "番茄 / A區" : "全場共用設備");
assert.ok(csv.startsWith("\uFEFF"));
assert.match(csv, /番茄 \/ A區/);
assert.match(csv, /施肥/);
assert.match(csv, /器具／機械／設備管理/);
assert.ok(csv.indexOf("2026-07-14") < csv.indexOf("2026-07-15"));

const pesticide = { id: "rec-1", plotId: "plot-1", crop: "番茄", pest: "疫病", agent: "測試藥", date: "2026-07-16", phi: 3, dil: "1000", operator: "王小明" };
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
assert.match(combined, /基肥/);
assert.match(combined, /王小明/);

const backup = farm.buildBackup({ records: [], farmRecords: [fertilizer].concat(equipmentRecords), fieldPlots: [] }, "1.4.0");
assert.equal(backup.product, "searchbefore-backup");
assert.equal(farm.readBackup(backup).farmRecords.length, 3);
assert.deepEqual(farm.readBackup(backup).farmRecords[1].details.actions, ["清潔", "保養"]);
assert.throws(() => farm.readBackup({ product: "other", formatVersion: 1, data: {} }), /不是噴前查/);
assert.throws(() => farm.readBackup({ product: "searchbefore-backup", formatVersion: 1, data: { records: {} } }), /records/);

const safeBackupSource = {
  product: "searchbefore-backup",
  formatVersion: 1,
  data: {
    schemaVersion: 4,
    records: [{
      id: "rec-safe_1",
      crop: "番茄",
      agent: "測試藥劑",
      date: "2026-08-03",
      phi: 3,
      plotId: "plot-safe_1",
      operator: "王小明",
      ignoredField: "不應被還原"
    }],
    fieldPlots: [{ id: "plot-safe_1", name: "番茄", crop: "番茄", cropSource: "registered", plantDate: "2026-07-01", createdAt: "2026-07-01" }],
    farmRecords: [],
    recipes: [],
    recentCrops: ["番茄"],
    activePlotId: "plot-safe_1",
    lastFarmOperator: "王小明"
  }
};
const safeBackup = farm.readBackup(safeBackupSource);
assert.equal(safeBackup.records[0].id, "rec-safe_1");
assert.equal(safeBackup.records[0].ignoredField, undefined, "只應保留已知欄位");
assert.notEqual(safeBackup.records[0], safeBackupSource.data.records[0], "還原結果應建立乾淨副本");

assert.throws(() => farm.readBackup({
  product: "searchbefore-backup",
  formatVersion: 1,
  data: {
    records: [{ id: "x');globalThis.pwned=true;//", crop: "番茄", agent: "測試", date: "2026-08-03" }]
  }
}), /不安全的編號/);

assert.throws(() => farm.readBackup({
  product: "searchbefore-backup",
  formatVersion: 1,
  data: { recentCrops: new Array(farm.BACKUP_LIMITS.recentCrops + 1).fill("番茄") }
}), /筆數過多/);

assert.throws(() => farm.readBackup({
  product: "searchbefore-backup",
  formatVersion: 1,
  data: { fieldPlots: [], activePlotId: "plot-missing" }
}), /預設田區不存在/);

const indexSource = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "index.html"), "utf8");
assert.doesNotMatch(indexSource, /pickCrop\('\$\{esc\(c\)\}'\)/, "最近作物不可直接插入 inline JavaScript");
assert.doesNotMatch(indexSource, /setRecipeBrand\(\$\{i\},'\$\{esc\(b\)\}'\)/, "商品名稱不可直接插入 inline JavaScript");

console.log("✓ 田間作業紀錄建立、驗證與摘要正確");
console.log("✓ CSV 匯出與完整備份格式正確");
console.log("✓ 用藥與農務紀錄可建立整合時間軸、概況與 CSV");
