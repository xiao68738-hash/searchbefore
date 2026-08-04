const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const UI = require(path.join(root, "form-ocr-ui.js"));
const uiSource = fs.readFileSync(path.join(root, "form-ocr-ui.js"), "utf8");
const paddleSource = fs.readFileSync(path.join(root, "paddle-ocr-browser-entry.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const configSource = fs.readFileSync(path.join(root, "service-config.js"), "utf8");

delete global.PQC_PUBLIC_CONFIG;
assert.equal(UI.featureReleaseState("formOcr"), "hidden", "缺少設定時必須預設隱藏");

global.PQC_PUBLIC_CONFIG = { features: { formOcr: "development" } };
assert.equal(UI.featureReleaseState("formOcr"), "development");

global.PQC_PUBLIC_CONFIG.features.formOcr = "public";
assert.equal(UI.featureReleaseState("formOcr"), "public");

global.PQC_PUBLIC_CONFIG.features.formOcr = "preview";
assert.equal(UI.featureReleaseState("formOcr"), "hidden", "未知狀態必須失敗關閉");
delete global.PQC_PUBLIC_CONFIG;

const sandbox = { window: {} };
vm.runInNewContext(configSource, sandbox, { filename: "service-config.js" });
assert.equal(sandbox.window.PQC_PUBLIC_CONFIG.features.formOcr, "development", "OCR 公開測試期間必須以 development 狀態顯示");

assert.match(uiSource, /if \(releaseState === "hidden"\) return;/, "hidden 狀態不得建立前端入口");
assert.ok((uiSource.match(/開發中/g) || []).length >= 3, "development 狀態必須在入口與內容中明確標示");
assert.ok((uiSource.match(/測試中/g) || []).length >= 3, "OCR 入口、標題與操作必須明確標示測試中");
assert.match(uiSource, /paddle-ocr-browser\.js/, "OCR 必須按需載入 PaddleOCR 瀏覽器模組");
assert.match(uiSource, /recognizeBrowserImage/, "OCR 必須提供實際圖片匯入流程");
assert.match(uiSource, /id="paddleOcrCamera"[^>]*capture="environment"/, "OCR 必須提供明確的手機拍照入口");
assert.match(uiSource, /id="paddleOcrFile"[^>]*onchange=/, "OCR 必須提供明確的檔案選擇入口");
assert.match(uiSource, /拍照品質確認/, "OCR 必須提供清楚的照片品質確認元件");
assert.match(uiSource, /out of memory\|no available backend/, "手機記憶體不足不得直接顯示底層錯誤");
assert.match(paddleSource, /PP-OCRv6_tiny_det/);
assert.match(paddleSource, /PP-OCRv6_tiny_rec/);
assert.match(paddleSource, /MAX_INPUT_SIDE = 1600/, "高解析照片必須先縮小以控制行動裝置記憶體");
assert.match(paddleSource, /textRecognitionBatchSize: 1/, "行動裝置辨識批次必須限制為 1");
assert.doesNotMatch(uiSource, /測試版/, "未完成功能不可只以測試版模糊標示");
assert.doesNotMatch(html, /其他田區紀錄\s*<span[^>]*>第一版<\/span>/, "已公開功能不應殘留第一版標籤");

console.log("通過前端功能發布閘門測試");

