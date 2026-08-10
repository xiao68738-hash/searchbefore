const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const O = require("../form-ocr.js");

function fixture(name) {
  const file = path.join(__dirname, "fixtures", "ocr", name + ".json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const checklist = fixture("checklist-double-page-noisy");
const checklistDraft = O.createDraft(checklist.scanResult, {}, checklist.sourceImage);
assert.equal(checklistDraft.routeDecision.status, "exact");
assert.equal(checklistDraft.routeDecision.type, "selfInspection");
assert.equal(checklistDraft.route.route, "reference-only");
assert.ok(checklistDraft.selfInspection, "查核表應建立備查草稿");
assert.equal(checklistDraft.materialInventory, null, "查核問題提到肥料入出庫時不得啟動表10解析器");
assert.deepEqual(checklistDraft.recordGroups, [], "查核表不得建立設備或田間作業列");
assert.equal(checklistDraft.autoCommitAllowed, false);
assert.equal(checklistDraft.l3UploadReady, false);

const ledger = fixture("material-ledger-multi-panel");
const ledgerDraft = O.createDraft(ledger.scanResult, {}, ledger.sourceImage);
assert.equal(ledgerDraft.routeDecision.status, "exact");
assert.equal(ledgerDraft.routeDecision.type, "purchase");
assert.equal(ledgerDraft.route.route, "material-ledger");
assert.ok(ledgerDraft.materialInventory, "表10應建立資材庫存草稿");
assert.equal(ledgerDraft.materialInventory.panels.length, 3, "兩個已填小表與一個空白小表應保持分離");
assert.equal(ledgerDraft.materialInventory.materialMasters.length, 2, "空白小表不得產生資材主檔");
assert.deepEqual(
  ledgerDraft.materialInventory.materialMasters.map(item => item.details.materialName.candidates[0].value),
  ["苦土石灰", "硫酸鉀"],
  "左右小表的資材名稱不得互串"
);
assert.equal(ledgerDraft.materialInventory.inventoryTransactions.length, 4, "每個已填小表的兩列應各自成為待核對明細");
assert.deepEqual(
  ledgerDraft.materialInventory.inventoryTransactions.map(item => item.source.rowCandidateId),
  ["ledger-entry-top-1", "ledger-entry-top-2", "ledger-entry-top-1", "ledger-entry-top-2"]
);
const explicitZero = ledgerDraft.materialInventory.inventoryTransactions
  .find(item => item.panelId === "inventory-panel-1" && item.source.rowCandidateId === "ledger-entry-top-2")
  .details.remainingAmount.candidates[0];
assert.equal(explicitZero.value, 0, "只有照片中明確辨識到的 0 才能成為候選");
const leftFirst = ledgerDraft.materialInventory.inventoryTransactions
  .find(item => item.panelId === "inventory-panel-1" && item.source.rowCandidateId === "ledger-entry-top-1");
assert.equal(leftFirst.details.usedAmount.candidates.length, 0, "空白使用量必須維持空白，不得補成 0");
assert.ok(ledgerDraft.materialInventory.inventoryTransactions.every(item => item.autoCommitAllowed === false && item.l3UploadReady === false));

const equipment = fixture("equipment-double-page-noisy");
const equipmentDraft = O.createDraft(equipment.scanResult, {}, equipment.sourceImage);
assert.equal(equipmentDraft.routeDecision.status, "exact");
assert.equal(equipmentDraft.routeDecision.type, "equipmentMaintenance");
assert.equal(equipmentDraft.route.route, "supporting-record");
assert.equal(equipmentDraft.recordGroups.length, 2, "相鄰頁面的採後處理內容不得形成第三筆設備紀錄");
assert.deepEqual(equipmentDraft.recordGroups.map(item => item.date[0].value), ["2026-02-23", "2026-03-10"]);
assert.deepEqual(
  equipmentDraft.recordGroups[0].equipment.filter(item => item.selected).map(item => item.value),
  ["噴霧機", "割草機"]
);
assert.deepEqual(
  equipmentDraft.recordGroups[1].equipment.filter(item => item.selected).map(item => item.value),
  ["中耕機"]
);
assert.ok(equipmentDraft.recordGroups.every(item => !item.sourceBlockIds.includes("harvest-adjacent-page")), "表18不得引用相鄰頁面證據");
assert.ok(equipmentDraft.activities.every(item => item.autoCommitAllowed === false && item.l3UploadReady === false));

console.log("表單 OCR 匿名真實情境：查核表、表10與表18 golden fixtures 通過");
