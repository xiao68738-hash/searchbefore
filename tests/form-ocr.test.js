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

const cloudDraft = O.createDraft({
  source: "google-cloud-vision",
  engine: "Google Cloud Vision DOCUMENT_TEXT_DETECTION",
  quality: { width: 1600, height: 2200, cornersDetected: false, cornersConfirmedByUser: true, assessment: "user-confirmed-before-upload" },
  blocks: [{ text: "民國115/7/30 番茄", confidence: 0.9 }]
}, { crops: ["番茄"] });
assert.equal(cloudDraft.source, "google-cloud-vision", "雲端辨識草稿必須保留來源標示");
assert.equal(cloudDraft.quality.canProcess, true, "使用者已確認且解析度足夠的雲端照片可進入人工草稿");
assert.deepEqual(O.findDates("誤讀年份 1114/11/15"), [], "不把四位數 OCR 雜訊誤當民國年份");
assert.equal(cloudDraft.confirmed, false, "雲端辨識結果不得直接視為已確認");

const pesticideDraft = O.createDraft({
  quality: { width: 1800, height: 2400, documentCoverage: 0.9, sharpness: 0.9, glareRatio: 0, skewDegrees: 0, cornersDetected: true },
  blocks: [{ text: "表11 病蟲害防治或環境消毒資材施用紀錄\n使用日期 民國115年7月30日\n田區代號 A+B區\n作物 番茄\n防治對象 葉蟎\n資材名稱 亞滅培\n稀釋倍數 4000倍\n安全採收期 6天\n操作人員 王小明", confidence: 0.9 }]
}, { crops: ["番茄"], materials: ["亞滅培"], targets: ["葉蟎"] });
assert.equal(pesticideDraft.fields.recordType[0].value, "pesticide");
assert.equal(pesticideDraft.fields.fieldPlot[0].value, "A+B區");
assert.equal(pesticideDraft.fields.target[0].value, "葉蟎");
assert.equal(pesticideDraft.fields.safetyInterval[0].value, 6);
assert.equal(pesticideDraft.fields.operator[0].value, "王小明");

const equipmentDraft = O.createDraft({
  source: "google-cloud-vision",
  quality: { width: 1800, height: 2400, cornersConfirmedByUser: true, assessment: "user-confirmed-before-upload" },
  blocks: [
    { id: "title", text: "表18 器具/機械/設備之保養、維修、校正及清潔管理紀錄 作業內容", confidence: 0.96, box: { left: 0.1, top: 0.03, right: 0.9, bottom: 0.08 } },
    { id: "row-1", text: "民國115/2/23 ☑噴霧機 ☑割草機 ☑清潔 ☑保養 記錄人：施坤寶", confidence: 0.9, box: { left: 0.08, top: 0.18, right: 0.92, bottom: 0.28 } },
    { id: "row-2", text: "民國115/3/10 ☑中耕機 ☑維修", confidence: 0.84, box: { left: 0.08, top: 0.36, right: 0.92, bottom: 0.46 } }
  ]
});
assert.equal(equipmentDraft.fields.recordType[0].value, "equipmentMaintenance");
assert.equal(equipmentDraft.recordGroups.length, 2, "同一張表的兩個日期應建立兩筆待確認草稿");
assert.equal(equipmentDraft.recordGroups[0].date[0].value, "2026-02-23");
assert.deepEqual(equipmentDraft.recordGroups[0].equipment.filter(item => item.selected).map(item => item.value), ["噴霧機", "割草機"]);
assert.deepEqual(equipmentDraft.recordGroups[0].actions.filter(item => item.selected).map(item => item.value), ["清潔", "保養"]);
assert.equal(equipmentDraft.recordGroups[0].operator[0].value, "施坤寶");
assert.equal(equipmentDraft.recordGroups[1].date[0].value, "2026-03-10");

const checklistTypes = O.detectFormTypes("農作物生產及出貨作業自我查核表\n查核項目 查核頻率 程度 備註\n確認日期：115.6.1 查核者：王小明");
assert.equal(checklistTypes[0].value, "selfInspection", "查核表不得誤判成田間作業紀錄");

const checklistDraft = O.createDraft({
  source: "google-cloud-vision",
  quality: { width: 1800, height: 2400, cornersConfirmedByUser: true, assessment: "user-confirmed-before-upload" },
  blocks: [{ text: "農作物生產及出貨作業自我查核表\n查核項目 查核頻率 程度 備註\n3.1 種苗使用管理\n確認日期：115.2.1 查核者：施坤寶\n3.1.1 種苗來源是否明確\n3.1.2 是否保留定植紀錄\n3.2 樹體管理\n3.2.1 是否清除病蟲害部位", confidence: 0.91 }]
});
assert.ok(checklistDraft.selfInspection, "自我查核表必須建立獨立的結構化草稿");
assert.equal(checklistDraft.selfInspection.sections.length, 2);
assert.equal(checklistDraft.selfInspection.sections[0].items[0].code, "3.1.1");
assert.equal(checklistDraft.selfInspection.sections[0].items[0].status, "unresolved", "OCR 不得依失去版面關係的勾選文字猜測查核結果");
assert.equal(checklistDraft.selfInspection.sections[0].items[2].detectedFromOcr, false, "同章固定欄位可由版型補回，但必須標示不是 OCR 證據");
assert.equal(checklistDraft.selfInspection.dates[0].value, "2026-02-01");
assert.equal(checklistDraft.selfInspection.inspectors[0].value.replace(/\s/g, ""), "施坤寶");

const inventoryDraft = O.createDraft({
  source: "google-cloud-vision",
  quality: { width: 1800, height: 2400, cornersConfirmedByUser: true, assessment: "user-confirmed-before-upload" },
  blocks: [{ text: "表 10. 肥料 入 出 庫 紀錄\n資 材 名稱 : 苦土 石灰 廠商 : 資礦 供 應 商 : 豐公農業資材行 包裝 容量 : 25 公斤\n資 材 名稱 : 硫酸鉀 廠商 : 東成\n115年5月10日 購入量 15包 使用量 5包 剩餘量 10包", confidence: 0.9 }]
});
assert.equal(inventoryDraft.fields.recordType[0].value, "purchase", "肥料入出庫表應分類為資材庫存，不可當成施肥紀錄");
assert.ok(inventoryDraft.materialInventory, "肥料入出庫表必須建立獨立庫存草稿");
assert.deepEqual(inventoryDraft.materialInventory.materials.map(item => item.value), ["苦土石灰", "硫酸鉀"]);
assert.ok(inventoryDraft.materialInventory.suppliers.some(item => item.value.includes("豐公農業資材行")));
assert.ok(inventoryDraft.materialInventory.manufacturers.some(item => item.value === "東成"), JSON.stringify(inventoryDraft.materialInventory.manufacturers));
assert.equal(inventoryDraft.materialInventory.l3Mapping, "unconfirmed", "未取得 L3 欄位規格前不得宣稱可直接上傳");
assert.equal(inventoryDraft.materialInventory.manualReviewRequired, true);

const pastedEquipmentRows = O.findEquipmentMaintenanceRows([{ id: "paste", text: "民國115/2/23 ☑噴霧機 ☑清潔\n民國115/3/10 ☑割草機 ☑保養", confidence: 1 }]);
assert.equal(pastedEquipmentRows.length, 2, "同一段 OCR 原文中的多個日期也必須拆成多筆");
assert.deepEqual(pastedEquipmentRows[0].equipment.filter(item => item.selected).map(item => item.value), ["噴霧機"]);
assert.deepEqual(pastedEquipmentRows[1].equipment.filter(item => item.selected).map(item => item.value), ["割草機"]);

const inheritedYearRows = O.findEquipmentMaintenanceRows([
  { id: "row-a", text: "115 2月23日 ☑噴霧機 ☑清潔", confidence: 1 },
  { id: "row-b", text: "3月10日 ☑割草機 ☑保養", confidence: 1 },
  { id: "background", text: "新聞預告 8月27日上映", confidence: 1 }
]);
assert.deepEqual(inheritedYearRows.map(row => row.date[0].value), ["2026-02-23", "2026-03-10"], "後續列省略年份時沿用同頁最近年份並保留人工確認");

console.log("表單 OCR 核心：品質閘門、候選解析與人工確認規則通過");
