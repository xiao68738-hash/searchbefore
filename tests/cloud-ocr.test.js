const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const UI = require(path.join(root, "form-ocr-ui.js"));
const uiSource = fs.readFileSync(path.join(root, "form-ocr-ui.js"), "utf8");
const configSource = fs.readFileSync(path.join(root, "service-config.js"), "utf8");
const backendSource = fs.readFileSync(path.join(root, "cloud-ocr-service", "app", "main.py"), "utf8");
const securitySource = fs.readFileSync(path.join(root, "cloud-ocr-service", "app", "security.py"), "utf8");

const sandbox = { window: {} };
vm.runInNewContext(configSource, sandbox, { filename: "service-config.js" });
assert.equal(sandbox.window.PQC_PUBLIC_CONFIG.ocr.provider, "google-cloud-vision", "OCR 供應者必須切換為 Google Cloud Vision");
assert.equal(sandbox.window.PQC_PUBLIC_CONFIG.features.formOcr, "hidden", "雲端服務未部署前不得顯示正式前端");
assert.equal(sandbox.window.PQC_PUBLIC_CONFIG.ocr.cloud.endpoint, "", "未驗收的雲端網址必須保持空白");
assert.equal(UI.validCloudEndpoint("http://example.com/v1/ocr"), "", "OCR 端點必須使用 HTTPS");
assert.equal(UI.validCloudEndpoint("https://example.com/not-ocr"), "", "OCR 端點路徑必須固定為 /v1/ocr");
assert.match(UI.validCloudEndpoint("https://ocr.example.com/v1/ocr"), /^https:\/\/ocr\.example\.com\/v1\/ocr/);

assert.match(uiSource, /cloudOcrConsent/, "傳送照片前必須取得單次明確同意");
assert.match(uiSource, /Authorization: "Bearer " \+ token/, "雲端 OCR 必須附 Firebase 登入權杖");
assert.match(uiSource, /credentials: "omit"/, "OCR 請求不得附帶瀏覽器 Cookie");
assert.match(uiSource, /referrerPolicy: "no-referrer"/, "OCR 請求不得傳送來源路徑");
assert.match(uiSource, /receiveScanResult\(payload\)/, "雲端結果仍必須走相同安全草稿檢查");
assert.match(backendSource, /await image\.read\(MAX_UPLOAD_BYTES \+ 1\)/, "後端必須限制上傳大小");
assert.match(backendSource, /retention.*not-stored/s, "回應必須聲明原圖不保存");
assert.match(securitySource, /verify_id_token/, "後端必須驗證 Firebase ID token");
assert.match(securitySource, /UserRateLimiter/, "後端必須限制單一帳號的短時間請求量");

console.log("Google Cloud Vision OCR：預設隱藏、登入驗證、單次同意與不上傳 Cookie 測試通過");
