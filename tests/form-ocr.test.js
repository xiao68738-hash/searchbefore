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
assert.equal(draft.routeDecision.status, "unknown", "沒有足夠表單標記時不得自動選第一名");
assert.equal(draft.intermediateDraftSchemaVersion, 1);
assert.equal(draft.activities.length, 1, "一般 OCR 候選應建立一筆標準中介活動");
assert.equal(draft.activities[0].status, "pending-confirmation");
assert.equal(draft.activities[0].autoCommitAllowed, false, "OCR 中介草稿永遠不得自動提交");
assert.equal(draft.activities[0].l3UploadReady, false, "中介草稿不代表已完成 L3 映射");
const standardDateDetail = draft.activities[0].details.find(item => item.key === "date");
assert.equal(standardDateDetail.value, null, "候選值必須待人工確認，不得直接成為正式值");
assert.equal(standardDateDetail.confirmation.state, "pending");
assert.equal(standardDateDetail.candidates[0].value, "2026-07-30");
assert.ok(standardDateDetail.candidates[0].evidence[0].blockId, "每個欄位候選必須保留來源證據");
assert.ok(standardDateDetail.confidence > 0);
assert.equal(O.canCommit(draft, { date: "2026-07-30", crop: "番茄", recordType: "cultivation" }), false, "未知文件未人工確認用途前不得帶入");
assert.equal(O.canCommit(draft, {
  date: "2026-07-30",
  plotId: "plot-1",
  crop: "番茄",
  recordType: "cultivation",
  routeConfirmed: true,
  details: { activity: "灌溉" }
}), true);
assert.equal(O.canCommit(draft, { date: "2026-07-30", crop: "番茄" }), false);
assert.equal(O.canCommit(draft, { date: "2026-07-30", crop: "番茄", recordType: "pesticide" }), false, "用藥草稿缺少藥劑不可帶入");
assert.equal(O.canCommit(draft, { date: "2026-07-30", crop: "番茄", recordType: "pesticide", material: "亞滅培", routeConfirmed: true }), true);

const missingCultivation = O.validateConfirmedFields({
  date: "2026-07-30",
  plotId: "plot-1",
  recordType: "cultivation",
  details: {}
});
assert.equal(missingCultivation.ok, false);
assert.ok(missingCultivation.missing.some(item => item.field === "details.activity" && item.message.includes("作業內容")), "缺欄位必須提供可直接顯示的標籤與訊息");

const fertilizerValidation = O.validateConfirmedFields({
  date: "2026-07-30",
  plotId: "plot-1",
  recordType: "fertilizer",
  details: { materialName: "有機質肥料", quantity: "20", unit: "kg" }
});
assert.equal(fertilizerValidation.ok, true);

const harvestValidation = O.validateConfirmedFields({
  date: "2026-07-30",
  plotId: "plot-1",
  recordType: "harvest",
  quantity: 0,
  unit: "kg"
});
assert.equal(harvestValidation.ok, true, "正式紀錄允許 0，但仍必須明確提供數量與單位");

const postharvestValidation = O.validateConfirmedFields({
  date: "2026-07-30",
  plotId: "plot-1",
  recordType: "postharvest",
  details: { process: "清洗", quantity: "10" }
});
assert.equal(postharvestValidation.ok, true);
assert.ok(postharvestValidation.warnings.some(item => item.code === "postharvest-quantity-without-unit"));

const purchaseValidation = O.validateConfirmedFields({
  date: "2026-07-30",
  plotId: "plot-1",
  recordType: "materialPurchase",
  details: { category: "肥料", materialName: "苦土石灰", supplier: "農業資材行", quantity: "15", unit: "包" }
});
assert.equal(purchaseValidation.ok, true, "資材購入依正式紀錄要求田區，但不應強制填 crop");
assert.equal(purchaseValidation.missing.some(item => item.field === "crop"), false);

const ambiguousTypes = O.detectFormTypes("施肥別 基肥 追肥 採收紀錄 採收日期 採收量");
assert.equal(O.decideDocumentRoute(ambiguousTypes).status, "ambiguous", "第一、二名同分時必須停止自動路由");

const weakLedgerDraft = O.createDraft({
  source: "google-cloud-vision",
  quality: { width: 1600, height: 2200, cornersConfirmedByUser: true, assessment: "user-confirmed-before-upload" },
  blocks: [{ text: "表 10 肥料入出庫紀錄 購入量\n背景報紙：肥料市場成長新聞", confidence: 0.82 }]
});
assert.equal(weakLedgerDraft.routeDecision.status, "unknown", "表 10 缺少至少兩個固定數量欄頭時不得啟用庫存解析");
assert.equal(weakLedgerDraft.materialInventory, null, "弱表頭不得建立資材庫存專用草稿");

const ambiguousParserDraft = O.createDraft({
  source: "google-cloud-vision",
  quality: { width: 1600, height: 2200, cornersConfirmedByUser: true, assessment: "user-confirmed-before-upload" },
  blocks: [{ text: "施肥別 基肥 追肥 採收紀錄 採收日期 採收量", confidence: 0.88 }]
});
assert.equal(ambiguousParserDraft.routeDecision.status, "ambiguous");
assert.equal(ambiguousParserDraft.materialInventory, null);
assert.equal(ambiguousParserDraft.selfInspection, null);
assert.deepEqual(ambiguousParserDraft.recordGroups, [], "ambiguous 文件不得啟用任何固定表單專用解析器");

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

const geometryDraft = O.createDraft({
  source: "google-cloud-vision",
  quality: { width: 1800, height: 2400, cornersConfirmedByUser: true, assessment: "user-confirmed-before-upload" },
  layout: { version: 1, coordinateSpace: "normalized", indexBase: 0, wordGeometry: true },
  rowCandidates: [{
    id: "row-1",
    source: { pageIndex: 0, regionIndex: 0 },
    text: "表10 肥料入出庫紀錄 民國115/5/20 購入量 15包",
    confidence: 0.92,
    box: { left: 0.08, top: 0.08, right: 0.85, bottom: 0.25 },
    cellCandidates: [
      { id: "cell-1", text: "民國115/5/20", confidence: 0.91, box: { left: 0.1, top: 0.1, right: 0.3, bottom: 0.14 }, wordIds: ["cloud-1-w1"] },
      { id: "cell-2", text: "購入量 15包", confidence: 0.88, box: { left: 0.31, top: 0.1, right: 0.6, bottom: 0.14 }, wordIds: ["cloud-1-w2", "../bad"] },
      { id: "../unsafe-cell", text: "不得保留", confidence: 1 }
    ]
  }],
  rowCandidatesTruncated: false,
  blocks: [{
    id: "cloud-1",
    text: "表10 肥料入出庫紀錄 民國115/5/20 購入量 15包",
    confidence: 0.94,
    box: { left: 0.1, top: 0.1, right: 0.8, bottom: 0.2 },
    blockBox: { left: 0.08, top: 0.08, right: 0.85, bottom: 0.25 },
    source: { pageIndex: 0, blockIndex: 1, paragraphIndex: 2, rowCandidateId: "row-1", cellCandidateIds: ["cell-1", "cell-2", "../bad"] },
    words: [{
      id: "cloud-1-w1",
      text: "表10",
      confidence: 0.96,
      box: { left: 0.1, top: 0.1, right: 0.18, bottom: 0.14 },
      detectedBreak: { type: "SPACE", isPrefix: false }
    }]
  }]
}, {}, {
  sourceImageId: "ocr-source-1234abcd",
  fileName: "肥料入出庫.jpg",
  sourceIndex: 2,
  status: "recognized",
  mimeType: "image/jpeg",
  sizeBytes: 2480123,
  lastModified: 1786200000000,
  imageData: "不得保存"
});
assert.equal(geometryDraft.layout.coordinateSpace, "normalized");
assert.equal(geometryDraft.blocks[0].source.blockIndex, 1);
assert.equal(geometryDraft.blocks[0].source.rowCandidateId, "row-1");
assert.deepEqual(geometryDraft.blocks[0].source.cellCandidateIds, ["cell-1", "cell-2"], "只保留有界且安全的幾何候選識別碼");
assert.equal(geometryDraft.rowCandidates[0].id, "row-1", "後端幾何列候選應安全保留供人工追溯");
assert.deepEqual(geometryDraft.rowCandidates[0].cellCandidates.map(item => item.id), ["cell-1", "cell-2"]);
assert.deepEqual(geometryDraft.rowCandidates[0].cellCandidates[1].wordIds, ["cloud-1-w2"], "列／格候選不得保留不安全的來源識別碼");
assert.deepEqual(geometryDraft.activities[0].source.rowCandidateIds, ["row-1"], "只有明確附著於欄位證據的列候選才可連到活動");
assert.deepEqual(geometryDraft.activities[0].source.cellCandidateIds, ["cell-1", "cell-2"]);
assert.equal(geometryDraft.blocks[0].words[0].detectedBreak.type, "SPACE");
assert.equal(geometryDraft.sourceImage.sourceImageId, "ocr-source-1234abcd");
assert.equal(Object.hasOwn(geometryDraft.sourceImage, "imageData"), false, "來源追溯不得夾帶照片內容");

const manySourceRows = Array.from({ length: 251 }, (_, rowIndex) => ({
  id: "source-row-" + rowIndex,
  source: { pageIndex: 0, regionIndex: 0 },
  text: "候選列 " + rowIndex,
  confidence: 0.8,
  cellCandidates: Array.from({ length: rowIndex === 0 ? 25 : 1 }, (_, cellIndex) => ({
    id: "source-row-" + rowIndex + "-cell-" + cellIndex,
    text: "候選格 " + cellIndex,
    confidence: 0.8,
    wordIds: ["word-" + rowIndex + "-" + cellIndex]
  }))
}));
const boundedSourceDraft = O.createDraft({
  source: "google-cloud-vision",
  quality: { width: 1800, height: 2400, cornersConfirmedByUser: true, assessment: "user-confirmed-before-upload" },
  blocks: [{ id: "source-limit", text: "栽培作業紀錄 民國115/5/20", confidence: 0.9 }],
  rowCandidates: manySourceRows
});
assert.equal(boundedSourceDraft.rowCandidates.length, 250, "中介草稿只保留有界的來源列候選");
assert.equal(boundedSourceDraft.rowCandidates[0].cellCandidates.length, 20, "每列來源格候選也必須有界");
assert.equal(boundedSourceDraft.rowCandidatesTruncated, true);
assert.equal(boundedSourceDraft.activities[0].autoCommitAllowed, false, "幾何列候選再完整也不可自動提交");
assert.equal(boundedSourceDraft.activities[0].l3UploadReady, false, "幾何列候選不等於完成 L3 欄位映射");

const reviewOnlyValidation = O.validateDraftForReview(draft, {
  date: "2026-07-30",
  recordType: "fertilizer",
  routeConfirmed: true
});
assert.equal(reviewOnlyValidation.ok, true, "帶入人工整理只需最低安全欄位，不得誤用正式儲存的完整門檻");
assert.ok(reviewOnlyValidation.warnings.some(item => item.code === "crop-not-prefilled"));
assert.equal(O.validateDraft(draft, {
  date: "2026-07-30",
  recordType: "fertilizer",
  routeConfirmed: true
}).ok, false, "正式儲存仍必須通過各類型完整欄位檢查");

const pesticideDraft = O.createDraft({
  quality: { width: 1800, height: 2400, documentCoverage: 0.9, sharpness: 0.9, glareRatio: 0, skewDegrees: 0, cornersDetected: true },
  blocks: [{ text: "表11 病蟲害防治或環境消毒資材施用紀錄\n使用日期 民國115年7月30日\n田區代號 A+B區\n作物 番茄\n防治對象 葉蟎\n資材名稱 亞滅培\n稀釋倍數 4000倍\n安全採收期 6天\n操作人員 王小明", confidence: 0.9 }]
}, { crops: ["番茄"], materials: ["亞滅培"], targets: ["葉蟎"] });
assert.equal(pesticideDraft.fields.recordType[0].value, "pesticide");
assert.equal(pesticideDraft.fields.fieldPlot[0].value, "A+B區");
assert.equal(pesticideDraft.fields.target[0].value, "葉蟎");
assert.equal(pesticideDraft.fields.safetyInterval[0].value, 6);
assert.equal(pesticideDraft.fields.operator[0].value, "王小明");
const pesticideValidation = O.validateDraft(pesticideDraft, {
  date: "2026-07-30",
  crop: "番茄",
  recordType: "pesticide",
  material: "亞滅培",
  target: "葉蟎",
  dilution: "4000"
});
assert.equal(pesticideValidation.ok, true);
assert.equal(pesticideValidation.mappingPending, true, "L3 尚未映射必須明確回報，不能視為已可上傳");
assert.ok(pesticideValidation.warnings.some(item => item.code === "l3-mapping-pending"));

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
assert.equal(equipmentDraft.activities.length, 2, "設備表每一列都應轉為獨立中介活動");
assert.deepEqual(equipmentDraft.activities[0].details.find(item => item.key === "equipment").candidates.map(item => item.value), ["噴霧機", "割草機"]);
assert.equal(equipmentDraft.activities[0].details.find(item => item.key === "equipment").value, null, "辨識到勾選也仍須人工確認");
assert.ok(equipmentDraft.activities.every(item => item.confirmation.state === "pending" && item.autoCommitAllowed === false));

const checklistTypes = O.detectFormTypes("農作物生產及出貨作業自我查核表\n查核項目 查核頻率 程度 備註\n確認日期：115.6.1 查核者：王小明");
assert.equal(checklistTypes[0].value, "selfInspection", "查核表不得誤判成田間作業紀錄");

const noisyChecklistDraft = O.createDraft({
  source: "google-cloud-vision",
  quality: { width: 1800, height: 2400, cornersConfirmedByUser: true, assessment: "user-confirmed-before-upload" },
  blocks: [{ text: "查核項目 查核頻率 程度 備註 確認日期 查核者\n3.4.7 肥料施用紀錄完整性\n3.4.9 肥料入出庫管理紀錄\n背景報紙：採收與包裝新聞", confidence: 0.83 }]
});
assert.equal(noisyChecklistDraft.routeDecision.type, "selfInspection", "查核題目提及施肥、入出庫或採收時仍必須走備查文件");
assert.equal(noisyChecklistDraft.route.route, "reference-only");
assert.equal(noisyChecklistDraft.routeDecision.evidenceLevel, "fixed-form-header");

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
assert.equal(inventoryDraft.route.route, "material-ledger");
assert.equal(inventoryDraft.route.destination, "material-inventory-review");
assert.equal(O.canCommit(inventoryDraft, { date: "2026-05-20", crop: "番茄", recordType: "materialPurchase" }), false, "完整庫存表只能走庫存覆核，不可誤帶一般紀錄表單");
assert.ok(inventoryDraft.materialInventory, "肥料入出庫表必須建立獨立庫存草稿");
assert.deepEqual(inventoryDraft.materialInventory.materials.map(item => item.value), ["苦土石灰", "硫酸鉀"]);
assert.ok(inventoryDraft.materialInventory.suppliers.some(item => item.value.includes("豐公農業資材行")));
assert.ok(inventoryDraft.materialInventory.manufacturers.some(item => item.value === "東成"), JSON.stringify(inventoryDraft.materialInventory.manufacturers));
assert.equal(inventoryDraft.materialInventory.l3Mapping, "unconfirmed", "未取得 L3 欄位規格前不得宣稱可直接上傳");
assert.equal(inventoryDraft.materialInventory.manualReviewRequired, true);
assert.equal(inventoryDraft.activities.length, 2, "辨識到多個資材時應建立多筆待配對活動，而不是壓成單筆");
assert.ok(inventoryDraft.activities.every(item => item.associationState === "pending"), "缺少可靠列關係時不得猜測資材與日期的配對");
assert.ok(inventoryDraft.activities.every(item => item.details.every(detail => detail.value === null && detail.confirmation.state === "pending")));
assert.ok(inventoryDraft.activities.every(item => item.l3UploadReady === false && item.autoCommitAllowed === false));

const noisyInventoryDraft = O.createDraft({
  source: "google-cloud-vision",
  quality: { width: 1800, height: 2400, cornersConfirmedByUser: true, assessment: "user-confirmed-before-upload" },
  blocks: [{ text: "表 10. 肥料入出庫紀錄\n資材名稱 供應商\n日期 購入量 使用量 剩餘量\n背景報紙：採收包裝與病蟲害防治", confidence: 0.82 }]
});
assert.equal(noisyInventoryDraft.routeDecision.type, "purchase", "表 10 固定表名與欄頭不得被背景文字改分流");
assert.equal(noisyInventoryDraft.route.route, "material-ledger");

function ledgerCell(id, text, left, right, confidence = 0.92) {
  return { id, text, confidence, box: { left, top: 0.2, right, bottom: 0.22 }, wordIds: [id + "-w"] };
}
function ledgerRow(id, top, cells, options = {}) {
  return {
    id,
    source: { pageIndex: options.pageIndex || 0, regionIndex: options.regionIndex || 0 },
    text: cells.map(item => item.text).join(" "),
    confidence: 0.9,
    box: { left: Math.min(...cells.map(item => item.box.left)), top, right: Math.max(...cells.map(item => item.box.right)), bottom: top + 0.02 },
    cellCandidates: cells.map(item => ({ ...item, box: { ...item.box, top, bottom: top + 0.02 } })),
    cellsTruncated: options.cellsTruncated === true
  };
}

const ledgerGeometryDraft = O.createDraft({
  source: "google-cloud-vision",
  quality: { width: 1800, height: 2400, cornersConfirmedByUser: true, assessment: "user-confirmed-before-upload" },
  blocks: [{ id: "ledger-title", text: "表 10. 肥料入出庫紀錄\n日期 購入量 使用量 剩餘量", confidence: 0.93 }],
  layout: { version: 1, coordinateSpace: "normalized", indexBase: 0, wordGeometry: true, rowCandidateMethod: "geometry-only", semanticInference: false },
  rowCandidates: [
    ledgerRow("ledger-header", 0.2, [
      ledgerCell("h-date", "日期", 0.09, 0.13), ledgerCell("h-purchase", "購入量", 0.17, 0.23),
      ledgerCell("h-used", "使用量", 0.25, 0.31), ledgerCell("h-remaining", "剩餘量", 0.33, 0.39)
    ]),
    ledgerRow("ledger-entry-1", 0.25, [
      ledgerCell("e1-date", "115/5/10", 0.09, 0.14), ledgerCell("e1-purchase", "15包", 0.17, 0.23),
      ledgerCell("e1-remaining", "15包", 0.33, 0.39)
    ]),
    ledgerRow("ledger-entry-2", 0.3, [
      ledgerCell("e2-date", "115/5/20", 0.09, 0.14), ledgerCell("e2-used", "15包", 0.25, 0.31),
      ledgerCell("e2-remaining", "0", 0.33, 0.39)
    ])
  ]
});
assert.equal(ledgerGeometryDraft.materialInventory.schemaVersion, 2);
assert.equal(ledgerGeometryDraft.materialInventory.panels.length, 1, "固定四欄表頭可建立一個可追溯的小表格候選");
assert.equal(ledgerGeometryDraft.materialInventory.panels[0].entries.length, 2, "同一小表格的兩列應分開整理");
assert.ok(ledgerGeometryDraft.materialInventory.panels[0].entries.every(item => item.associationState === "row-evidence"));
assert.equal(ledgerGeometryDraft.materialInventory.panels[0].entries[0].details.usedAmount.candidates.length, 0, "空白使用量必須維持空白，不得補成零");
assert.equal(ledgerGeometryDraft.materialInventory.panels[0].entries[1].details.remainingAmount.candidates[0].value, 0, "原圖明確辨識到零時才能保留零候選");
assert.ok(ledgerGeometryDraft.activities.every(item => item.details.every(detail => detail.value === null)), "同列分組只提供候選，仍不得自動確認欄位值");
assert.ok(ledgerGeometryDraft.activities.every(item => item.autoCommitAllowed === false && item.l3UploadReady === false));

const truncatedLedgerAssociation = O.associateMaterialLedgerRows([
  ledgerRow("ledger-header-truncated", 0.2, [
    ledgerCell("th-date", "日期", 0.09, 0.13), ledgerCell("th-purchase", "購入量", 0.17, 0.23),
    ledgerCell("th-used", "使用量", 0.25, 0.31), ledgerCell("th-remaining", "剩餘量", 0.33, 0.39)
  ]),
  ledgerRow("ledger-entry-truncated", 0.25, [
    ledgerCell("te-date", "115/5/10", 0.09, 0.14), ledgerCell("te-purchase", "15包", 0.17, 0.23)
  ], { cellsTruncated: true })
], true, { sourceImageId: "photo-1" });
assert.equal(truncatedLedgerAssociation.completeness, "partial");
assert.equal(truncatedLedgerAssociation.panels[0].entries[0].associationState, "pending", "來源格遭截斷時不得視為可靠同列關聯");
assert.ok(truncatedLedgerAssociation.panels[0].entries[0].reasons.includes("row-cells-truncated"));

const noisyEquipmentDraft = O.createDraft({
  source: "google-cloud-vision",
  quality: { width: 1800, height: 2400, cornersConfirmedByUser: true, assessment: "user-confirmed-before-upload" },
  blocks: [{ text: "表 18 器具／機械／設備之保養、維修、校正及清潔管理紀錄\n日期 作業內容 記錄人\n背景報紙：肥料使用量與採收", confidence: 0.82 }]
});
assert.equal(noisyEquipmentDraft.routeDecision.type, "equipmentMaintenance", "表 18 固定表名與管理作業欄不得被背景文字改分流");
assert.equal(noisyEquipmentDraft.route.route, "supporting-record");

const boundedEquipmentDraft = O.createDraft({
  source: "google-cloud-vision",
  quality: { width: 1800, height: 2400, cornersConfirmedByUser: true, assessment: "user-confirmed-before-upload" },
  blocks: [{ id: "equipment-title", text: "表18 器具/機械/設備之保養、維修、校正及清潔管理紀錄 作業內容", confidence: 1 }].concat(
    Array.from({ length: 45 }, (_, index) => ({
      id: "bounded-row-" + (index + 1),
      text: "民國115/" + (Math.floor(index / 28) + 1) + "/" + ((index % 28) + 1) + " ☑噴霧機 ☑清潔",
      confidence: 0.8
    }))
  )
});
assert.equal(boundedEquipmentDraft.activities.length, 30, "單份文件最多建立 30 筆中介活動，避免異常 OCR 撐大記憶體");
boundedEquipmentDraft.activities.forEach(activity => {
  assert.ok(activity.details.length <= 40);
  activity.details.forEach(detail => {
    assert.ok(detail.candidates.length <= 12);
    assert.ok(detail.evidence.length <= 4);
  });
});

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
