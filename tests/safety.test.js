const assert = require("node:assert/strict");
const safety = require("../safety.js");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("粉劑不得顯示瓶蓋或湯匙換算", () => {
  assert.equal(safety.formKind("WP"), "粉");
  assert.equal(safety.shouldShowVolumeApprox("g"), false);
});

test("液劑可以顯示 ml 容量換算", () => {
  assert.equal(safety.formKind("SC"), "液");
  assert.equal(safety.shouldShowVolumeApprox("ml"), true);
});

test("設施栽培採收期採備註中的較長天數", () => {
  const result = safety.effectivePhi({ phi: 9, note: "設施栽培15天停止施藥。" });
  assert.equal(result.phi, 15);
  assert.equal(result.adjusted, true);
});

test("多種作物用途並列時採最長天數", () => {
  const result = safety.effectivePhi({
    phi: 12,
    note: "包葉菜類採收前18天（設施栽培24天）；小葉菜類採收前12天（設施栽培18天）停止施藥。"
  });
  assert.equal(result.phi, 24);
});

test("原欄位缺值時可從採收備註補出保守天數", () => {
  const result = safety.effectivePhi({ phi: null, note: "採收前9天(設施栽培15天)停止用藥。" });
  assert.equal(result.phi, 15);
});

test("輪作天數不會誤當安全採收期", () => {
  assert.equal(safety.phiFromNote("與非核准作物輪作期間為30天，以免蓄積殘留。"), null);
});

test("採收日採施藥日不計、隔日起算的保守規則", () => {
  const date = safety.safeHarvestDate("2026-07-01", 3);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 6);
  assert.equal(date.getDate(), 5);
});

test("同一田區的多次施藥取最晚可採日", () => {
  const groups = safety.aggregateHarvest([
    { crop: "草莓", plotId: "A", date: "2026-07-01", phi: 3, agent: "甲" },
    { crop: "草莓", plotId: "A", date: "2026-07-02", phi: 7, agent: "乙" }
  ]);
  assert.equal(groups["plot:A"].ok.getDate(), 10);
  assert.equal(groups["plot:A"].controlling.agent, "乙");
});

test("不同田區分開計算", () => {
  const groups = safety.aggregateHarvest([
    { crop: "草莓", plotId: "A", date: "2026-07-01", phi: 3 },
    { crop: "草莓", plotId: "B", date: "2026-07-01", phi: 7 }
  ]);
  assert.equal(Object.keys(groups).length, 2);
});

test("任一施藥紀錄缺少採收期時整批不得顯示可採", () => {
  const groups = safety.aggregateHarvest([
    { crop: "草莓", plotId: "A", date: "2026-07-01", phi: 3 },
    { crop: "草莓", plotId: "A", date: "2026-07-02", phi: null }
  ]);
  assert.equal(groups["plot:A"].unknown, true);
  assert.equal(groups["plot:A"].ok, null);
});

test("未校驗群組前只查作物直接登記", () => {
  assert.deepEqual(safety.directCropLevels("苦瓜", { 苦瓜: {}, 瓜菜類: {} }), ["苦瓜"]);
});

let failed = 0;
for (const item of tests) {
  try {
    item.fn();
    console.log("✓", item.name);
  } catch (error) {
    failed += 1;
    console.error("✗", item.name);
    console.error(error.stack || error);
  }
}
if (failed) process.exit(1);
console.log(`\n${tests.length} 項安全測試全部通過`);
