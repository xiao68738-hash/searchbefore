/* 噴前查 service worker
   目標:整支 App(含農藥資料庫)離線可用,果園沒訊號也能查。

   ── 換版流程 ──
   每次更新 index.html、safety.js 或農藥資料後,把下面的 CACHE_VERSION 改掉。
   舊快取會在新版 activate 時自動清掉,使用者會看到「有新版資料」提示。
   注意:sw.js 的內容只要有一個位元不同,瀏覽器就會視為新版本 —— 所以「改版號」
   這個動作本身就是觸發更新的開關,不要忘記。
*/

const CACHE_VERSION = "v0.1.9.0-brand-verification-2026-07-16";
const CACHE_NAME = "pqc-" + CACHE_VERSION;

/* 只放骨架。App 本體(index.html)約 1MB gzip,用 reload 強制繞過 HTTP 快取抓最新版。 */
const PRECACHE = [
  "./",
  "./service-config.js",
  "./account.js",
  "./safety.js",
  "./farm-records.js",
  "./about.html",
  "./privacy.html",
  "./manifest.webmanifest",
  "./brand-logo-120.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./icon-180.png"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(PRECACHE.map(async url => {
      try {
        // cache:"reload" 確保裝新版時不會從瀏覽器 HTTP 快取拿到舊檔
        const res = await fetch(new Request(url, { cache: "reload" }));
        if (res.ok) await cache.put(url, res);
      } catch (e) { /* 單一檔案失敗不阻擋安裝 */ }
    }));
    // 不自動 skipWaiting:等使用者按「立即更新」再切,避免查詢做到一半頁面被抽換
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("pqc-") && k !== CACHE_NAME)
                          .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

/* 導覽請求(開 App):cache-first,背景靜默更新。
   沒訊號 → 直接吃快取;有訊號 → 先給快取(秒開),同時抓新版本備著。 */
async function handleNavigate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match("./", { ignoreSearch: true });

  const fresh = fetch(request)
    .then(res => { if (res && res.ok) cache.put("./", res.clone()); return res; })
    .catch(() => null);

  if (cached) return cached;                     // 快取優先,不等網路(fresh 在背景跑完)
  const net = await fresh;
  if (net) return net;
  return new Response(
    "<!doctype html><meta charset='utf-8'><body style=\"font-family:system-ui;padding:40px;text-align:center;color:#22301F;background:#F7F4EB\">" +
    "<h2>噴前查尚未完成離線安裝</h2><p>請在有網路的地方開啟一次，之後即可離線使用。</p></body>",
    { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 200 }
  );
}

/* 靜態資源與字型:cache-first,抓到就順手存起來(含 Google Fonts 的 opaque response) */
async function handleAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && (res.ok || res.type === "opaque")) cache.put(request, res.clone());
    return res;
  } catch (e) {
    return cached || Response.error();
  }
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  if (req.mode === "navigate") { event.respondWith(handleNavigate(req)); return; }

  const sameOrigin = url.origin === self.location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (sameOrigin || isFont) event.respondWith(handleAsset(req));
});
