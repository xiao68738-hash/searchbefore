const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "..", "mrl-data", "pesticide-classification", "resistance-literature-ledger-v1.json");
const ledger = JSON.parse(fs.readFileSync(file, "utf8"));
const markers = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "mrl-data", "pesticide-classification", "high-resistance-risk-v1.json"), "utf8"));
const aprd = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "mrl-data", "pesticide-classification", "aprd-case-counts-v1.json"), "utf8"));

assert.equal(ledger.schemaVersion, 1);
assert.ok(ledger.summary.totalIngredientNames > 500);
assert.equal(ledger.ingredients.length, ledger.summary.totalIngredientNames);
assert.equal(ledger.ingredients.filter(x => x.englishNames.length).length, ledger.summary.englishMatchedCount);
assert.equal(ledger.ingredients.filter(x => x.mechanismCodes.length).length, ledger.summary.mechanismClassifiedCount);
assert.equal(ledger.ingredients.filter(x => x.decision.status === "high").length, ledger.summary.strictHighCount);
assert.equal(ledger.summary.strictHighCount, 7);
assert.equal(ledger.summary.notHighCount, ledger.summary.totalIngredientNames - ledger.summary.strictHighCount);
assert.ok(ledger.ingredients.every(x => Array.isArray(x.englishNames) && Array.isArray(x.mechanismCodes)));
assert.ok(ledger.ingredients.every(x => ["high", "not_high"].includes(x.decision.status)));
assert.ok(ledger.ingredients.filter(x => x.decision.status === "high").every(x => x.aprd.caseCount > 500));
assert.ok(ledger.ingredients.filter(x => x.decision.status === "not_high" && x.aprd?.caseCount != null).every(x => x.aprd.caseCount <= 500));

assert.equal(markers.policy.type, "boolean");
assert.equal(markers.policy.operator, ">");
assert.equal(markers.policy.threshold, 500);
assert.equal(markers.policy.boundaryAt500, false);
assert.equal(markers.entries.length, ledger.summary.totalIngredientNames);
assert.equal(markers.entries.filter(x => x.isHighResistanceRisk).length, 7);
assert.deepEqual(markers.entries.filter(x => x.isHighResistanceRisk).map(x => x.name).sort(), ["百滅寧", "益達胺", "馬拉松", "第滅寧", "陶斯松", "賽洛寧", "賽滅寧"].sort());

assert.equal(aprd.policy.highDefinition, "caseCount > 500");
assert.equal(aprd.summary.highRiskComponentCount, 7);
assert.ok(aprd.records.filter(x => x.isHighResistanceRisk).every(x => x.caseCount > 500));
assert.ok(aprd.records.filter(x => !x.isHighResistanceRisk).every(x => x.caseCount <= 500));

console.log("抗藥性文獻證據清冊測試通過");
