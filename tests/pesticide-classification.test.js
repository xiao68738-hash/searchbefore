const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const mod = await import(pathToFileURL(path.resolve(__dirname, "..", "scripts", "pesticide-classification.mjs")).href);
  const catalog = mod.loadClassificationCatalog();

  assert.equal(catalog.schemaVersion, 1);
  assert.deepEqual(mod.parseMechanismCodes("FRAC C3, 11"), [
    { family: "FRAC", code: "C3" },
    { family: "FRAC", code: "11" }
  ]);
  assert.deepEqual(mod.parseMechanismCodes("HRAC 3(新)或K1(舊)"), [
    { family: "HRAC", code: "3" },
    { family: "HRAC", code: "K1" }
  ]);

  assert.equal(mod.resolveResistanceRisk({ name: "益達胺", moa: "IRAC 4A" }, catalog).level, "high");
  assert.equal(mod.resolveResistanceRisk({ name: "阿巴汀", moa: "IRAC 6" }, catalog).level, "not_high");
  assert.equal(mod.resolveResistanceRisk({ name: "亞托敏", moa: "FRAC 11" }, catalog).isHighRisk, false, "FRAC 代碼不得直接推定高風險");
  assert.equal(mod.resolveResistanceRisk({ name: "未收錄示範藥", moa: "IRAC 1A" }, catalog).basis, "unlisted");

  const boundaryMarkers = {
    policy: { operator: ">", threshold: 500 }, source: { title: "test" }, entries: [
      { name: "剛好五百", isHighResistanceRisk: false, caseCount: 500, evidenceStatus: "verified" },
      { name: "五百零一", isHighResistanceRisk: true, caseCount: 501, evidenceStatus: "verified" }
    ]
  };
  assert.equal(mod.resolveResistanceRisk({ name: "剛好五百" }, catalog, boundaryMarkers).isHighRisk, false);
  assert.equal(mod.resolveResistanceRisk({ name: "五百零一" }, catalog, boundaryMarkers).isHighRisk, true);

  assert.deepEqual(
    { movement: mod.resolveMovement("益達胺", catalog).movement, isSystemic: mod.resolveMovement("益達胺", catalog).isSystemic },
    { movement: "systemic", isSystemic: true }
  );
  assert.equal(mod.resolveMovement("比加普", catalog).movement, "selective_systemic");
  assert.equal(mod.resolveMovement("阿巴汀", catalog).movement, "local_systemic");
  assert.equal(mod.resolveMovement("馬拉松", catalog).isSystemic, false);
  assert.equal(mod.resolveMovement("賽洛寧", catalog).isSystemic, false);
  assert.equal(mod.resolveMovement("普拔克", catalog).movement, "systemic");
  assert.equal(mod.resolveMovement("固殺草", catalog).movement, "local_systemic");
  assert.equal(mod.resolveMovement("甲基多保淨", catalog).movement, "systemic");
  assert.equal(mod.resolveMovement("氟尼胺", catalog).isSystemic, true);
  assert.equal(mod.resolveMovement("依普同", catalog).movement, "bidirectional");
  assert.equal(mod.resolveMovement("氫氧化銅", catalog).isSystemic, false);
  assert.equal(mod.resolveMovement("鹼性氯氧化銅", catalog).confidence, "direct_document_classification");
  assert.equal(mod.resolveMovement("可濕性硫黃", catalog).sourceReference.printedPages[0], 46);
  assert.equal(mod.resolveMovement("未收錄示範藥", catalog).isSystemic, null, "未收錄不可推論為非系統性");
  assert.equal(mod.resolveMovement("未收錄示範藥", catalog).confidence, "unverified");

  const rows = [
    { name: "益達胺", moa: "IRAC 4A" },
    { name: "阿巴汀", moa: "IRAC 6" },
    { name: "亞托敏", moa: "FRAC 11" },
    { name: "馬拉松", moa: "IRAC 1B" },
    { name: "未知藥", moa: "" }
  ];
  assert.deepEqual(mod.filterPesticides(rows, { highResistanceRiskOnly: true }, catalog).map(x => x.name), ["益達胺", "馬拉松"]);
  assert.deepEqual(mod.filterPesticides(rows, { movement: "systemic" }, catalog).map(x => x.name), ["益達胺", "阿巴汀", "亞托敏"]);
  assert.deepEqual(mod.filterPesticides(rows, { movement: "non_systemic" }, catalog).map(x => x.name), ["馬拉松"]);

  assert.deepEqual(mod.summarizeClassificationCoverage(rows, catalog), {
    total: 5,
    resistanceClassified: 4,
    movementClassified: 4,
    systemic: 3,
    nonSystemic: 1,
    unknownMovement: 1
  });

  console.log("✓ 農藥抗藥性風險與系統性分類架構測試通過");
})().catch(error => { console.error(error); process.exit(1); });
