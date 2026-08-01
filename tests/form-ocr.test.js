const assert = require("node:assert/strict");
const O = require("../form-ocr.js");

const clear = O.assessQuality({
  width: 1600,
  height: 2200,
  documentCoverage: 0.82,
  sharpness: 0.88,
  glareRatio: 0.02,
  skewDegrees: 2,
  cornersDetected: true
});
assert.equal(clear.canProcess, true);
assert.equal(clear.issues.length, 0);

const unclear = O.assessQuality({
  width: 600,
  height: 900,
  documentCoverage: 0.3,
  sharpness: 0.2,
  glareRatio: 0.35,
  skewDegrees: 20,
  cornersDetected: false
});
assert.equal(unclear.canProcess, false);
assert.ok(unclear.issues.filter((item) => item.level === "blocking").length >= 5);

assert.deepEqual(O.findDates("施作日期 民國115/7/30").map((item) => item.value), ["2026-07-30"]);
assert.deepEqual(O.findDates("2026年2月30日").map((item) => item.value), [], "無效日期不得採用");
assert.deepEqual(O.findDilutions("稀釋 1,000 倍，另有 800倍").map((item) => item.value), [1000, 800]);
assert.deepEqual(O.findAmounts("使用 20 公克，水量25ml").map((item) => [item.value, item.unit]), [[20, "公克"], [25, "ml"]]);
assert.deepEqual(O.findAmounts("使用量 425 c.c.，另領 2 包").map((item) => [item.value, item.unit]), [[425, "c.c."], [2, "包"]]);
assert.equal(O.detectFormTypes("表11 病蟲害防治或環境消毒資材施用紀錄 防治對象 稀釋倍數 安全採收期")[0].value, "pesticide");
assert.deepEqual(O.findSafetyIntervals("安全採收期(天) 12D").map((item) => item.value), [12]);
assert.deepEqual(O.findPlotCodes("田區代號 A+B區 作物 麻豆文旦").map((item) => item.value), ["A+B區"]);
assert.equal(O.findLabeledValues("操作人員：王小明", ["操作人員"], "operator")[0].value, "王小明");

const draft = O.createDraft({
  requestId: "scan-001",
  createdAt: "2026-07-31T10:00:00.000Z",
  quality: {
    width: 1600,
    height: 2200,
    documentCoverage: 0.8,
    sharpness: 0.9,
    glareRatio: 0.01,
    skewDegrees: 1,
    cornersDetected: true
  },
  blocks: [
    { text: "日期 115/7/30", confidence: 0.97, box: { left: 0.1, top: 0.1, right: 0.4, bottom: 0.2 } },
    { text: "番茄 使用 亞滅培 1000倍", confidence: 0.92, box: { left: 0.1, top: 0.3, right: 0.9, bottom: 0.4 } },
    { text: "data:image/jpeg;base64,不應被當成影像保存", confidence: 0.2 }
  ],
  image: "should-not-be-copied"
}, { crops: ["番茄", "草莓"], materials: ["亞滅培", "益達胺"] });

assert.equal(draft.confirmed, false);
assert.equal(draft.source, "android-on-device-ocr");
assert.equal(draft.fields.date[0].value, "2026-07-30");
assert.equal(draft.fields.crop[0].value, "番茄");
assert.equal(draft.fields.material[0].value, "亞滅培");
assert.equal(draft.fields.dilution[0].value, 1000);
assert.equal(Object.hasOwn(draft, "image"), false, "照片不可進入草稿資料");
assert.equal(O.canCommit(draft, { date: "2026-07-30", crop: "番茄", recordType: "spray" }), true);
assert.equal(O.canCommit(draft, { date: "2026-07-30", crop: "番茄" }), false);
assert.equal(O.canCommit(draft, { date: "2026-07-30", crop: "番茄", recordType: "pesticide" }), false, "用藥草稿缺少藥劑不可帶入");
assert.equal(O.canCommit(draft, { date: "2026-07-30", crop: "番茄", recordType: "pesticide", material: "亞滅培" }), true);

const pesticideDraft = O.createDraft({
  quality: { width: 1800, height: 2400, documentCoverage: 0.9, sharpness: 0.9, glareRatio: 0, skewDegrees: 0, cornersDetected: true },
  blocks: [{ text: "表11 病蟲害防治或環境消毒資材施用紀錄\n使用日期 民國115年7月30日\n田區代號 A+B區\n作物 番茄\n防治對象 葉蟎\n資材名稱 亞滅培\n稀釋倍數 4000倍\n安全採收期 6天\n操作人員 王小明", confidence: 0.9 }]
}, { crops: ["番茄"], materials: ["亞滅培"], targets: ["葉蟎"] });
assert.equal(pesticideDraft.fields.recordType[0].value, "pesticide");
assert.equal(pesticideDraft.fields.fieldPlot[0].value, "A+B區");
assert.equal(pesticideDraft.fields.target[0].value, "葉蟎");
assert.equal(pesticideDraft.fields.safetyInterval[0].value, 6);
assert.equal(pesticideDraft.fields.operator[0].value, "王小明");

console.log("表單 OCR 核心：品質閘門、候選解析與人工確認規則通過");
