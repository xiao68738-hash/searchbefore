/* 抓取 index.html 的 DATA 所需的原始資料。

   資料來源(2026-07-21 實測確認,與現有 DATA 逐欄比對吻合):

   1. 許可證清單
      https://data.moa.gov.tw/api/v1/PesticideDataQueryType/
      欄位:ChineseName(成分中文名) / BrandName(商品名) / formCode(劑型)
           contents(含量) / IRAC / FRAC / HRAC / PermitNumber / Permit
           ScopeOfUse(指向下方明細端點的網址)

   2. 使用範圍明細(每張許可證一次請求)
      https://data.moa.gov.tw/Service/OpenData/FromM/PesticideDetail.aspx?ltyp={型別}&lno={許可證號}
      欄位:作物名稱 / 病蟲害名稱 / 稀釋倍數 / 每公頃使用用藥量 /
           施用次數 / 安全採收期 / 備註 / 注意事項 / 使用時期 / 施藥間隔

   驗證案例:許可證 00001「快得保淨」→ 木瓜/白粉病,稀釋 600 倍、
   安全採收期 18 日、施用次數 2-3、備註「本試驗加展著劑CS-7，3000倍。」
   與現有 DATA["木瓜"]["白粉病"] 該筆完全一致。

   ⚠️ 這支腳本會發出約 12,000 次請求。請勿調高並行數 —— 這是政府單位的
      公開服務,打掛了對所有人都沒好處。中斷後重跑會沿用既有快取續抓。 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "..", "mrl-data", "source-cache");
const LIST_URL = "https://data.moa.gov.tw/api/v1/PesticideDataQueryType/";
const PAGE = 5_000;
const CONCURRENCY = 6;
const GAP_MS = 60;

fs.mkdirSync(OUT, { recursive: true });

async function getJson(url, attempts = 3) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), 45_000);
    try {
      const r = await fetch(url, { signal: c.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      last = e;
      if (i < attempts) await new Promise(r => setTimeout(r, 800 * i));
    } finally { clearTimeout(timer); }
  }
  throw new Error(`${url} -> ${last?.message || last}`);
}

/* ── 1. 許可證清單(分頁,端點單頁上限 9,999) ── */
async function fetchList() {
  const cached = path.join(OUT, "permits.json");
  if (fs.existsSync(cached)) {
    const rows = JSON.parse(fs.readFileSync(cached, "utf8"));
    console.log(`許可證清單:沿用快取 ${rows.length} 筆`);
    return rows;
  }
  const all = [];
  for (let skip = 0; ; skip += PAGE) {
    const rows = await getJson(`${LIST_URL}?$top=${PAGE}&$skip=${skip}`);
    const arr = Array.isArray(rows) ? rows : [];
    all.push(...arr);
    process.stdout.write(`\r許可證清單:${all.length} 筆`);
    if (arr.length < PAGE) break;
  }
  console.log("");
  if (all.length === 9_999) throw new Error("恰為 9,999 筆,分頁未生效");
  fs.writeFileSync(cached, JSON.stringify(all), "utf8");
  return all;
}

/* ── 2. 逐張許可證抓使用範圍 ── */
async function fetchDetails(permits) {
  const cached = path.join(OUT, "details.json");
  const store = fs.existsSync(cached) ? JSON.parse(fs.readFileSync(cached, "utf8")) : {};
  const todo = permits.filter(p => p.ScopeOfUse && !(keyOf(p) in store));
  console.log(`使用範圍明細:已有 ${Object.keys(store).length} 筆,待抓 ${todo.length} 筆`);
  if (!todo.length) return store;

  let done = 0, failed = 0;
  const queue = todo.slice();
  async function worker() {
    while (queue.length) {
      const p = queue.shift();
      try {
        const rows = await getJson(p.ScopeOfUse);
        store[keyOf(p)] = Array.isArray(rows) ? rows : [];
      } catch (e) {
        failed++;
        store[keyOf(p)] = { __error: String(e.message).slice(0, 120) };
      }
      done++;
      if (done % 50 === 0) {
        process.stdout.write(`\r  ${done}/${todo.length}(失敗 ${failed})`);
        fs.writeFileSync(cached, JSON.stringify(store), "utf8");
      }
      await new Promise(r => setTimeout(r, GAP_MS));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`\r  ${done}/${todo.length}(失敗 ${failed})          `);
  fs.writeFileSync(cached, JSON.stringify(store), "utf8");
  return store;
}

function keyOf(p) {
  return `${p.Permit || ""}-${p.PermitNumber || ""}`;
}

const permits = await fetchList();
const details = await fetchDetails(permits);

const errors = Object.values(details).filter(v => v && v.__error).length;
const scopeRows = Object.values(details)
  .filter(v => Array.isArray(v)).reduce((n, v) => n + v.length, 0);

fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({
  retrievedAt: new Date().toISOString(),
  listUrl: LIST_URL,
  permits: permits.length,
  detailsFetched: Object.keys(details).length,
  scopeRows,
  errors
}, null, 2), "utf8");

console.log(`\n許可證 ${permits.length} 張｜使用範圍 ${scopeRows} 列｜失敗 ${errors} 筆`);
console.log(`快取目錄:${path.relative(path.join(DIR, ".."), OUT)}`);
if (errors) console.log("⚠️ 有失敗項目,重跑本腳本會只補抓失敗與未抓的部分");
