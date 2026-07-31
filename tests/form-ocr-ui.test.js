const assert = require("node:assert/strict");
const UI = require("../form-ocr-ui.js");

assert.equal(UI.safePayload({ protocolVersion: 1, blocks: [{ text: "番茄" }] }).protocolVersion, 1);
assert.equal(UI.safePayload({ protocolVersion: 2, blocks: [] }), null, "未知協定版本不可接收");
assert.equal(UI.safePayload({ protocolVersion: 1, imageData: "abc" }), null, "影像欄位不可進入網頁草稿");
assert.equal(UI.safePayload({ protocolVersion: 1, blocks: [{ text: "data:image/jpeg;base64,abc" }] }), null, "Base64 影像不可混入辨識文字");
assert.ok(UI.TRUSTED_ORIGINS.includes("https://searchbefore.tw"));
assert.ok(UI.TRUSTED_ORIGINS.includes("android://tw.searchbefore.app"));

console.log("表單 OCR 介面：來源白名單與禁止傳送影像規則通過");
