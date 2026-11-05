const assert = require("node:assert/strict");
const O = require("../form-ocr.js");
const fixture = require("./fixtures/ocr/material-ledger-multi-panel.json");

// Synthetic parser regressions, NOT a handwriting recognition benchmark.
const valid = [
  ["1,000 公克", 1000], ["12,345.67 kg", 12345.67],
  ["１０００ 公克", 1000], ["１，０００ 公克", 1000],
  [".5L", 0.5], ["0.5公升", 0.5], ["0 公克", 0], ["15包", 15]
];
for (const [text, value] of valid) {
  const candidates = O.findAmounts(text);
  assert.equal(candidates.length, 1, text);
  assert.equal(candidates[0].value, value, text);
}
const invalid = [
  ",5kg", "數量 ,5kg",
  "-5kg", "− 5kg", "+5kg", "1.2.3kg", "1,00 公克", "1,,000kg",
  "1e3kg", "5-10kg", "5 ～ 10kg", "5至10kg", "1/2kg", "1 / 2 kg",
  "5kg 至 10kg", "9007199254740992kg", "5kgm", "5%", "1 000公克", "", "公克"
];
for (const text of invalid) assert.deepEqual(O.findAmounts(text), [], text);
assert.deepEqual(O.findAmounts("500ml 200ml").map(x => x.value), [500, 200]);
assert.deepEqual(O.findAmounts("5 公斤，10 公斤").map(x => x.value), [5, 10]);
for (const unit of ["毫升", "公升", "公克", "公斤", "台斤", "c.c.", "c.c", "cc", "ml", "mL", "L", "g", "kg", "包", "袋"]) {
  const candidates = O.findAmounts("1,000 " + unit);
  assert.equal(candidates.length, 1, unit);
  assert.equal(candidates[0].value, 1000, unit);
  assert.equal(candidates[0].unit, unit);
}

for (const text of ["2/31", "4/31", "6/31", "7/140", "7/14/115", "115/7/14", "0/14", "13/14"]) {
  assert.deepEqual(O.findPartialDates(text), [], text);
}
for (const [text, expected] of [["7/14", "07/14"], ["7/l4", "07/14"], ["2/29", "02/29"]]) {
  const item = O.findPartialDates(text)[0];
  assert.equal(item.value, expected);
  assert.equal(item.requiresYearConfirmation, true);
}
const dated = O.findPartialDates("日期：7/14")[0];
assert.equal(dated.sourceText, "7/14");
assert.equal(dated.sourceIndex, 3);

function ledgerAmount(text) {
  const sample = JSON.parse(JSON.stringify(fixture));
  const row = sample.scanResult.rowCandidates.find(x => x.id === "ledger-entry-top-1");
  row.cellCandidates.find(x => x.id === "le1-l-purchase").text = text;
  const draft = O.createDraft(sample.scanResult, {}, sample.sourceImage);
  assert.equal(draft.autoCommitAllowed, false);
  assert.equal(draft.l3UploadReady, false);
  const transaction = draft.materialInventory.inventoryTransactions.find(x =>
    x.panelId === "inventory-panel-1" && x.source.rowCandidateId === "ledger-entry-top-1");
  assert.equal(transaction.details.purchaseAmount.value, null);
  return transaction.details.purchaseAmount.candidates;
}
for (const [text, value] of [["1,000", 1000], ["1,000公克", 1000], [".5", 0.5], ["0", 0]]) {
  const candidates = ledgerAmount(text);
  assert.equal(candidates.length, 1, text);
  assert.equal(candidates[0].value, value, text);
  assert.ok(candidates[0].confidence <= 0.82, "不得提升 OCR 原始信心");
}
for (const text of ["-5", "1,00", "1.2.3", "5-10", "7/14", "1 000", ""]) {
  assert.deepEqual(ledgerAmount(text), [], text);
}
console.log("OCR 數量／日期邊界回歸通過（合成案例，非手寫準確率）");
