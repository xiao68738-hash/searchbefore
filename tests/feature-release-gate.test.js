const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const UI = require(path.join(root, "form-ocr-ui.js"));
const uiSource = fs.readFileSync(path.join(root, "form-ocr-ui.js"), "utf8");
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
assert.equal(sandbox.window.PQC_PUBLIC_CONFIG.features.formOcr, "development", "OCR 測試入口必須標示 development");

assert.match(uiSource, /if \(releaseState === "hidden"\) return;/, "hidden 狀態不得建立前端入口");
assert.ok((uiSource.match(/開發中/g) || []).length >= 3, "development 狀態必須在入口與內容中明確標示");
assert.ok((uiSource.match(/測試中/g) || []).length >= 3, "OCR 入口、標題與操作必須明確標示測試中");
assert.match(uiSource, /recognizeBrowserImage/, "OCR 必須提供實際圖片匯入流程");
assert.match(uiSource, /id="cloudVisionCamera"[^>]*capture="environment"/, "OCR 必須提供明確的手機拍照入口");
assert.match(uiSource, /id="cloudVisionFile"[^>]*onchange=/, "OCR 必須提供明確的檔案選擇入口");
assert.match(uiSource, /id="cloudVisionFile"[^>]*multiple/, "OCR 必須允許一次選取多張照片");
assert.match(uiSource, /id="cloudVisionProgress"[^>]*role="progressbar"/, "多張 OCR 必須顯示處理進度");
assert.match(uiSource, /id="cloudVisionPreviewList"/, "OCR 必須讓使用者隨時查看待辨識照片");
assert.doesNotMatch(uiSource, /使用 Android 原生掃描（開發中）/, "雲端 OCR 介面不應顯示冗餘的 Android 掃描入口");
assert.doesNotMatch(uiSource, /貼上辨識文字（備用測試）/, "正式測試介面不應顯示冗餘的文字貼上區");
assert.match(uiSource, /主要內容可閱讀/, "OCR 必須提供不過度限制版面的可讀性確認元件");
assert.match(uiSource, /跨頁表格|跨頁或背景/, "OCR 必須明示可接受整本、跨頁或帶背景的實際紀錄照片");
assert.match(uiSource, /applyEquipmentMaintenanceBatch/, "OCR 必須支援設備管理表單的多筆人工覆核流程");
assert.match(uiSource, /exportSelfInspectionDraft/, "OCR 必須提供獨立的自我查核草稿輸出，不得誤存成田間紀錄");
assert.match(uiSource, /備查文件（非 L3 登打）/, "自我檢核表必須明示為非 L3 登打文件");
assert.match(uiSource, /renderMaterialInventoryDraft/, "肥料入出庫表必須使用獨立的資材庫存覆核介面");
assert.match(uiSource, /exportMaterialInventoryDraft/, "資材庫存草稿必須可由人工核對後匯出");
assert.match(html, /一次儲存設備管理紀錄/, "田間紀錄介面必須支援一次建立多筆設備管理紀錄");
assert.match(uiSource, /第三方雲端辨識服務/, "OCR 單次同意必須揭露照片會交由第三方處理");
assert.match(uiSource, /資料處理服務說明[\s\S]*Google Cloud Vision/, "展開的資料處理說明必須揭露實際處理服務商");
assert.doesNotMatch(uiSource, /const ocrHeading = "Google Cloud Vision/, "主操作標題不應以供應商品牌取代產品功能名稱");
assert.match(uiSource, /cloudOcrConsent/, "照片送出前必須取得單次同意");
assert.match(uiSource, /ocrVerificationGate/, "OCR 必須先通過驗證碼閘門");
assert.match(uiSource, /sessionStorage/, "OCR 解鎖狀態只能保留在目前瀏覽器工作階段");
assert.doesNotMatch(uiSource, /PaddleOCR|paddle-ocr-browser/, "前端不得殘留 PaddleOCR 依賴");
assert.doesNotMatch(uiSource, /測試版/, "未完成功能不可只以測試版模糊標示");
assert.doesNotMatch(html, /農務與設備紀錄\s*<span[^>]*>第一版<\/span>/, "已公開功能不應殘留第一版標籤");

console.log("通過前端功能發布閘門測試");

