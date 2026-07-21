/* 抓取 index.html 的 DATA 所需的原始資料。

   ── 端點選擇(2026-07-21 實測)──

   ✅ 使用:https://data.moa.gov.tw/Service/OpenData/FromM/PesticideData.aspx
      支援 $top / $skip 分頁,可取得全部 11,869 張許可證。
      欄位齊全:中文名稱、廠牌名稱、劑型、含量、IRAC/FRAC/HRAC、
              撤銷類別/日期,以及「農藥使用範圍」明細網址。

   ❌ 不使用:https://data.moa.gov.tw/api/v1/PesticideDataQueryType/
      欄位相同但**非會員只能取得第一頁 500 筆**,
      第二頁起回傳 {"RS":"ERROR","MSG":"非會員只限回傳第一頁資料"}。
      $top/$skip 一律被忽略,無法繞過。

   使用範圍明細:每張許可證的「農藥使用範圍」欄位是一個網址
      PesticideDetail.aspx?ltyp={型別}&lno={許可證號}
      回傳:作物名稱 / 病蟲害名稱 / 稀釋倍數 / 每公頃使用用藥量 /
           施用次數 / 安全採收期 / 備註 / 注意事項 / 使用時期 / 施藥間隔

   驗證案例:許可證 農藥製 00001「快得保淨」→ 木瓜/白粉病,稀釋 600 倍、
   安全採收期 18 日、施用次數 2-3、備註「本試驗加展著劑CS-7，3000倍。」
   與現有 DATA["木瓜"]["白粉病"] 該筆逐欄一致。

   ⚠️ 本腳本會發出約 12,000 次請求。請勿調高並行數 —— 這是政府單位的
      公開服務。中斷後重跑會沿用既有快取續抓。 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, "..", "mrl-data", "source-cache");
const LIST_URL = "https://data.moa.gov.tw/Service/OpenData/FromM/PesticideData.aspx";
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

function keyOf(p) {
  return `${p["許可證字"] || ""}-${p["許可證號"] || ""}`;
}

/* ── 1. 許可證清單 ── */
async function fetchList() {
  const cached = path.join(OUT, "permits.json");
  if (fs.existsSync(cached)) {
    const rows = JSON.parse(fs.readFileSync(cached, "utf8"));
    if (rows.length > 1000) {
      console.log(`許可證清單:沿用快取 ${rows.length} 筆`);
      return rows;
    }
    console.log(`快取只有 ${rows.length} 筆,重新抓取`);
  }
  const all = [];
  for (let skip = 0; ; skip += PAGE) {
    const page = await getJson(`${LIST_URL}?$top=${PAGE}&$skip=${skip}`);
    const rows = Array.isArray(page) ? page : (page.Data || []);
    all.push(...rows);
    process.stdout.write(`\r許可證清單:${all.length} 筆`);
    if (rows.length < PAGE) break;
    if (all.length > 500_000) throw new Error("分頁未收斂");
  }
  console.log("");
  if (all.length === 9_999) throw new Error("恰為 9,999 筆,分頁未生效");
  if (!all.length || !("農藥使用範圍" in all[0])) {
    throw new Error("回傳缺少「農藥使用範圍」欄位,端點可能已變更");
  }
  fs.writeFileSync(cached, JSON.stringify(all), "utf8");
  return all;
}

/* ── 2. 逐張許可證抓使用範圍 ── */
async function fetchDetails(permits) {
  const cached = path.join(OUT, "details.json");
  const store = fs.existsSync(cached) ? JSON.parse(fs.readFileSync(cached, "utf8")) : {};
  const todo = permits.filter(p => {
    const url = String(p["農藥使用範圍"] || "");
    if (!url.startsWith("http")) return false;
    const prev = store[keyOf(p)];
    return !prev || prev.__error;          /* 失敗的下次重試 */
  });
  console.log(`使用範圍明細:已有 ${Object.keys(store).length} 筆,待抓 ${todo.length} 筆`);
  if (!todo.length) return store;

  let done = 0, failed = 0;
  const queue = todo.slice();
  async function worker() {
    while (queue.length) {
      const p = queue.shift();
      try {
        const rows = await getJson(String(p["農藥使用範圍"]));
        store[keyOf(p)] = Array.isArray(rows) ? rows : (rows.Data || []);
      } catch (e) {
        failed++;
        store[keyOf(p)] = { __error: String(e.message).slice(0, 120) };
      }
      done++;
      if (done % 100 === 0) {
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
if (errors) console.log("⚠️ 有失敗項目,重跑本腳本會只補抓失敗的部分");
