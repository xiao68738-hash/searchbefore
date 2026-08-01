const assert = require("node:assert/strict");
const UI = require("../form-ocr-ui.js");

const validPayload = { type: UI.RESULT_TYPE, protocolVersion: 1, requestId: "ocr-test-1", blocks: [{ text: "番茄" }] };
assert.equal(UI.safePayload(validPayload).protocolVersion, 1);
assert.equal(UI.safePayload({ ...validPayload, protocolVersion: 2 }), null, "未知協定版本不可接收");
assert.equal(UI.safePayload({ ...validPayload, type: "OTHER_MESSAGE" }), null, "未知訊息類型不可接收");
assert.equal(UI.safePayload({ ...validPayload, requestId: "" }), null, "沒有請求識別碼的結果不可接收");
assert.equal(UI.safePayload({ ...validPayload, imageData: "abc" }), null, "影像欄位不可進入網頁草稿");
assert.equal(UI.safePayload({ ...validPayload, blocks: [{ text: "data:image/jpeg;base64,abc" }] }), null, "Base64 影像不可混入辨識文字");
assert.ok(UI.TRUSTED_ORIGINS.includes("https://searchbefore.tw"));
assert.ok(UI.TRUSTED_ORIGINS.includes("android://tw.searchbefore.app"));
assert.equal(UI.matchKey(" A＋B 區 "), "a+b區");

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
