const assert = require("node:assert/strict");
const fs = require("node:fs");
const UI = require("../form-ocr-ui.js");

const uiSource = fs.readFileSync(require.resolve("../form-ocr-ui.js"), "utf8");
assert.equal(uiSource.includes("Google Cloud Vision"), false, "前端不得顯示雲端辨識供應商品牌");

const validPayload = { type: UI.RESULT_TYPE, protocolVersion: 1, requestId: "ocr-test-1", blocks: [{ text: "番茄" }] };
assert.equal(UI.safePayload(validPayload).protocolVersion, 1);
assert.equal(UI.safePayload({ ...validPayload, protocolVersion: 2 }), null, "未知協定版本不可接收");
assert.equal(UI.safePayload({ ...validPayload, type: "OTHER_MESSAGE" }), null, "未知訊息類型不可接收");
assert.equal(UI.safePayload({ ...validPayload, requestId: "" }), null, "沒有請求識別碼的結果不可接收");
assert.equal(UI.safePayload({ ...validPayload, imageData: "abc" }), null, "影像欄位不可進入網頁草稿");
assert.equal(UI.safePayload({ ...validPayload, blocks: [{ text: "data:image/jpeg;base64,abc" }] }), null, "Base64 影像不可混入辨識文字");
assert.equal(UI.safePayload({ ...validPayload, sourceImage: { sourceImageId: "source-1", imageData: "abc" } }), null, "來源 metadata 仍不可夾帶影像內容");
assert.equal(UI.safePayload({ ...validPayload, blocks: Array.from({ length: 501 }, () => ({ text: "x" })) }), null, "不得接受超過後端安全上限的段落數");
assert.equal(UI.safePayload({ ...validPayload, blocks: [{ text: "x", words: Array.from({ length: 201 }, () => ({ text: "字" })) }] }), null, "不得接受超過單段安全上限的單字位置");
assert.equal(UI.safePayload({ ...validPayload, rowCandidates: Array.from({ length: 251 }, () => ({ id: "row" })) }), null, "不得接受超過安全上限的列候選");
assert.equal(UI.safePayload({ ...validPayload, rowCandidates: [{ id: "row", words: Array.from({ length: 101 }, () => ({ text: "字" })) }] }), null, "不得接受單列過多單字");
assert.equal(UI.safePayload({ ...validPayload, rowCandidates: [{ id: "row", cellCandidates: Array.from({ length: 21 }, () => ({ id: "cell" })) }] }), null, "不得接受單列過多儲存格候選");
assert.ok(UI.TRUSTED_ORIGINS.includes("https://searchbefore.tw"));
assert.ok(UI.TRUSTED_ORIGINS.includes("android://tw.searchbefore.app"));
assert.equal(UI.matchKey(" A＋B 區 "), "a+b區");
assert.equal(UI.dilutionCandidateLabel({ value: 1000, role: "actual" }), "1000 倍（本次實際使用）");
assert.equal(UI.dilutionCandidateLabel({ value: 2000, role: "reference" }), "2000 倍（標示／建議值，須人工確認）");
assert.equal(UI.dilutionCandidateLabel({ value: 800, role: "unlabeled" }), "800 倍（用途未標示）");
assert.match(UI.locationSeparationNotice({ workGroup: [{ value: "H區" }], landParcel: [{ value: "1234-5" }] }), /共同作業分區不等於正式田區或地號/);
assert.match(UI.operationalMeasurementNotice({ packageWeight: [{ value: 3, unit: "公斤" }], labelCount: [{ value: 100, unit: "張" }] }), /不可互相推算/);

const sourceFile = { name: "田間紀錄-01.jpg", size: 2480123, lastModified: 1786200000000, type: "image/jpeg" };
const sameSourceFile = { ...sourceFile };
const otherSourceFile = { ...sourceFile, lastModified: sourceFile.lastModified + 1 };
assert.equal(UI.sourceImageId(sourceFile), UI.sourceImageId(sameSourceFile), "同一來源檔案必須得到穩定識別碼");
assert.notEqual(UI.sourceImageId(sourceFile), UI.sourceImageId(otherSourceFile), "不同來源檔案不可共用識別碼");

const sourceMetadata = UI.sourceImageMetadata(sourceFile, 2, "recognized", "");
assert.deepEqual(
  {
    sourceImageId: sourceMetadata.sourceImageId,
    fileName: sourceMetadata.fileName,
    sourceIndex: sourceMetadata.sourceIndex,
    status: sourceMetadata.status,
    mimeType: sourceMetadata.mimeType,
    sizeBytes: sourceMetadata.sizeBytes,
    lastModified: sourceMetadata.lastModified
  },
  {
    sourceImageId: UI.sourceImageId(sourceFile),
    fileName: sourceFile.name,
    sourceIndex: 2,
    status: "recognized",
    mimeType: sourceFile.type,
    sizeBytes: sourceFile.size,
    lastModified: sourceFile.lastModified
  },
  "來源 metadata 必須保留檔名、穩定索引與處理狀態"
);
assert.equal(/base64|blob:|data:image/i.test(JSON.stringify(sourceMetadata)), false, "草稿來源 metadata 不得保存 Base64 或 Object URL");
const draftWithSource = UI.attachSourceImageMetadata(Object.freeze({ requestId: "ocr-test-1", fields: Object.freeze({}) }), sourceMetadata);
assert.equal(draftWithSource.sourceImage.sourceImageId, sourceMetadata.sourceImageId);
assert.equal(draftWithSource.sourceImage.status, "recognized");
assert.equal(Object.isFrozen(draftWithSource), true, "附加來源後的草稿仍須不可變");
assert.equal(Object.isFrozen(draftWithSource.sourceImage), true, "來源 metadata 仍須不可變");
assert.ok(UI.safePayload({ ...validPayload, sourceImage: sourceMetadata }), "純文字來源 metadata 可隨辨識結果傳遞");

const multiActivityDraft = Object.freeze({
  sourceImage: Object.freeze({ sourceImageId: "source-page-a", fileName: "多筆田間紀錄.jpg", sourceIndex: 3, status: "recognized" }),
  blocks: Object.freeze([
    Object.freeze({ id: "block-a", text: "115/08/01 除草" }),
    Object.freeze({ id: "block-b", text: "115/08/02 施肥" })
  ]),
  fields: Object.freeze({}),
  routeDecision: Object.freeze({ status: "exact", type: "cultivation", route: "farm", destination: "farm" }),
  activities: Object.freeze([
    Object.freeze({
      activityId: "row-high",
      confidence: 0.92,
      rowIndex: 0,
      sourceBlockIds: Object.freeze(["block-a"]),
      fields: Object.freeze({
        recordType: Object.freeze([{ value: "cultivation", confidence: 0.95 }]),
        date: Object.freeze([{ value: "2026-08-01", confidence: 0.94 }]),
        activity: Object.freeze([{ value: "除草", confidence: 0.91 }]),
        method: Object.freeze([{ value: "人工", confidence: 0.89 }])
      })
    }),
    Object.freeze({
      activityId: "row-low",
      confidence: 0.42,
      rowIndex: 1,
      sourceBlockIds: Object.freeze(["block-b"]),
      fields: Object.freeze({
        recordType: Object.freeze([{ value: "fertilizer", confidence: 0.41 }]),
        date: Object.freeze([{ value: "2026-08-02", confidence: 0.4 }]),
        activity: Object.freeze([{ value: "施肥", confidence: 0.43 }])
      })
    })
  ])
});
const normalizedActivities = UI.normalizeDraftActivities(multiActivityDraft);
assert.equal(normalizedActivities.length, 2, "多筆辨識結果須逐筆建立候選");
assert.equal(normalizedActivities[0].canPreselect, true, "較高信心候選可在逐筆核對頁預選");
assert.equal(normalizedActivities[1].canPreselect, false, "低信心候選不得預選欄位");
assert.equal(normalizedActivities[1].lowConfidence, true);
assert.equal(normalizedActivities[1].source.fileName, "多筆田間紀錄.jpg", "每筆須保留來源檔名");
assert.equal(normalizedActivities[1].source.sourceIndex, 3, "每筆須保留來源圖片索引");
assert.equal(normalizedActivities[1].source.rowIndex, 1, "每筆須保留來源列索引");

const standardSchemaDraft = Object.freeze({
  sourceImage: Object.freeze({ sourceImageId: "source-standard", fileName: "標準草稿.jpg", sourceIndex: 4, status: "recognized" }),
  blocks: Object.freeze([Object.freeze({ id: "standard-block", text: "115/8/1 施肥" })]),
  fields: Object.freeze({ recordType: Object.freeze([{ value: "fertilizer", confidence: 0.9 }]) }),
  routeDecision: Object.freeze({ status: "exact", type: "fertilizer", route: "production-record", destination: "farm-form" }),
  activities: Object.freeze([Object.freeze({
    id: "activity-standard",
    confidence: 0.91,
    source: Object.freeze({ sourceImageId: "source-standard", blockIds: Object.freeze(["standard-block"]), rowCandidateIds: Object.freeze([]) }),
    details: Object.freeze([
      Object.freeze({ key: "recordType", candidates: Object.freeze([{ value: "fertilizer", confidence: 0.91 }]) }),
      Object.freeze({ key: "date", candidates: Object.freeze([{ value: "2026-08-01", confidence: 0.9 }]) }),
      Object.freeze({ key: "materialName", candidates: Object.freeze([{ value: "硫酸鉀", confidence: 0.88 }]) })
    ])
  })])
});
const normalizedStandard = UI.normalizeDraftActivities(standardSchemaDraft);
assert.equal(normalizedStandard[0].fields.date[0].value, "2026-08-01", "標準 details[] 應轉成前端欄位候選");
assert.equal(normalizedStandard[0].fields.material[0].value, "硫酸鉀");
assert.equal(normalizedStandard[0].source.fileName, "標準草稿.jpg", "活動來源缺檔名時應繼承照片 metadata");
assert.deepEqual(normalizedStandard[0].source.sourceBlockIds, ["standard-block"]);
assert.equal(normalizedStandard[0].source.rowIndex, null, "沒有實際列證據時不得捏造列號");
assert.equal(UI.draftReviewMode(standardSchemaDraft), "singleReview", "單筆一般作業不增加多餘的候選清單步驟");
assert.equal(UI.draftReviewMode({ ...standardSchemaDraft, activities: [standardSchemaDraft.activities[0], standardSchemaDraft.activities[0]] }), "activityCandidates");
assert.equal(UI.draftReviewMode({ ...standardSchemaDraft, recordGroups: [{}] }), "equipmentMaintenance", "設備多列介面優先於通用候選清單");
assert.equal(UI.draftReviewMode({ ...standardSchemaDraft, routeDecision: { status: "exact", type: "purchase" }, fields: { recordType: [{ value: "purchase" }] }, materialInventory: {} }), "materialInventory", "入出庫專用介面優先於通用候選清單");

const highActivityDraft = UI.activityCandidateDraft(multiActivityDraft, 0);
const lowActivityDraft = UI.activityCandidateDraft(multiActivityDraft, 1);
assert.deepEqual(highActivityDraft.activities, [], "進入逐筆核對後不得再次展開整批候選");
assert.equal(highActivityDraft.blocks.length, 1, "逐筆核對只顯示該筆來源文字區塊");
assert.equal(highActivityDraft.blocks[0].id, "block-a");
assert.equal(highActivityDraft.sourceImage.sourceImageId, "source-page-a", "逐筆草稿須保留原圖追溯識別碼");
assert.equal(highActivityDraft.activityReview.canPreselect, true);
assert.equal(lowActivityDraft.routeDecision.status, "unknown", "低信心列不得直接沿用文件分類");
assert.equal(lowActivityDraft.activityReview.canPreselect, false);
assert.equal(lowActivityDraft.fields.activity[0].value, "施肥", "低信心內容仍可提供人工選擇，不得靜默丟棄");
assert.equal(UI.preselectedCandidate(highActivityDraft, highActivityDraft.fields.date).value, "2026-08-01");
assert.equal(UI.preselectedCandidate(lowActivityDraft, lowActivityDraft.fields.date), null, "低信心列必須從空白狀態核對");
assert.equal(UI.preselectedCandidate({}, [{ value: "低信心候選", confidence: 0.5 }]), null, "單筆文件的低信心候選不得預選");
assert.equal(UI.preselectedCandidate({}, [{ value: "缺信心候選" }]), null, "缺少信心證據的候選不得預選");
assert.equal(UI.preselectedCandidate({}, [{ value: "高信心候選", confidence: 0.9 }]).value, "高信心候選", "明確高信心候選仍可協助預選，但後續必須人工確認");

const reviewRows = [{
  id: "row-material-1",
  source: { pageIndex: 0, regionIndex: 0 },
  text: "115年5月10日 苦土石灰 購入15包",
  cellCandidates: []
}, {
  id: "row-material-2",
  source: { pageIndex: 0, regionIndex: 0 },
  text: "115年5月20日 硫酸鉀 使用15包",
  cellCandidates: []
}];
const inventoryRowHtml = UI.materialInventoryRowHtml(0, {
  materials: [{ value: "苦土石灰" }, { value: "硫酸鉀" }],
  manufacturers: [{ value: "東成" }],
  suppliers: [{ value: "測試供應商" }],
  packageCapacities: [{ value: "25 公斤" }],
  dates: [{ value: "2026-05-10" }, { value: "2026-05-20" }]
}, reviewRows);
assert.doesNotMatch(inventoryRowHtml, /\sselected(?:\s|>)/, "缺少同列證據時不得依索引預選資材、供應商或日期");
assert.doesNotMatch(inventoryRowHtml, /type="date"[^>]*value=/, "缺少同列證據時日期輸入必須保持空白");
assert.match(inventoryRowHtml, /ocr-inventory-date-candidate/, "日期候選仍應提供給使用者逐筆選擇");
assert.match(inventoryRowHtml, /人工新增／無來源列/, "每筆都必須能明確選擇沒有來源列的人工新增模式");
assert.match(inventoryRowHtml, /data-review-status="pending"/, "新列預設必須是尚未核對");
assert.match(inventoryRowHtml, /ocr-inventory-confirmed/, "每筆都必須各自核對");
assert.match(inventoryRowHtml, />略過</, "每筆都必須能略過而不是直接消失");

const sourceOptions = UI.sourceRowOptionList({ rowCandidates: reviewRows });
assert.doesNotMatch(sourceOptions, /\sselected(?:\s|>)/, "來源列不可預先指定");
assert.match(sourceOptions, /來源列 1/);
const rowBoundCandidates = [
  { value: "苦土石灰", evidence: [{ rowCandidateId: "row-material-1" }] },
  { value: "硫酸鉀", evidence: [{ rowCandidateId: "row-material-2" }] },
  { value: "購入15包", evidence: [] }
];
assert.deepEqual(
  UI.candidatesForSourceRow(rowBoundCandidates, { rowCandidates: reviewRows }, "row-material-1").map(item => item.value),
  ["苦土石灰", "購入15包"],
  "選擇來源列後只能縮小候選範圍，不應加入其他列內容"
);
const duplicatedValueWithExactEvidence = [{ value: "購入15包", evidence: [{ rowCandidateId: "row-material-1" }] }];
assert.deepEqual(
  UI.candidatesForSourceRow(duplicatedValueWithExactEvidence, {
    rowCandidates: reviewRows.map(row => ({ ...row, text: row.text + " 購入15包" }))
  }, "row-material-2"),
  [],
  "候選已有來源列證據時，即使另一列出現相同文字也不得跨列顯示"
);
const duplicatedDirectRowEvidence = [{ value: "15", rowCandidateId: "row-material-1" }];
assert.deepEqual(
  UI.candidatesForSourceRow(duplicatedDirectRowEvidence, {
    rowCandidates: reviewRows.map(row => ({ ...row, text: row.text + " 15" }))
  }, "row-material-2"),
  [],
  "候選直接帶有有效 rowCandidateId 時也只能精確匹配，不得因同值文字 fallback 到另一列"
);
assert.deepEqual(UI.candidatesForSourceRow(rowBoundCandidates, { rowCandidates: reviewRows }, ""), [], "未指定來源列時候選必須保持空白");
assert.deepEqual(UI.candidatesForSourceRow(rowBoundCandidates, { rowCandidates: reviewRows }, "manual-no-source-row"), [], "人工新增模式不得偷偷帶入辨識候選");

const panelRows = [{
  id: "panel-master",
  source: { pageIndex: 0, regionIndex: 0 },
  text: "資材名稱 苦土石灰 廠商 東成 供應商 農業資材行 包裝容量 25 公斤",
  box: { left: 0.05, top: 0.08, right: 0.45, bottom: 0.12 }
}, {
  id: "panel-header",
  source: { pageIndex: 0, regionIndex: 0 },
  text: "日期 購入量 使用量 剩餘量",
  box: { left: 0.05, top: 0.18, right: 0.45, bottom: 0.2 }
}, {
  id: "panel-entry-1",
  source: { pageIndex: 0, regionIndex: 0 },
  text: "115/5/10 15包 15包",
  box: { left: 0.05, top: 0.22, right: 0.45, bottom: 0.24 }
}, {
  id: "other-panel-entry",
  source: { pageIndex: 0, regionIndex: 1 },
  text: "115/5/10 15包 15包",
  box: { left: 0.55, top: 0.22, right: 0.95, bottom: 0.24 }
}];
const panelDraft = {
  id: "inventory-panel-1",
  source: { pageIndex: 0, regionIndex: 0, headerRowCandidateId: "panel-header" },
  panelBox: { left: 0.05, top: 0.18, right: 0.45, bottom: 0.4 },
  master: { source: { rowCandidateIds: ["panel-master"] } },
  entries: [{
    source: { rowCandidateId: "panel-entry-1" },
    details: {
      date: { candidates: [{ value: "2026-05-10", rowCandidateId: "panel-entry-1" }] },
      purchaseAmount: { candidates: [{ value: 15, unit: "包", rowCandidateId: "panel-entry-1" }] },
      usedAmount: { candidates: [] },
      remainingAmount: { candidates: [{ value: 15, unit: "包", rowCandidateId: "panel-entry-1" }] }
    }
  }]
};
assert.deepEqual(
  UI.materialInventoryPanelSourceRows(panelRows, panelDraft).map(row => row.id),
  ["panel-master"],
  "小表格共用資料來源只能列出核心明確綁定且同頁同區的列"
);
assert.deepEqual(UI.materialInventoryPanelSourceRows(panelRows, { ...panelDraft, master: { source: { rowCandidateIds: [] } } }), [], "共用資料沒有來源列證據時不得靠位置猜測其他列");
assert.deepEqual(
  UI.materialInventoryEntrySourceRows(panelRows, panelDraft.entries[0]).map(row => row.id),
  ["panel-entry-1"],
  "有精確來源證據的明細只可選該來源列"
);
assert.deepEqual(UI.materialInventoryEntrySourceRows(panelRows, {}), [], "沒有來源證據的明細不得列出其他 panel 的來源列");
const panelHtml = UI.materialInventoryPanelHtml(0, panelDraft, {
  materials: [{ value: "苦土石灰" }], manufacturers: [{ value: "東成" }], suppliers: [], packageCapacities: []
}, panelRows);
assert.doesNotMatch(panelHtml, /\sselected(?:\s|>)/, "panel 共用資料與明細候選一律不得預選");
assert.match(panelHtml, /data-inventory-panel[^>]*data-review-status="pending"/, "panel 共用資料預設未確認");
assert.match(panelHtml, /data-inventory-entry[^>]*data-review-status="pending"/, "panel 內每筆明細預設未確認");
assert.match(panelHtml, /ocr-inventory-panel-confirmed/, "共用資材資料必須單獨核對");
assert.match(panelHtml, /ocr-inventory-entry-confirmed/, "日期與進出庫明細必須逐筆核對");
assert.match(panelHtml, /略過整個小表格/, "panel 可整體略過");
assert.match(panelHtml, /toggleMaterialInventoryEntrySkipped/, "明細可逐筆略過");
assert.match(panelHtml, /人工新增／無來源列/, "兩層都保留人工新增／無來源列選項");
assert.doesNotMatch(panelHtml, /Google|Cloud|Vision|雲端供應商/i, "人工核對介面不得暴露辨識供應商");

const allReviewed = UI.rowReviewSummary([{ confirmed: true }, { skipped: true }]);
assert.equal(allReviewed.ok, true, "已核對或略過所有列後才可匯出");
assert.equal(allReviewed.confirmed.length, 1, "匯出只包含已核對且未略過的列");
assert.equal(allReviewed.skipped.length, 1);
assert.equal(UI.rowReviewSummary([{ confirmed: true }, {}]).ok, false, "仍有未核對列時必須阻擋匯出");
assert.equal(UI.rowReviewSummary([{ skipped: true }]).ok, false, "全部略過時不得產生空白匯出檔");

const twoLevelReviewed = UI.materialInventoryReviewSummary([{
  confirmed: true,
  entries: [{ confirmed: true }, { skipped: true }]
}, { skipped: true, entries: [{ confirmed: false }] }]);
assert.equal(twoLevelReviewed.ok, true, "已核對的 panel 內每筆明細皆核對或略過時才能匯出");
assert.equal(twoLevelReviewed.confirmedEntries.length, 1, "匯出摘要只保留已核對明細");
assert.equal(UI.materialInventoryReviewSummary([{ confirmed: false, entries: [{ confirmed: true }] }]).ok, false, "panel 共用資料未確認時必須阻擋匯出");
assert.equal(UI.materialInventoryReviewSummary([{ confirmed: true, entries: [{ confirmed: false }] }]).ok, false, "panel 內仍有未確認明細時必須阻擋匯出");
assert.equal(UI.materialInventoryReviewSummary([{ confirmed: true, entries: [{ skipped: true }] }]).ok, false, "保留的 panel 若沒有已核對明細應要求略過整個 panel");

assert.deepEqual(UI.missingReviewConfirmations({ crop: "番茄", material: "硫酸鉀" }, { type: true, date: true, crop: false, material: false }), ["作物", "藥劑／資材名稱"], "帶入已辨識的作物與資材前必須各自確認");
assert.deepEqual(UI.missingReviewConfirmations({ crop: "", material: "" }, { type: true, date: true }), [], "沒有候選值的選填欄位不應阻擋人工整理");

global.DATA = {
  番茄: {
    葉蟎: [{ name: "亞滅培", form: "SP", dilution: "4,000", phi: 6, moa: "IRAC 4A", bl: ["測試商品名"] }]
  }
};
const registrationMatches = UI.registeredPesticideMatches({ crop: "番茄", target: "葉蟎", material: "測試商品名", dilution: 4000, safetyInterval: 6 });
assert.equal(registrationMatches.length, 1, "商品名必須能回查到正式登記普通名稱");
assert.equal(registrationMatches[0].agent.name, "亞滅培");
assert.equal(UI.registeredPesticideMatches({ crop: "番茄", target: "葉蟎", material: "OCR 誤字" }).length, 0, "無法對回登記資料時不得帶入");
delete global.DATA;

console.log("表單 OCR 介面：來源白名單與禁止傳送影像規則通過");
