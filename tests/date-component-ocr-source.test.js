const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, "scripts", name), "utf8");
const inspect = read("inspect-private-date-components.py");
const train = read("train-mnist-digit-classifier.py");
const run = read("run-component-date-benchmark.py");
const thresholdEnsemble = read("run-private-date-threshold-ensemble.py");

assert.match(inspect, /Path must stay under/);
assert.match(inspect, /wide-ruling-line/);
assert.match(inspect, /glyphImage/);
assert.match(train, /MNIST/);
assert.match(train, /"usesPrivateGroundTruth": False/);
assert.match(train, /RandomAffine/);
assert.doesNotMatch(train + run, /蘇力菌|7\/14/);
assert.doesNotMatch(train + run, /paddle/i);
assert.match(run, /Ambiguous slash geometry/);
assert.match(run, /ensembleAgrees/);
assert.match(run, /"requiresHumanReview": True/);
assert.match(run, /"autoCommitAllowed": False/);
assert.match(thresholdEnsemble, /allThresholdsAgree/);
assert.match(thresholdEnsemble, /"usesGroundTruth": False/);
assert.match(thresholdEnsemble, /"autoCommitAllowed": False/);

console.log("Date component OCR research guards passed.");
