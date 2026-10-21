const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
function source(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  return html.slice(start, html.indexOf("\n}", start) + 2);
}
const pestStart = html.indexOf('<div id="pestBlock"');
const overviewStart = html.indexOf('<div class="crop-overview" id="cropOverviewBlock"');
const agentStart = html.indexOf('<div id="agentBlock"');
assert.ok(pestStart < overviewStart && overviewStart < agentStart, "pest selection precedes optional overview and agent results");
assert.match(html.slice(pestStart, overviewStart), /<b>2<\/b>選病蟲害/);
assert.match(html.slice(agentStart, agentStart + 250), /<b>3<\/b>登記藥劑/);
assert.match(html, /id="cropOverviewBody" hidden/);
assert.match(html, /#pestBlock\{scroll-margin-top:110px\}/, "pest heading must clear the fixed header");
assert.match(html, /id="cropOverviewToggle"[^>]*aria-expanded="false"[^>]*aria-controls="cropOverviewBody"/);
assert.doesNotMatch(html.slice(overviewStart, agentStart), /<b>\d<\/b>/, "overview is optional, not a numbered mandatory step");

const nodes = new Map();
const scrolls = [];
function node(id) {
  if (!nodes.has(id)) nodes.set(id, {
    value: "", textContent: "", innerHTML: "", hidden: false, style: {}, attributes: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    scrollIntoView() { scrolls.push(id); }
  });
  return nodes.get(id);
}
// Registration fixtures deliberately keep the related pests separate.
const registrations = {
  蔥: { 夜蛾類: { list: [{ name: "藥劑甲" }] }, 甜菜夜蛾: { list: [{ name: "藥劑乙" }] } },
  豌豆: { 立枯病: { list: [{ name: "藥劑丙", method: "種子處理" }] } },
  無資料作物: {}
};
const before = JSON.stringify(registrations);
const renders = [];
const context = vm.createContext({
  document: { getElementById: node }, window: {},
  selCrop: "", selPest: null, selForm: "", recent: [], CUR: {}, overviewShow: 10,
  store: { set() {} }, renderRecent() {}, searchCrops() {}, renderHome() {}, renderFormChips() {},
  buildUnion(crop) { return { M: registrations[crop], levels: [crop] }; },
  renderCropOverview(query) { renders.push(["overview", query]); },
  renderPests(query) { renders.push(["pests", query]); }, esc: value => value
});
vm.runInContext(source("pickCrop") + "\n" + source("toggleCropOverview"), context);
function collapsed() {
  assert.equal(node("cropOverviewBlock").style.display, "block", "overview entry remains available");
  assert.equal(node("cropOverviewBody").hidden, true);
  assert.equal(node("cropOverviewToggle").textContent, "展開總覽");
  assert.equal(node("cropOverviewToggle").attributes["aria-expanded"], "false");
}
context.pickCrop("蔥");
collapsed();
assert.equal(scrolls.at(-1), "pestBlock", "selecting crop focuses the next task, not the overview");
assert.equal(node("pestBlock").style.display, "block");
assert.equal(node("agentBlock").style.display, "none");
assert.equal(node("pestTotal").textContent, "(2 項)");
assert.deepEqual(Object.keys(context.CUR), ["夜蛾類", "甜菜夜蛾"]);
context.toggleCropOverview();
assert.equal(node("cropOverviewBody").hidden, false);
assert.equal(node("cropOverviewToggle").attributes["aria-expanded"], "true");
assert.equal(node("cropOverviewToggle").textContent, "收合總覽");
node("cropOverviewSearch").value = "藥劑甲";
context.toggleCropOverview();
collapsed();
assert.equal(node("cropOverviewSearch").value, "藥劑甲", "collapse preserves the current overview filter");
context.toggleCropOverview();
node("pestSearch").value = "夜蛾";
context.overviewShow = 30;
context.selPest = "夜蛾類";
context.pickCrop("豌豆");
collapsed();
assert.equal(node("cropOverviewSearch").value, "");
assert.equal(node("pestSearch").value, "");
assert.equal(context.overviewShow, 10);
assert.equal(context.selPest, null);
assert.equal(node("pestTotal").textContent, "(1 項)");
assert.deepEqual(renders.slice(-2), [["overview", ""], ["pests", ""]]);
context.pickCrop("無資料作物");
collapsed();
assert.equal(node("pestSearchWrap").style.display, "none");
assert.equal(node("pestTotal").textContent, "(0 項)");
assert.equal(JSON.stringify(registrations), before, "presentation changes must not rewrite or merge registrations");

// Source-level parity guard; not a substitute for running the Compose UI tests.
const native = fs.readFileSync(path.join(root, "android-native/app/src/main/java/tw/searchbefore/nativeapp/MainActivity.kt"), "utf8");
const choose = native.slice(native.indexOf("fun chooseCrop("), native.indexOf("// Reset on"));
assert.match(choose, /overview = false/);
assert.match(native, /QueryStep\(if\(pest.isEmpty\(\)\) 2 else 3/);
assert.ok(native.indexOf('label = { Text("篩選病蟲害或分類') < native.indexOf('Text(if (overview) "收合總覽"'), "native pest filter must precede overview entry");
assert.match(native, /val scopeKey = org.json.JSONArray\(listOf\(mode, crop, pest\)\)/, "overview toggle must not force a scroll-to-top");
console.log("crop query flow: pest-first order, optional overview, state reset, and native parity guards passed");
