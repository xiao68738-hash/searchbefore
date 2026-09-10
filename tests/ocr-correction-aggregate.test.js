const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");

(async function () {
  const aggregateModule = await import("../scripts/aggregate-private-ocr-corrections.mjs");
  const valid = {
    schemaVersion: 1,
    recordType: "ocr-local-correction",
    correctionId: "ocr-correction-1234abcd",
    generatedAt: "2026-08-26T09:30:00.000Z",
    privacy: {
      storage: "user-download-only",
      autoUploadAllowed: false,
      imageIncluded: false,
      sourceFileMetadataIncluded: false,
      accountIdentifiersIncluded: false
    },
    fields: [
      { key: "date", candidates: [{ value: "7/14", confidence: 0.9 }], confirmedValue: "7/14", exactMatch: true },
      { key: "material", candidates: [{ value: "教角", confidence: 0.8 }], confirmedValue: "蘇力菌", exactMatch: false }
    ]
  };
  assert.equal(aggregateModule.validateCorrectionRecord(valid).ok, true);
  assert.equal(aggregateModule.validateCorrectionRecord({ ...valid, sourceImageId: "source-private" }).ok, false);
  assert.equal(aggregateModule.validateCorrectionRecord({ ...valid, fields: [{ key: "operator", candidates: [], confirmedValue: "王小明" }] }).ok, false);
  // Use the host platform's path semantics so this regression also runs on Linux CI.
  const privateRoot = path.join(os.tmpdir(), "searchbefore-private-root");
  assert.equal(aggregateModule.pathIsInsidePrivate(path.join(privateRoot, "ocr-corrections"), privateRoot), true);
  assert.equal(aggregateModule.pathIsInsidePrivate(path.join(os.tmpdir(), "searchbefore-public"), privateRoot), false);
  // Keep the Windows-specific cases covered when running on Windows.
  if (process.platform === "win32") {
    assert.equal(aggregateModule.pathIsInsidePrivate("D:\\SearchBefore\\private\\ocr-corrections", "D:\\SearchBefore\\private"), true);
    assert.equal(aggregateModule.pathIsInsidePrivate("D:\\SearchBefore\\repo", "D:\\SearchBefore\\private"), false);
  }
  const aggregate = aggregateModule.aggregateCorrectionRecords([valid, valid, { ...valid, correctionId: "bad" }], "2026-08-26T10:00:00.000Z");
  assert.equal(aggregate.summary.accepted, 1);
  assert.equal(aggregate.summary.rejected, 2);
  assert.equal(aggregate.summary.fieldMetrics.find(item => item.field === "date").exactRate, 1);
  assert.equal(aggregate.summary.fieldMetrics.find(item => item.field === "material").exactRate, 0);
  assert.equal(aggregate.privacy.publishAllowed, false);
  assert.equal(JSON.stringify(aggregate).includes("source-private"), false);
  console.log("OCR 本機校正彙整：路徑隔離、隱私檢核、去重與欄位準確率通過");
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
