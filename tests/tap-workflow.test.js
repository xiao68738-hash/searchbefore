const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const TAP = require("../tap-workflow.js");

const root = path.join(__dirname, "..");
const farmer = { uid: "farmer-001", role: "farmer" };
const otherFarmer = { uid: "farmer-002", role: "farmer" };
const reviewer = { uid: "reviewer-001", role: "reviewer", capabilities: ["attest_manual_entry"] };
const reviewerWithoutAttestation = { uid: "reviewer-001", role: "reviewer" };
const otherReviewer = { uid: "reviewer-002", role: "reviewer", capabilities: ["attest_manual_entry"] };
let tick = 0;
function now() {
  tick += 1;
  return new Date(Date.UTC(2026, 7, 1, 0, 0, tick)).toISOString();
}

function createItem() {
  return TAP.createReviewItem({
    workspaceId: "workspace-001",
    batchId: "batch-001",
    kind: "pesticide",
    farmerUid: farmer.uid,
    assignedReviewerUid: reviewer.uid,
    createdBy: farmer,
    sourceRef: {
      collection: "records",
      id: "record-001",
      updatedAt: "2026-08-01T00:00:00.000Z"
    },
    snapshot: {
      plot: { id: "plot-001", crop: "番茄" },
      record: { id: "record-001", date: "2026-08-01", crop: "番茄", agent: "亞滅培", target: "葉蟎" }
    },
    role: "reviewer",
    l3InteractionState: "api_accepted"
  }, { idFactory: () => "tap-review-001", now });
}

let item = createItem();
assert.equal(item.reviewState, TAP.REVIEW_STATES.DRAFT);
assert.equal(item.l3InteractionState, TAP.L3_INTERACTION_STATES.NOT_CONNECTED);
assert.equal(item.revision, 1);
assert.equal(item.reviewedRevision, null);
assert.equal(item.events.length, 1);
assert.equal(Object.hasOwn(item, "role"), false, "客戶端輸入的角色不可寫入協作資料");
assert.equal(item.l3InteractionState === "api_accepted", false, "客戶端不可自行宣稱 API 已受理");
assert.deepEqual(Object.values(TAP.L3_INTERACTION_STATES), [
  "not_connected",
  "manual_entry_claim_pending",
  "manual_entry_claim_recorded_unverified"
]);
assert.ok(Object.isFrozen(item));
assert.ok(Object.isFrozen(item.snapshot));

assert.throws(() => TAP.completeInternalReview(item, reviewer, now), /只有待審資料/);
assert.throws(() => TAP.submitForReview(item, otherReviewer, now), /其他審核者/);
assert.throws(() => TAP.reviseSnapshot(item, {
  sourceRef: item.sourceRef,
  snapshot: item.snapshot
}, otherFarmer, now), /不屬於目前農友/);

item = TAP.submitForReview(item, farmer, now);
assert.equal(item.reviewState, TAP.REVIEW_STATES.AWAITING_REVIEW);
assert.throws(() => TAP.completeInternalReview(item, otherReviewer, now), /其他審核者/);

item = TAP.requestChanges(item, reviewer, ["藥劑名稱需要核對", "缺少施作面積"], now);
assert.equal(item.reviewState, TAP.REVIEW_STATES.NEEDS_CHANGES);
assert.equal(item.events.at(-1).action, "changes_requested");

assert.throws(() => TAP.reviseSnapshot(item, {
  sourceRef: {
    collection: "records",
    id: "record-001",
    updatedAt: "2026-08-01T00:00:00.000Z"
  },
  snapshot: item.snapshot
}, farmer, now), /必須晚於目前版本/);

item = TAP.reviseSnapshot(item, {
  sourceRef: {
    collection: "records",
    id: "record-001",
    updatedAt: "2026-08-01T01:00:00.000Z"
  },
  snapshot: {
    plot: { id: "plot-001", crop: "番茄" },
    record: { id: "record-001", date: "2026-08-01", crop: "番茄", agent: "亞滅培", target: "葉蟎", area: "0.2公頃" }
  }
}, farmer, now);
assert.equal(item.reviewState, TAP.REVIEW_STATES.DRAFT);
assert.equal(item.revision, 2);
assert.equal(item.reviewedRevision, null);

item = TAP.submitForReview(item, farmer, now);
item = TAP.completeInternalReview(item, reviewer, now);
assert.equal(item.reviewState, TAP.REVIEW_STATES.INTERNAL_REVIEW_COMPLETE);
assert.equal(item.reviewedRevision, item.revision);
assert.equal(item.l3InteractionState, TAP.L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_PENDING);

assert.throws(() => TAP.recordManualEntryClaim(item, reviewerWithoutAttestation, { entryReference: "manual-001" }, now), /沒有人工登打聲明權限/);
assert.throws(() => TAP.recordManualEntryClaim(item, farmer, { entryReference: "manual-001" }, now), /審核者/);
item = TAP.recordManualEntryClaim(item, reviewer, { entryReference: "manual-001", note: "依官方畫面人工登打" }, now);
assert.equal(item.l3InteractionState, TAP.L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_RECORDED_UNVERIFIED);
assert.equal(item.externalEntryClaims.length, 1);
assert.equal(item.externalEntryClaims[0].revision, item.revision);
assert.equal(item.externalEntryClaims[0].notice, TAP.MANUAL_ENTRY_CLAIM_NOTICE);
assert.match(item.externalEntryClaims[0].notice, /尚未向官方系統查證/);
assert.doesNotMatch(item.externalEntryClaims[0].notice, /已上傳|已受理|已核准|官方驗證完成/);

const revisedAfterClaim = TAP.reviseSnapshot(item, {
  sourceRef: {
    collection: "records",
    id: "record-001",
    updatedAt: "2026-08-01T02:00:00.000Z"
  },
  snapshot: {
    plot: { id: "plot-001", crop: "番茄" },
    record: { id: "record-001", date: "2026-08-01", crop: "番茄", agent: "亞滅培", target: "葉蟎", area: "0.25公頃" }
  }
}, farmer, now);
assert.equal(revisedAfterClaim.reviewState, TAP.REVIEW_STATES.DRAFT, "原始資料變更後必須重新審核");
assert.equal(revisedAfterClaim.reviewedRevision, null);
assert.equal(revisedAfterClaim.externalEntryClaims.length, 1, "舊版人工登打聲明必須保留");
assert.equal(revisedAfterClaim.externalEntryClaims[0].revision, 2);
assert.equal(revisedAfterClaim.externalFollowupRequired, true, "已有外部登打聲明的舊版修改後必須標記待處理");
assert.equal(revisedAfterClaim.l3InteractionState, TAP.L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_RECORDED_UNVERIFIED);

const cancelledAfterClaim = TAP.cancelReview(revisedAfterClaim, farmer, "不再使用這筆草稿", now);
assert.equal(cancelledAfterClaim.reviewState, TAP.REVIEW_STATES.CANCELLED);
assert.equal(cancelledAfterClaim.externalEntryClaims.length, 1, "取消本地草稿不得抹除舊版外部登打聲明");
assert.equal(cancelledAfterClaim.externalFollowupRequired, true);

assert.throws(() => TAP.createReviewItem({
  workspaceId: "workspace-001",
  kind: "pesticide",
  farmerUid: farmer.uid,
  createdBy: farmer,
  sourceRef: { collection: "unknown", id: "x", updatedAt: "2026-08-01T00:00:00.000Z" },
  snapshot: { record: { date: "2026-08-01", crop: "番茄", agent: "亞滅培" } }
}, { now }), /來源集合不受支援/);

assert.throws(() => TAP.createReviewItem({
  workspaceId: "workspace-001",
  kind: "harvest",
  farmerUid: farmer.uid,
  createdBy: farmer,
  sourceRef: { collection: "records", id: "x", updatedAt: "2026-08-01T00:00:00.000Z" },
  snapshot: { record: { date: "2026-08-01", type: "harvest", plotId: "plot-001", details: { quantity: "10" } } }
}, { now }), /紀錄類型與來源集合不一致/);

const harvestItem = TAP.createReviewItem({
  workspaceId: "workspace-001",
  kind: "harvest",
  farmerUid: farmer.uid,
  createdBy: farmer,
  sourceRef: { collection: "farmRecords", id: "farm-001", updatedAt: "2026-08-01T00:00:00.000Z" },
  snapshot: {
    record: {
      id: "farm-001",
      type: "harvest",
      plotId: "plot-001",
      date: "2026-08-01",
      details: { quantity: "10", unit: "公斤" }
    }
  }
}, { idFactory: () => "tap-review-harvest", now });
assert.equal(harvestItem.kind, "harvest");
assert.equal(harvestItem.sourceRef.collection, "farmRecords");

assert.throws(() => TAP.createReviewItem({
  workspaceId: "workspace-001",
  kind: "pesticide",
  farmerUid: farmer.uid,
  createdBy: farmer,
  sourceRef: { collection: "records", id: "x", updatedAt: "2026-08-01T00:00:00.000Z" },
  snapshot: JSON.parse('{"record":{"date":"2026-08-01","crop":"番茄","agent":"亞滅培","constructor":{"prototype":{"polluted":true}}}}')
}, { now }), /不允許的欄位/);

const deepSnapshot = { record: { date: "2026-08-01", crop: "番茄", agent: "亞滅培" } };
let deepCursor = deepSnapshot.record;
for (let depth = 0; depth < 35; depth += 1) {
  deepCursor.child = {};
  deepCursor = deepCursor.child;
}
assert.throws(() => TAP.createReviewItem({
  workspaceId: "workspace-001",
  kind: "pesticide",
  farmerUid: farmer.uid,
  createdBy: farmer,
  sourceRef: { collection: "records", id: "x", updatedAt: "2026-08-01T00:00:00.000Z" },
  snapshot: deepSnapshot
}, { now }), /巢狀層級過深/);

const pollutedInput = JSON.parse(JSON.stringify(createItem()));
Object.defineProperty(pollutedInput, "__proto__", { enumerable: true, value: { polluted: "yes" } });
const sanitized = TAP.validateReviewItem(pollutedInput);
assert.equal(Object.getPrototypeOf(sanitized), Object.prototype);
assert.equal(sanitized.polluted, undefined);
assert.equal({}.polluted, undefined);

assert.throws(() => TAP.validateReviewItem({ ...createItem(), revision: "1" }), /正整數/);
assert.throws(() => TAP.validateReviewItem({ ...createItem(), reviewState: "verified" }), /狀態不受支援/);
assert.throws(() => TAP.validateReviewItem({ ...createItem(), events: [] }), /缺少建立事件/);
assert.throws(() => TAP.validateReviewItem({
  ...createItem(),
  reviewState: TAP.REVIEW_STATES.INTERNAL_REVIEW_COMPLETE,
  reviewedRevision: 1,
  l3InteractionState: TAP.L3_INTERACTION_STATES.MANUAL_ENTRY_CLAIM_PENDING
}), /事件歷程不一致/, "不能只改目前欄位就偽造已完成內部覆核");
const changedSnapshot = JSON.parse(JSON.stringify(createItem()));
changedSnapshot.snapshot.record.agent = "偽造藥劑";
assert.throws(() => TAP.validateReviewItem(changedSnapshot), /快照指紋不一致/);
const reorderedSnapshot = JSON.parse(JSON.stringify(createItem()));
reorderedSnapshot.snapshot.record = {
  target: reorderedSnapshot.snapshot.record.target,
  agent: reorderedSnapshot.snapshot.record.agent,
  crop: reorderedSnapshot.snapshot.record.crop,
  date: reorderedSnapshot.snapshot.record.date,
  id: reorderedSnapshot.snapshot.record.id
};
assert.doesNotThrow(() => TAP.validateReviewItem(reorderedSnapshot), "只調整物件欄位順序不應被誤判為內容遭修改");

const moduleSource = fs.readFileSync(path.join(root, "tap-workflow.js"), "utf8");
assert.match(moduleSource, /不得直接接受[\s\S]*actor\.role\/capabilities/, "模組必須明示角色不是客戶端安全邊界");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const build = fs.readFileSync(path.join(root, "scripts", "build-release.mjs"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
assert.doesNotMatch(html, /tap-workflow\.js/, "未完成的協作流程不得載入正式前端");
assert.doesNotMatch(build, /tap-workflow\.js/, "未完成的協作流程不得進入正式發布成品");
assert.doesNotMatch(serviceWorker, /tap-workflow\.js/, "未完成的協作流程不得進入離線快取");

console.log("產銷履歷協作狀態：內部覆核、外部聲明保留與未公開閘門通過");
