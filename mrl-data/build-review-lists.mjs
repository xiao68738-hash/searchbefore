import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 由「登記但不得檢出-候選.json」的複核狀態，產生四份人工檢視名單。
// 安全紅線：任何「誤判(可刪)」在人工最終簽核前不得寫回 App／資料管線。
const DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(DIR, "登記但不得檢出-候選.json");
const T = v => String(v ?? "").trim();
const csvCell = v => {
  const s = T(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const writeCsv = (file, header, rows) => {
  const body = [header, ...rows].map(cols => cols.map(csvCell).join(",")).join("\r\n");
  fs.writeFileSync(path.join(DIR, file), "﻿" + body + "\r\n", "utf8");
  return rows.length;
};

const candidates = JSON.parse(fs.readFileSync(SRC, "utf8")).candidates;
// 人工確認區＝有使用者人工備註的工作表範圍（第11–40、51–60筆）；其餘為 AI 判定待人工簽核。
const isHuman = n => (n >= 11 && n <= 40) || (n >= 51 && n <= 60);

const rows = candidates.map((c, i) => {
  const rv = c["複核"] || {};
  return {
    n: i + 1,
    crop: T(c["作物"]),
    agent: T(c["藥劑"]),
    verdict: T(rv["判定"]) || "未複核",
    status: T(rv["狀態"]),
    basis: T(rv["依據"]),
    origin: T(c["成分判定"])
  };
});

// 1) 已檢核完成名單（狀態＝檢核完成）
const done = rows.filter(r => r.status === "檢核完成");
const nDone = writeCsv(
  "複核-已檢核完成名單.csv",
  ["筆次", "作物", "藥劑", "判定", "確認層級", "依據"],
  done.map(r => [r.n, r.crop, r.agent, r.verdict, isHuman(r.n) ? "人工已確認" : "AI判定(待人工簽核)", r.basis])
);

// 2) 有疑義名單（狀態＝有疑義）
const doubt = rows.filter(r => r.status === "有疑義");
const nDoubt = writeCsv(
  "複核-有疑義名單.csv",
  ["筆次", "作物", "藥劑", "現行判定", "疑義說明"],
  doubt.map(r => [r.n, r.crop, r.agent, r.verdict, r.basis])
);

// 3) 待確認名單（狀態含「待確認」，含待確認成員）
const pending = rows.filter(r => /待確認/.test(r.status));
const nPending = writeCsv(
  "複核-待確認名單.csv",
  ["筆次", "作物", "藥劑", "傾向判定", "狀態", "待辦"],
  pending.map(r => [r.n, r.crop, r.agent, r.verdict, r.status, r.basis])
);

// 4) 未複核名單（尚無複核狀態，即原始第1–10筆）
const unreviewed = rows.filter(r => !r.status && r.verdict === "未複核");
const nUnrev = writeCsv(
  "複核-未複核名單.csv",
  ["筆次", "作物", "藥劑", "原候選判定"],
  unreviewed.map(r => [r.n, r.crop, r.agent, r.origin])
);

const total = nDone + nDoubt + nPending + nUnrev;
console.log(`已產生四份名單：已檢核完成 ${nDone}｜有疑義 ${nDoubt}｜待確認 ${nPending}｜未複核 ${nUnrev}（合計 ${total}／${candidates.length}）`);
if (total !== candidates.length) throw new Error(`名單合計 ${total} 與候選 ${candidates.length} 不符`);
