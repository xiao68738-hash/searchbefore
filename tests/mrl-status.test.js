const assert = require("node:assert/strict");
const MRL = require("../mrl-status.js");

assert.equal(MRL.REVIEWED.length, 17, "App 僅可載入17筆人工已確認白名單");
assert.equal(MRL.SOURCE.amendedOn, "2026-04-21");

const pea = MRL.lookup("豌豆", "脫克松");
assert.ok(pea, "豌豆×脫克松應顯示登記但不得檢出提醒");
assert.equal(pea.status, "reviewed-no-detect");
assert.match(pea.evidence, /Tolclofos-methyl/);

assert.ok(MRL.lookup("  豌豆 ", "脫 克 松"), "只允許空白正規化");
assert.equal(MRL.lookup("瓜果類", "脫克松"), null, "候選但未進白名單者不得顯示");
assert.equal(MRL.lookup("甜豆", "脫克松"), null, "別名不得自動擴張");
assert.equal(MRL.lookup("豌豆", "不存在藥劑"), null, "查無資料不得推論不得檢出");

for (const row of MRL.REVIEWED) {
  assert.ok(row.crop && row.agent && row.evidence, "白名單每筆都要保留精確組合與人工依據");
  assert.ok(MRL.lookup(row.crop, row.agent));
}

console.log("✓ 登記但不得檢出白名單與防誤判規則");
