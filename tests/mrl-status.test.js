const assert = require("node:assert/strict");
const MRL = require("../mrl-status.js");

assert.equal(MRL.REVIEWED.length, 17, "App 僅可載入17筆人工已確認白名單");
assert.equal(MRL.SOURCE.amendedOn, "2026-04-21");

const pea = MRL.resolve("豌豆", "脫克松");
assert.ok(pea, "豌豆×脫克松應顯示登記但不得檢出提醒");
assert.equal(pea.status, "scope-needs-review", "未選採收部位不可一概判定");
assert.match(pea.evidence, /Tolclofos-methyl/);

assert.ok(MRL.resolve("  豌豆 ", "脫 克 松"), "只允許空白正規化");
assert.equal(MRL.lookup("瓜果類", "脫克松"), null, "候選但未進白名單者不得顯示");
assert.equal(MRL.lookup("甜豆", "脫克松"), null, "別名不得自動擴張");
assert.equal(MRL.lookup("豌豆", "不存在藥劑"), null, "查無資料不得推論不得檢出");

for (const row of MRL.REVIEWED) {
  assert.ok(row.crop && row.agent && row.evidence, "白名單每筆都要保留精確組合與人工依據");
  assert.ok(MRL.resolve(row.crop, row.agent));
}

assert.equal(MRL.SOURCE.sourceCheckedOn,"2026-09-11");
assert.equal(MRL.REVIEWED.filter(r=>MRL.resolve(r.crop,r.agent).status==="reviewed-no-detect").length,14);
for(const agent of ["脫克松"]){
  for(const form of ["鮮豆莢","乾豆"]){
    assert.equal(MRL.resolve("豌豆",agent,{form}).status,"reviewed-no-detect");
  }
  for(const form of ["","葉用豌豆","豌豆芽","未知","__proto__"]){
    assert.equal(MRL.resolve("豌豆",agent,{form}).status,"scope-needs-review");
  }
}
for(const form of ["","鮮豆莢","乾豆","葉用豌豆"]){
  assert.equal(MRL.resolve("豌豆","培丹",{form}).status,"scope-needs-review","現有培丹用法限葉用，不可因切換部位而製造紅色結論");
}
assert.match(MRL.resolve("豌豆","培丹",{form:"葉用豌豆"}).evidence,/小葉菜類 2.0 ppm/);
assert.equal(MRL.resolve("蔥科根菜類","免扶克").status,"scope-needs-review");
assert.match(MRL.resolve("蔥科根菜類","免扶克").evidence,/小葉菜類 1.0 ppm/);
assert.equal(MRL.resolve("蒜","免扶克",{registrationCrop:"蔥科根菜類",form:"蒜頭"}).status,"scope-needs-review");
assert.equal(MRL.resolve("甜豆","脫克松",{registrationCrop:"豌豆",form:"鮮豆莢"}).status,"scope-needs-review","不得由登記來源自動擴張成確認");
assert.equal(MRL.resolve("胡瓜","嘉賜銅",{registrationCrop:"瓜菜類"}).crop,"胡瓜","精確作物優先於登記群組");
assert.equal(MRL.resolve("南瓜","嘉賜銅",{registrationCrop:"瓜菜類"}).status,"scope-needs-review");
assert.equal(MRL.resolve("南瓜","嘉賜銅"),null,"不得猜测群組");
assert.equal(MRL.resolve("","培丹",{registrationCrop:"豌豆"}),null);
assert.equal(MRL.resolve("__proto__","constructor"),null);
const copy=MRL.resolve("小麥","納乃得");copy.evidence="改寫";
assert.notEqual(MRL.resolve("小麥","納乃得").evidence,"改寫");
assert.ok(Object.isFrozen(MRL.REVIEWED)&&Object.isFrozen(MRL.REVIEWED[0])&&Object.isFrozen(MRL.SOURCE));
for(const [crop,agent] of [["豌豆","培丹"],["豌豆","脫克松"],["蔥科根菜類","免扶克"]]){
  assert.equal(MRL.lookup(crop,agent),null,"舊 HTML 把 lookup 結果當布林，待確認必須回傳 null 以免誤標紅色");
}
assert.ok(MRL.lookup("小麥","納乃得"));

console.log("✓ 登記但不得檢出白名單與防誤判規則");
