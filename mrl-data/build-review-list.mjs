/* 產出「需人工確認清單」
   用法:node mrl-data/build-review-list.mjs
   產出:mrl-data/待人工確認.md

   只做「找出需要人判斷的地方」,不做任何自動判定。
   凡有歧義者一律列出,確認前不得採用。
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..");
const T = v => String(v == null ? "" : v).trim();

const mrl = JSON.parse(fs.readFileSync(path.join(DIR, "latest.json"), "utf8"));
const ROWS = mrl.rows;

/* 取出 App 的 DATA */
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const s = html.indexOf("const DATA=");
let i = html.indexOf("{", s), d = 0, e = -1, q = false, x = false;
for (let p = i; p < html.length; p++) {
  const c = html[p];
  if (q) { if (x) x = false; else if (c === "\\") x = true; else if (c === '"') q = false; continue; }
  if (c === '"') { q = true; continue; }
  if (c === "{") d++; else if (c === "}") { d--; if (d === 0) { e = p; break; } }
}
const DATA = JSON.parse(html.slice(i, e + 1));

const agentUse = {};
for (const cr of Object.keys(DATA)) for (const p of Object.keys(DATA[cr])) for (const a of DATA[cr][p])
  agentUse[T(a.name)] = (agentUse[T(a.name)] || 0) + 1;
const appAgents = Object.keys(agentUse);

const mrlNames = [...new Set(ROWS.map(r => T(r["普通名稱"])))];
const exact = new Set(mrlNames);
const garbled = mrlNames.filter(n => n.includes("?"));

/* 缺字萬用字元候選:長度相同、非?位置全等 */
function candidates(appName) {
  return garbled.filter(m => {
    if (m.length !== appName.length) return false;
    for (let k = 0; k < m.length; k++) if (m[k] !== "?" && m[k] !== appName[k]) return false;
    return true;
  });
}
const missAgents = appAgents.filter(n => !exact.has(n));

/* 每個缺字名稱 -> 對到哪些 App 藥劑(反向,用來抓歧義) */
const byGarbled = {};
for (const n of missAgents) for (const g of candidates(n)) (byGarbled[g] = byGarbled[g] || []).push(n);

const unique = [], ambiguous = [];
for (const [g, list] of Object.entries(byGarbled)) {
  if (list.length === 1) unique.push([list[0], g]);
  else ambiguous.push([g, list]);
}
unique.sort((a, b) => agentUse[b[0]] - agentUse[a[0]]);
ambiguous.sort((a, b) => b[1].length - a[1].length);

/* 生物製劑類 */
const bioRe = /桿菌|木黴菌|病毒|費洛蒙|放線菌|酵母|鏈黴菌|芽孢|真菌|線蟲|蘇力菌|黴菌|甲基營養型/;
const bioMiss = missAgents.filter(n => bioRe.test(n) && !candidates(n).length)
  .sort((a, b) => agentUse[b] - agentUse[a]);

/* 完全查無(非生物製劑、無缺字候選) */
const trulyMissing = missAgents.filter(n => !bioRe.test(n) && !candidates(n).length)
  .sort((a, b) => agentUse[b] - agentUse[a]);

/* 作物側 */
const mrlCrops = [...new Set(ROWS.map(r => T(r["作物類別"])))];
const mrlCropSet = new Set(mrlCrops);
const appCrops = Object.keys(DATA);
const cropMiss = appCrops.filter(c => !mrlCropSet.has(c));
const cropGarbled = mrlCrops.filter(c => c.includes("?"));

const md = [];
md.push("# MRL 對照:待人工確認清單");
md.push("");
md.push(`資料版本:**${mrl.version}**(${mrl.count} 筆,${mrl.source})`);
md.push(`產出時間:${new Date().toISOString().slice(0, 10)}　產生方式:\`node mrl-data/build-review-list.mjs\``);
md.push("");
md.push("> 本清單只列出**需要人判斷**的項目,不含任何自動判定結果。");
md.push("> 未經確認者,實作時一律歸「⚪ 無法對照」。");
md.push("");

md.push("## A. 最優先:缺字歧義(必須逐筆確認)");
md.push("");
md.push("官方資料罕用字變成 `?`,以下 MRL 名稱**同時符合多個 App 藥劑**,無法自動判定。");
md.push("這些是不同的藥、容許量不同,**選錯會給出錯誤的安全訊息**。");
md.push("");
if (ambiguous.length) {
  md.push("| MRL 缺字名稱 | 可能對應的 App 藥劑(使用筆數) | 確認結果 |");
  md.push("|---|---|---|");
  for (const [g, list] of ambiguous) {
    const opts = list.map(n => `${n}(${agentUse[n]}筆)`).join(" / ");
    md.push(`| \`${g}\` | ${opts} | ☐ 待填 |`);
  }
} else md.push("(無)");
md.push("");
md.push("**確認方式**:查該筆 MRL 的「國際普通名稱」(英文)即可分辨。例如 `亞??` 若英文為 `Amitraz` 則為亞滅寧。");
md.push("");

md.push("## B. 缺字唯一候選(建議抽驗確認)");
md.push("");
md.push("以下只對到單一候選,風險較低,但仍建議抽驗幾筆。");
md.push("");
md.push("| App 藥劑 | 使用筆數 | MRL 缺字寫法 | 確認 |");
md.push("|---|---|---|---|");
for (const [app, g] of unique) md.push(`| ${app} | ${agentUse[app]} | \`${g}\` | ☐ |`);
md.push("");

md.push("## C. 生物製劑類:需確認法規定位");
md.push("");
md.push("以下在 MRL 表查無。**可能本來就不訂容許量**(免訂/不適用),");
md.push("與「查無 = 不得檢出」的法律意義**完全不同**,不可逕標為「未訂容許量」。");
md.push("");
md.push(`共 ${bioMiss.length} 項:`);
md.push("");
md.push("| 藥劑 | 使用筆數 | 法規定位(待確認) |");
md.push("|---|---|---|");
for (const n of bioMiss) md.push(`| ${n} | ${agentUse[n]} | ☐ 免訂 / ☐ 未訂 / ☐ 其他 |`);
md.push("");

md.push("## D. 查無對應的化學藥劑(需確認是否真的未訂)");
md.push("");
md.push(`共 ${trulyMissing.length} 項,依使用筆數排序(僅列前 40)。`);
md.push("這些若確認為「MRL 表確實未列」,即屬**不得檢出**,是本功能最重要的警示對象。");
md.push("");
md.push("| 藥劑 | 使用筆數 | 確認 |");
md.push("|---|---|---|");
for (const n of trulyMissing.slice(0, 40)) md.push(`| ${n} | ${agentUse[n]} | ☐ 確認未訂 / ☐ 其實有(寫法不同) |`);
if (trulyMissing.length > 40) md.push(`\n(另有 ${trulyMissing.length - 40} 項,完整清單見腳本輸出)`);
md.push("");

md.push("## E. 作物名稱對不上");
md.push("");
md.push(`App 有 ${appCrops.length} 個作物,其中 **${cropMiss.length} 個**在 MRL 表無同名類別。`);
md.push("部分屬非食用(觀賞植物、樹木、草皮)或非作物(倉庫、休閒地),本就不需 MRL;");
md.push("其餘需人工對到 MRL 的分類(可能藏在「其他⋯類(⋯除外)」裡)。");
md.push("");
md.push("**MRL 側也有缺字作物類別 " + cropGarbled.length + " 個**(需一併確認):");
md.push("");
for (const c of cropGarbled.slice(0, 20)) md.push(`- \`${c}\``);
md.push("");
md.push("<details><summary>App 無對應的作物全列(點開)</summary>");
md.push("");
md.push(cropMiss.join("、"));
md.push("");
md.push("</details>");

fs.writeFileSync(path.join(DIR, "待人工確認.md"), md.join("\n"), "utf8");
console.log("已產出 mrl-data/待人工確認.md");
console.log(`  A 缺字歧義 ${ambiguous.length} 組 | B 唯一候選 ${unique.length} 項`);
console.log(`  C 生物製劑 ${bioMiss.length} 項 | D 查無化學藥劑 ${trulyMissing.length} 項 | E 作物 ${cropMiss.length} 個`);
