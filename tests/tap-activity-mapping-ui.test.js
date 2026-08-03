const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dev", "tap-activity-mapping.html"), "utf8");
const uiSource = fs.readFileSync(path.join(root, "dev", "tap-activity-mapping-ui.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const build = fs.readFileSync(path.join(root, "scripts", "build-release.mjs"), "utf8");

new vm.Script(uiSource, { filename: "tap-activity-mapping-ui.js" });

assert.match(html, /開發中測試頁面/);
assert.match(html, /不會儲存或上傳資料/);
assert.match(html, /全部是假資料/);
assert.match(html, /尚未取得正式 L3 代碼表/);
assert.match(uiSource, /DEMO-NOT-OFFICIAL/);
assert.match(html, /id="queue-list"/);
assert.match(html, /data-filter="pending"/);
assert.match(html, /data-filter="confirmed"/);
assert.match(html, /data-filter="unmapped"/);
assert.match(uiSource, /DEMO_SOURCE_TEXTS/);
assert.match(uiSource, /activeFilter/);
assert.match(uiSource, /loadDemoCases/);
assert.match(uiSource, /候選只幫忙縮小範圍|系統列出候選項目/);

for (const source of [html, uiSource]) {
  assert.doesNotMatch(source, /\bfetch\s*\(/, "測試頁不得傳送網路請求");
  assert.doesNotMatch(source, /XMLHttpRequest|WebSocket/, "測試頁不得建立網路連線");
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/, "測試頁不得持久化農友輸入");
}

for (const source of [index, sw, build]) {
  assert.doesNotMatch(source, /tap-activity-mapping\.html/, "測試頁不得進入正式前端或發布成品");
  assert.doesNotMatch(source, /tap-activity-mapping-ui\.js/, "測試介面不得進入正式前端或發布成品");
}
assert.doesNotMatch(build, /tap-activity-mapping\.js/, "內部對照模型不得進入正式發布成品");

console.log("特殊作業測試前端：開發標示、假資料、無傳輸、無持久化與發布隔離規則通過");
