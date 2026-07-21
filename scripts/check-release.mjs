import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outDir = path.join(root, "dist");
const expected = [
  "about.html", "account.js", "brand-lockup.png", "cloud-sync.js", "brand-logo-120.png", "crop-forms.js", "export-formats.js", "farm-records.js", "icon-180.png", "icon-192.png", "icon-512.png",
  "icon-maskable-512.png", "index.html", "manifest.webmanifest", "privacy.html",
  "query-aids.js", "safety.js", "service-config.js", "sw.js"
].sort();

const actual = (await readdir(outDir)).sort();
assert.deepEqual(actual, expected, "dist 只能包含網站執行必要檔案");
assert.ok(actual.every(name => !/\.(?:md|map)$/i.test(name)), "不得發布文件或 Source Map");

const textFiles = actual.filter(name => /\.(?:html|js|webmanifest)$/i.test(name));
let combined = "";
for (const name of textFiles) combined += `\n${await readFile(path.join(outDir, name), "utf8")}`;

assert.doesNotMatch(combined, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/);
assert.doesNotMatch(combined, /sourceMappingURL=/);
assert.doesNotMatch(combined, /xiao68738-hash\.github\.io\/searchbefore/);
assert.doesNotMatch(combined, /your-email@example\.com/);
assert.match(combined, /https:\/\/searchbefore\.tw\/privacy\.html/);
assert.match(combined, /https:\/\/searchbefore\.tw\/about\.html/);
assert.match(combined, /噴前查 SearchBefore/);

for (const name of ["account.js", "cloud-sync.js", "crop-forms.js", "export-formats.js", "farm-records.js", "query-aids.js", "safety.js", "service-config.js", "sw.js"]) {
  new vm.Script(await readFile(path.join(outDir, name), "utf8"), { filename: `dist/${name}` });
}

const html = await readFile(path.join(outDir, "index.html"), "utf8");
const referencedScripts = [...html.matchAll(/<script[^>]+\bsrc=["']\.\/([^"'?#]+)["']/gi)].map(match => match[1]);
assert.ok(referencedScripts.length >= 7, "index.html 應載入必要的外部程式");
for (const name of referencedScripts) assert.ok(actual.includes(name), `dist 缺少 index.html 引用的 ${name}`);

const sw = await readFile(path.join(outDir, "sw.js"), "utf8");
const precacheFiles = [...sw.matchAll(/["']\.\/([^"'?#]*)["']/g)].map(match => match[1]).filter(Boolean);
for (const name of precacheFiles) assert.ok(actual.includes(name), `dist 缺少 Service Worker 快取的 ${name}`);

const inlineScripts = [];
const scriptRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let match;
while ((match = scriptRe.exec(html))) inlineScripts.push(match[1]);
assert.ok(inlineScripts.length >= 2);
inlineScripts.forEach((code, index) => new vm.Script(code, { filename: `dist/index-inline-${index + 1}.js` }));

const sizes = [];
for (const name of actual) sizes.push({ name, bytes: (await stat(path.join(outDir, name))).size });
const total = sizes.reduce((sum, item) => sum + item.bytes, 0);
console.log(`✓ 發布成品檢查通過：${actual.length} 個檔案，共 ${(total / 1024 / 1024).toFixed(2)} MB`);
