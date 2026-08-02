const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const MAP = require("../tap-activity-mapping.js");

const root = path.join(__dirname, "..");
const farmer = { uid: "farmer-001", role: "farmer" };
const otherFarmer = { uid: "farmer-002", role: "farmer" };
const reviewer = { uid: "reviewer-001", role: "reviewer" };
let tick = 0;
function now() {
  tick += 1;
  return new Date(Date.UTC(2026, 7, 2, 0, 0, tick)).toISOString();
}

function official(code, label) {
  return { code, label, catalogVersion: "sandbox-2026-08", source: "official_api" };
}

let item = MAP.createActivityMapping({
  workspaceId: "workspace-001",
  farmerUid: farmer.uid,
  createdBy: farmer,
  sourceRef: {
    kind: "manual_note",
    id: "activity-001",
    updatedAt: "2026-08-02T00:00:00.000Z",
    imageUri: "不得保存"
  },
  sourceText: "捕捉飛入設施內的大型蝙蝠"
}, { idFactory: () => "tap-activity-001", now });

assert.equal(item.mappingState, MAP.MAPPING_STATES.UNMAPPED);
assert.equal(item.sourceText, "捕捉飛入設施內的大型蝙蝠");
assert.equal(item.officialEntry, null);
assert.equal(Object.hasOwn(item.sourceRef, "imageUri"), false, "來源參照不得夾帶影像位置");
assert.ok(Object.isFrozen(item));

assert.throws(() => MAP.suggestCandidates(item, reviewer, [{
  code: "invented-001",
  label: "自行猜測項目",
  catalogVersion: "local",
  source: "manual"
}], now), /必須來自官方 API 代碼表/);

item = MAP.suggestCandidates(item, reviewer, [
  official("ACT-OTHER", "其他作業"),
  official("ACT-OTHER", "其他作業")
], now);
assert.equal(item.mappingState, MAP.MAPPING_STATES.SUGGESTED);
assert.equal(item.candidates.length, 1, "相同版本與代碼的候選應去重");
assert.equal(item.reviewedRevision, null, "候選建議不可冒充人工確認");
assert.equal(item.officialEntry, null, "候選建議不可寫入正式對照");

assert.throws(() => MAP.confirmExact(item, farmer, {
  officialEntry: official("ACT-001", "病蟲害防治"),
  normalizedActivity: "防治動物危害"
}, now), /只有覆核人員/);

const exact = MAP.confirmExact(item, reviewer, {
  officialEntry: official("ACT-001", "病蟲害防治"),
  normalizedActivity: "防治動物危害"
}, now);
assert.equal(exact.mappingState, MAP.MAPPING_STATES.EXACT);
assert.equal(exact.officialEntry.code, "ACT-001");
assert.equal(exact.reviewedRevision, exact.revision);
assert.equal(exact.sourceText, "捕捉飛入設施內的大型蝙蝠", "正式對照不可覆蓋農民原始說法");

assert.throws(() => MAP.confirmOther(item, reviewer, {
  officialEntry: official("ACT-OTHER", "其他作業"),
  normalizedActivity: "設施內動物危害處理",
  officialNote: "捕捉飛入設施內的大型蝙蝠"
}, now), /明確確認/);

const other = MAP.confirmOther(item, reviewer, {
  officialEntry: official("ACT-OTHER", "其他作業"),
  officialEntryIsOther: true,
  normalizedActivity: "設施內動物危害處理",
  officialNote: "捕捉飛入設施內的大型蝙蝠"
}, now);
assert.equal(other.mappingState, MAP.MAPPING_STATES.OTHER);
assert.equal(other.officialNote, "捕捉飛入設施內的大型蝙蝠");
assert.equal(other.reviewedRevision, other.revision);

const revised = MAP.reviseSource(other, farmer, {
  sourceRef: {
    kind: "manual_note",
    id: "activity-001",
    updatedAt: "2026-08-02T01:00:00.000Z"
  },
  sourceText: "巡查設施並處理飛入的動物"
}, now);
assert.equal(revised.revision, 2);
assert.equal(revised.mappingState, MAP.MAPPING_STATES.UNMAPPED, "原始內容改變後舊對照必須失效");
assert.equal(revised.reviewedRevision, null);
assert.equal(revised.officialEntry, null);
assert.equal(revised.officialNote, "");
assert.ok(revised.events.some((event) => event.action === "other_mapping_confirmed"), "舊版人工決定必須保留在事件歷程");

assert.throws(() => MAP.reviseSource(revised, otherFarmer, {
  sourceRef: { kind: "manual_note", id: "activity-001", updatedAt: "2026-08-02T02:00:00.000Z" },
  sourceText: "偽造修改"
}, now), /只能修改自己的/);

assert.throws(() => MAP.reviseSource(revised, farmer, {
  sourceRef: { kind: "manual_note", id: "another-id", updatedAt: "2026-08-02T02:00:00.000Z" },
  sourceText: "更換來源"
}, now), /不可更換來源紀錄/);

const unmapped = MAP.markUnmapped(revised, reviewer, "官方清單暫無一對一項目", now);
assert.equal(unmapped.mappingState, MAP.MAPPING_STATES.UNMAPPED);
assert.equal(unmapped.unmappedReason, "官方清單暫無一對一項目");
assert.equal(unmapped.sourceText, "巡查設施並處理飛入的動物");

const tampered = JSON.parse(JSON.stringify(other));
tampered.officialEntry.code = "FAKE-CODE";
assert.throws(() => MAP.validateActivityMapping(tampered), /事件歷程不一致/, "不能只改目前欄位偽造官方對照");

const moduleSource = fs.readFileSync(path.join(root, "tap-activity-mapping.js"), "utf8");
assert.match(moduleSource, /官方項目只能來自[\s\S]*官方 API/);
assert.doesNotMatch(moduleSource, /submitted|accepted|approved/, "內部對照模型不可假造 L3 送出狀態");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const build = fs.readFileSync(path.join(root, "scripts", "build-release.mjs"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
assert.doesNotMatch(html, /tap-activity-mapping\.js/, "未完成的特殊作業對照不得載入正式前端");
assert.doesNotMatch(build, /tap-activity-mapping\.js/, "未完成的特殊作業對照不得進入正式發布成品");
assert.doesNotMatch(serviceWorker, /tap-activity-mapping\.js/, "未完成的特殊作業對照不得進入離線快取");

console.log("特殊作業對照：原始事實保留、官方來源限制、人工確認與修訂失效規則通過");
