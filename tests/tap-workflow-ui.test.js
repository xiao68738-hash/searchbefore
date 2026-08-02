const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dev", "tap-workflow-review.html"), "utf8");
const uiSource = fs.readFileSync(path.join(root, "dev", "tap-workflow-review-ui.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const build = fs.readFileSync(path.join(root, "scripts", "build-release.mjs"), "utf8");

new vm.Script(uiSource, { filename: "tap-workflow-review-ui.js" });

assert.match(html, /開發中測試頁面/);
assert.match(html, /只使用假資料/);
assert.match(html, /不會儲存、上傳或連接 L3/);
assert.match(html, /噴前查沒有向官方系統查證/);
assert.match(html, /退回農友補充/);
assert.match(html, /記錄專員的人工登打聲明/);
assert.match(uiSource, /PQC_TAP_WORKFLOW/);
assert.match(uiSource, /MANUAL_ENTRY_CLAIM_NOTICE/);
assert.match(uiSource, /submitForReview/);
assert.match(uiSource, /requestChanges/);
assert.match(uiSource, /completeInternalReview/);
assert.match(uiSource, /recordManualEntryClaim/);

for (const source of [html, uiSource]) {
  assert.doesNotMatch(source, /\bfetch\s*\(/, "協作測試前端不得傳送資料");
  assert.doesNotMatch(source, /XMLHttpRequest|WebSocket/, "協作測試前端不得建立網路連線");
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/, "協作測試前端不得持久化資料");
}

for (const source of [index, sw, build]) {
  assert.doesNotMatch(source, /tap-workflow-review\.html/, "協作測試頁不得進入正式發布鏈");
  assert.doesNotMatch(source, /tap-workflow-review-ui\.js/, "協作測試程式不得進入正式發布鏈");
}
assert.doesNotMatch(build, /["']tap-workflow\.js["']/, "內部協作模型不得進入正式發布成品");

console.log("資訊服務專員協作測試前端：假資料、無傳輸、無持久化與發布隔離規則通過");
