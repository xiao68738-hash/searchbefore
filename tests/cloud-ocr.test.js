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
assert.equal(sandbox.window.PQC_PUBLIC_CONFIG.features.formOcr, "development", "OCR 只能以 development 測試狀態呈現");
assert.match(sandbox.window.PQC_PUBLIC_CONFIG.ocr.cloud.endpoint, /^https:\/\/searchbefore-ocr-[^/]+\.a\.run\.app\/v1\/ocr$/, "development 測試端點必須是固定的 HTTPS Cloud Run OCR 路徑");
assert.equal(sandbox.window.PQC_PUBLIC_CONFIG.ocr.cloud.verification.required, true, "OCR 測試必須要求驗證碼");
assert.equal(UI.validCloudEndpoint("http://example.com/v1/ocr"), "", "OCR 端點必須使用 HTTPS");
assert.equal(UI.validCloudEndpoint("https://example.com/not-ocr"), "", "OCR 端點路徑必須固定為 /v1/ocr");
assert.match(UI.validCloudEndpoint("https://ocr.example.com/v1/ocr"), /^https:\/\/ocr\.example\.com\/v1\/ocr/);
const firstRequestId = UI.cloudRequestId();
const secondRequestId = UI.cloudRequestId();
assert.match(firstRequestId, /^ocr-[A-Za-z0-9-]+$/, "Cloud OCR 必須產生後端允許的請求識別碼");
assert.notEqual(firstRequestId, secondRequestId, "每次 Cloud OCR 請求必須使用不同識別碼");

assert.match(uiSource, /cloudOcrConsent/, "傳送照片前必須取得單次明確同意");
assert.match(uiSource, /Authorization: "Bearer " \+ token/, "雲端 OCR 必須附 Firebase 登入權杖");
assert.match(uiSource, /headers\["X-OCR-Test-Code"\] = testCode/, "雲端 OCR 必須把本次輸入的測試驗證碼交由後端再次驗證");
assert.match(uiSource, /let ocrVerificationCode = ""/, "測試驗證碼只能保存在目前頁面的記憶體中");
assert.doesNotMatch(uiSource, /sessionStorage\.setItem\([^\n]*ocrVerificationCode/, "不得把測試驗證碼明文寫入 sessionStorage");
assert.match(uiSource, /function cloudRequestId\(\)/, "Cloud OCR 請求識別碼函式不可遺漏");
assert.match(uiSource, /body\.append\("request_id", String\(requestId \|\| cloudRequestId\(\)\)\)/, "雲端 OCR 必須送出後端必填的請求識別碼");
assert.match(uiSource, /credentials: "omit"/, "OCR 請求不得附帶瀏覽器 Cookie");
assert.match(uiSource, /referrerPolicy: "no-referrer"/, "OCR 請求不得傳送來源路徑");
assert.match(uiSource, /receiveScanResult\(payload\)/, "雲端結果仍必須走相同安全草稿檢查");
assert.match(uiSource, /ocrVerificationCode/, "OCR 必須提供驗證碼入口");
assert.match(uiSource, /unlockOcr/, "OCR 必須提供解鎖流程");
assert.match(backendSource, /await image\.read\(MAX_UPLOAD_BYTES \+ 1\)/, "後端必須限制上傳大小");
assert.match(backendSource, /retention.*not-stored/s, "回應必須聲明原圖不保存");
assert.match(backendSource, /coordinateSpace.*normalized/s, "後端必須聲明文字座標使用正規化座標系");
assert.match(backendSource, /wordGeometry.*True/s, "後端必須標示回應含單字層級位置");
assert.match(securitySource, /verify_id_token/, "後端必須驗證 Firebase ID token");
assert.match(securitySource, /UserRateLimiter/, "後端必須限制單一帳號的短時間請求量");

console.log("Google Cloud Vision OCR：development 驗證碼閘門、登入驗證、單次同意與不上傳 Cookie 測試通過");
