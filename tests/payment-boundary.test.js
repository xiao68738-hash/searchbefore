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
assert.doesNotMatch(androidSources, /ecpay|billingclient|com\.android\.billing/i, "Android 目前不得接綠界或提前啟用 Billing");
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
    setAttribute(key, value) { attributes.set(key, String(value)); },
    removeAttribute(key) { attributes.delete(key); },
    getAttribute(key) { return attributes.get(key) || null; }
  };
}

function makeSandbox(search) {
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
    navigator: {},
    sessionStorage: {
      getItem(key) { return memory.get(key) || null; },
      setItem(key, value) { memory.set(key, String(value)); }
    },
    matchMedia() { return { matches: false }; }
  };
  const sandbox = { window, document, URL, URLSearchParams, Promise };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "payment-boundary-inline.js" });
  return { sandbox, ids, getInjectedScript: () => injectedScript };
}

{
  const app = makeSandbox("?app=google-play");
  vm.runInContext("renderSupportLink()", app.sandbox);
  assert.equal(app.getInjectedScript(), null, "Google Play App 不可載入綠界設定檔");
  assert.equal(app.ids.supportCard.style.display, "none");
  for (const id of ["supportLink50", "supportLink100", "supportLink150", "supportLink"]) {
    assert.equal(app.ids[id].getAttribute("href"), null, `${id} 的綠界 href 必須清除`);
  }
  assert.equal(app.ids.sponsorModal.inert, true, "App 內贊助視窗必須停用");
}

{
  const web = makeSandbox("");
  vm.runInContext("loadWebSupportConfig()", web.sandbox);
  assert.equal(web.getInjectedScript().src, "./web-support-config.js", "一般網頁版才按需載入贊助設定");
  web.sandbox.window.PQC_WEB_SUPPORT_CONFIG = { supportUrls: {
    amount50: "https://p.ecpay.com.tw/C208963",
    amount100: "https://p.ecpay.com.tw.evil.example/steal"
  } };
  assert.equal(vm.runInContext('publicConfigSupportUrl("amount50")', web.sandbox), "https://p.ecpay.com.tw/C208963");
  assert.equal(vm.runInContext('publicConfigSupportUrl("amount100")', web.sandbox), "", "相似網域不可冒充綠界");
}

console.log("✓ 付款通路：Google Play 不載入綠界，網頁版網址採白名單");
