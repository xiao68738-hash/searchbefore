const assert = require("node:assert/strict");
const summary = require("../field-summary.js");
const safety = require("../safety.js");
const farm = require("../farm-records.js");

const plot = { id: "plot-a", crop: "番茄", tag: "A區", plantDate: "2026-07-01" };
const fertilizer = farm.createRecord({
  id: "farm-1", plotId: "plot-a", type: "fertilizer", date: "2026-07-10",
  details: { materialName: "有機質肥料", quantity: "20", unit: "kg", dressing: "基肥" }
}, () => "farm-1");

const waiting = summary.buildFieldSummary({
  plot,
  pesticideRecords: [{ id: "spray-1", plotId: "plot-a", crop: "番茄", agent: "測試藥", pest: "病害", date: "2026-07-14", phi: 7 }],
  farmRecords: [fertilizer],
  today: "2026-07-18",
  safety,
  farm
});
assert.equal(waiting.plotName, "番茄 / A區");
assert.equal(waiting.pesticideCount, 1);
assert.equal(waiting.farmEventCount, 1);
assert.equal(waiting.safety.status, "waiting");
assert.equal(waiting.safety.safeDate, "2026-07-22");
assert.equal(waiting.nextAction.code, "VIEW_COUNTDOWN");
assert.match(waiting.events.find(event => event.kind === "fertilizer").summary, /有機質肥料/);

const unknown = summary.buildFieldSummary({
  plot,
  pesticideRecords: [
    { id: "spray-1", plotId: "plot-a", crop: "番茄", date: "2026-07-14", phi: 3 },
    { id: "spray-2", plotId: "plot-a", crop: "番茄", date: "2026-07-15", phi: null }
  ],
  farmRecords: [],
  today: "2026-08-01",
  safety
});
assert.equal(unknown.safety.status, "unknown");
assert.equal(unknown.nextAction.code, "REVIEW_SAFETY");

const empty = summary.buildFieldSummary({ plot, pesticideRecords: [], farmRecords: [], today: "2026-07-18", safety });
assert.equal(empty.safety.status, "none");
assert.equal(empty.nextAction.code, "ADD_FIRST_RECORD");

assert.equal(summary.selectPlot({
  fieldPlots: [plot, { id: "plot-b", crop: "草莓", createdAt: "2026-07-20" }],
  activePlotId: "plot-b",
  pesticideRecords: [],
  farmRecords: []
}).id, "plot-b");

assert.equal(summary.normalizeEvents({
  pesticideRecords: [{ id: "bad", date: "2026-02-30" }],
  farmRecords: [{ id: "good", type: "cultivation", date: "2026-07-01", details: { activity: "灌溉" } }],
  farm
}).length, 1);

console.log("✓ 田區摘要與下一步導引測試通過");
