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

const inventoryRowHtml = UI.materialInventoryRowHtml(0, {
  materials: [{ value: "苦土石灰" }, { value: "硫酸鉀" }],
  manufacturers: [{ value: "東成" }],
  suppliers: [{ value: "測試供應商" }],
  packageCapacities: [{ value: "25 公斤" }],
  dates: [{ value: "2026-05-10" }, { value: "2026-05-20" }]
});
assert.doesNotMatch(inventoryRowHtml, /\sselected(?:\s|>)/, "缺少同列證據時不得依索引預選資材、供應商或日期");
assert.doesNotMatch(inventoryRowHtml, /type="date"[^>]*value=/, "缺少同列證據時日期輸入必須保持空白");
assert.match(inventoryRowHtml, /ocr-inventory-date-candidate/, "日期候選仍應提供給使用者逐筆選擇");

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
