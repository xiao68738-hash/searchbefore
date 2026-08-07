const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pages = [
  "guides.html",
  "guide-label.html",
  "guide-dilution.html",
  "guide-phi.html",
  "guide-ppe.html"
];

for (const name of pages) {
  const html = fs.readFileSync(path.join(root, name), "utf8");
  const canonical = `https://searchbefore.tw/${name}`;
  assert.match(html, new RegExp(`<link rel="canonical" href="${canonical.replaceAll(".", "\\.")}">`), `${name} 缺少正式 canonical`);
  assert.match(html, /<meta name="description" content="[^"]{35,}">/, `${name} 缺少具體摘要`);
  assert.match(html, /ca-pub-1085605483379036/, `${name} 缺少 AdSense 發布商代碼`);
  assert.match(html, /噴前查編輯/, `${name} 缺少內容負責單位`);
  assert.match(html, /2026-08-07/, `${name} 缺少複核日期`);
  assert.doesNotMatch(html, /Lorem ipsum|提升生產力|卓越的用戶體驗|百分之百安全|保證安全/i);

  for (const match of html.matchAll(/href="\.\/([^"#?]+\.html)"/g)) {
    assert.ok(fs.existsSync(path.join(root, match[1])), `${name} 連到不存在的 ${match[1]}`);
  }
}

for (const name of pages.slice(1)) {
  const html = fs.readFileSync(path.join(root, name), "utf8");
  const visible = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "").replace(/\s+/g, "");
  assert.ok(visible.length >= 1100, `${name} 的原創說明不足，目前 ${visible.length} 字元`);
  assert.match(html, /<h2>官方來源<\/h2>/, `${name} 缺少官方來源段落`);
  assert.match(html, /https:\/\/(?:pesticide\.aphia\.gov\.tw|kmweb\.moa\.gov\.tw|www\.moa\.gov\.tw|law\.moa\.gov\.tw)/, `${name} 缺少官方來源連結`);
  assert.match(html, /class="diagram" role="img" aria-label="[^"]+"/, `${name} 缺少可讀的原創圖解`);
  assert.match(html, /class="safe"/, `${name} 缺少安全界線`);
}

const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const name of pages) assert.match(index, new RegExp(name.replaceAll(".", "\\.")), `首頁缺少 ${name} 入口`);

const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
for (const name of pages) assert.match(sitemap, new RegExp(`https://searchbefore\\.tw/${name.replaceAll(".", "\\.")}`), `sitemap 缺少 ${name}`);

assert.equal(fs.readFileSync(path.join(root, "ads.txt"), "utf8").trim(), "google.com, pub-1085605483379036, DIRECT, f08c47fec0942fa0");

console.log(`✓ ${pages.length} 個指南頁的內容、來源、SEO 與內部連結檢查通過`);
