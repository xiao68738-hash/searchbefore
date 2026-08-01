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
assert.equal(sandbox.window.PQC_PUBLIC_CONFIG.features.formOcr, "hidden", "OCR 未完成前不得出現在正式前端");

assert.match(uiSource, /if \(releaseState === "hidden"\) return;/, "hidden 狀態不得建立前端入口");
assert.ok((uiSource.match(/開發中/g) || []).length >= 3, "development 狀態必須在入口與內容中明確標示");
assert.doesNotMatch(uiSource, /測試版/, "未完成功能不可只以測試版模糊標示");
assert.doesNotMatch(html, /其他田區紀錄\s*<span[^>]*>第一版<\/span>/, "已公開功能不應殘留第一版標籤");

console.log("通過前端功能發布閘門測試");

