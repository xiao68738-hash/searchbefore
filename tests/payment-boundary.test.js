const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const androidRoot = path.join(root, "android-ocr-prototype");
const androidSources = [
  path.join(androidRoot, "app", "build.gradle"),
  path.join(androidRoot, "app", "src", "main", "AndroidManifest.xml"),
  path.join(androidRoot, "ocr-feature", "build.gradle"),
  path.join(androidRoot, "ocr-feature", "src", "main", "AndroidManifest.xml")
].map(file => fs.readFileSync(file, "utf8")).join("\n");
assert.doesNotMatch(androidSources, /ecpay|billingclient|com\.android\.billing/i, "Android 原生層不得內嵌綠界或提前啟用 Billing；純自願支持只由受控網頁設定提供");
const start = html.indexOf('const GOOGLE_PLAY_CONTEXT_KEY=');
const end = html.indexOf('function publicConfigHttpsUrl', start);
assert.ok(start > 0 && end > start, "應能取得付款通路邊界程式");
const source = html.slice(start, end);

function fakeElement(href = "") {
  const attributes = new Map();
  if (href) attributes.set("href", href);
  return {
    style: {},
    inert: false,
    classList: { remove() {}, add() {} },
    get href() { return attributes.get("href") || ""; },
    set href(value) { attributes.set("href", String(value)); },
    setAttribute(key, value) { attributes.set(key, String(value)); },
    removeAttribute(key) { attributes.delete(key); },
    getAttribute(key) { return attributes.get(key) || null; }
  };
}

function makeSandbox(search, options = {}) {
  const ids = {
    supportCard: fakeElement(),
    supportLink50: fakeElement("https://p.ecpay.com.tw/C208963"),
    supportLink100: fakeElement("https://p.ecpay.com.tw/0503198"),
    supportLink150: fakeElement("https://p.ecpay.com.tw/AE7EDCF"),
    supportLink: fakeElement("https://p.ecpay.com.tw/D7844AC"),
    sponsorModal: fakeElement()
  };
  let injectedScript = null;
  const memory = new Map();
  const document = {
    referrer: "",
    documentElement: { setAttribute() {} },
    getElementById(id) { return ids[id] || null; },
    createElement(tag) { return { tagName: tag, src: "", async: false, onload: null, onerror: null }; },
    head: { appendChild(node) { injectedScript = node; } }
  };
  const window = {
    location: { search },
    navigator: { standalone: options.iosStandalone === true },
    sessionStorage: {
      getItem(key) { return memory.get(key) || null; },
      setItem(key, value) { memory.set(key, String(value)); }
    },
    matchMedia(query) { return { matches: query === "(display-mode: standalone)" && options.standalone === true }; }
  };
  const sandbox = { window, document, URL, URLSearchParams, Promise, refreshAnnouncementAvailability() {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "payment-boundary-inline.js" });
  return { sandbox, ids, getInjectedScript: () => injectedScript };
}

{
  const queryApp = makeSandbox("?app=google-play");
  assert.equal(vm.runInContext("isGooglePlayAppContext()", queryApp.sandbox), true, "啟動網址參數應辨識 Google Play");

  const referrerApp = makeSandbox("");
  referrerApp.sandbox.document.referrer = "android-app://tw.searchbefore.app/";
  assert.equal(vm.runInContext("isGooglePlayAppContext()", referrerApp.sandbox), true, "TWA referrer 應辨識 Google Play");

  const nativeApp = makeSandbox("");
  nativeApp.sandbox.window.PQC_APP_RUNTIME = "google-play";
  assert.equal(vm.runInContext("isGooglePlayAppContext()", nativeApp.sandbox), true, "原生訊號應辨識 Google Play");

  const rememberedApp = makeSandbox("");
  rememberedApp.sandbox.window.sessionStorage.setItem("pqcGooglePlayApp", "1");
  assert.equal(vm.runInContext("isGooglePlayAppContext()", rememberedApp.sandbox), true, "同一工作階段應記住 Google Play 身分");
}

{
  const app = makeSandbox("?app=google-play");
  vm.runInContext("renderSupportLink()", app.sandbox);
  assert.equal(app.getInjectedScript().src, "./web-support-config.js", "Google Play App 應按需載入可遠端關閉的自願支持設定");
  app.sandbox.window.PQC_WEB_SUPPORT_CONFIG = {
    googlePlayVoluntarySupport: false,
    supportUrls: { amount50: "https://p.ecpay.com.tw/C208963" }
  };
  app.getInjectedScript().onload();
  vm.runInContext("renderSupportLink()", app.sandbox);
  assert.equal(app.ids.supportCard.style.display, "none");
  for (const id of ["supportLink50", "supportLink100", "supportLink150", "supportLink"]) {
    assert.equal(app.ids[id].getAttribute("href"), null, `${id} 的綠界 href 必須清除`);
  }
  assert.equal(app.ids.sponsorModal.inert, true, "遠端開關關閉時，App 內贊助視窗必須停用");
}

{
  const app = makeSandbox("?app=google-play");
  vm.runInContext("renderSupportLink()", app.sandbox);
  app.sandbox.window.PQC_WEB_SUPPORT_CONFIG = {
    googlePlayVoluntarySupport: true,
    supportUrls: {
      amount50: "https://p.ecpay.com.tw/C208963",
      amount100: "https://p.ecpay.com.tw/0503198",
      amount150: "https://p.ecpay.com.tw/AE7EDCF",
      custom: "https://p.ecpay.com.tw/D7844AC"
    }
  };
  app.getInjectedScript().onload();
  vm.runInContext("renderSupportLink()", app.sandbox);
  assert.equal(app.ids.supportCard.style.display, "flex", "明確開啟純自願支持時，Google Play App 可顯示入口");
  assert.equal(app.ids.supportLink50.getAttribute("href"), "https://p.ecpay.com.tw/C208963");
  assert.equal(app.ids.supportLink.getAttribute("href"), "https://p.ecpay.com.tw/D7844AC");
}

for (const options of [{ standalone: true }, { iosStandalone: true }]) {
  const installedWeb = makeSandbox("", options);
  installedWeb.sandbox.window.PQC_WEB_SUPPORT_CONFIG = {
    googlePlayVoluntarySupport: true,
    supportUrls: { amount50: "https://p.ecpay.com.tw/C208963" }
  };
  vm.runInContext("renderSupportLink()", installedWeb.sandbox);
  assert.equal(installedWeb.ids.supportCard.style.display, "flex", "全通路開關開啟時，一般 PWA 與 iOS 主畫面版應顯示入口");
}

{
  const web = makeSandbox("");
  web.sandbox.window.PQC_WEB_SUPPORT_CONFIG = {
    supportUrls: { amount50: "https://p.ecpay.com.tw/C208963" }
  };
  vm.runInContext("renderSupportLink()", web.sandbox);
  assert.equal(web.ids.supportCard.style.display, "none", "開關缺省時，即使 App 身分尚未辨識也必須預設關閉");
  assert.equal(web.ids.supportLink50.getAttribute("href"), null);
}

{
  const web = makeSandbox("");
  vm.runInContext("loadWebSupportConfig()", web.sandbox);
  assert.equal(web.getInjectedScript().src, "./web-support-config.js", "各環境皆以獨立檔案按需載入贊助設定");
  web.sandbox.window.PQC_WEB_SUPPORT_CONFIG = { supportUrls: {
    amount50: "https://p.ecpay.com.tw/C208963",
    amount100: "https://p.ecpay.com.tw.evil.example/steal"
  } };
  assert.equal(vm.runInContext('publicConfigSupportUrl("amount50")', web.sandbox), "https://p.ecpay.com.tw/C208963");
  assert.equal(vm.runInContext('publicConfigSupportUrl("amount100")', web.sandbox), "", "相似網域不可冒充綠界");
}

console.log("✓ 付款通路：純自願支持可遠端關閉、各環境分流且綠界網址採白名單");
