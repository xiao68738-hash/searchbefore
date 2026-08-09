const assert = require("node:assert/strict");
const UI = require("../form-ocr-ui.js");

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
