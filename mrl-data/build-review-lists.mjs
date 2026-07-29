import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 由「登記但不得檢出-候選.json」的複核狀態，產生後端人工檢視名單。
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
// 只有「人工備註確實對應到該筆作物×藥劑」才算人工已確認。
// 21、24–26、86、91–92 的人工備註有複製貼上錯置，故不列入。
// 41–50、61、68–70 沒有人工備註，也不列入。
const humanReviewed = new Set([
  ...Array.from({ length: 10 }, (_, i) => i + 11),
  22, 23,
  ...Array.from({ length: 14 }, (_, i) => i + 27),
  ...Array.from({ length: 10 }, (_, i) => i + 51),
  ...Array.from({ length: 6 }, (_, i) => i + 62),
  ...Array.from({ length: 15 }, (_, i) => i + 71),
  ...Array.from({ length: 4 }, (_, i) => i + 87),
  93, 94, 95
]);
const isHuman = n => humanReviewed.has(n);

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

// 3) 待確認名單（所有尚未完成、且不屬「有疑義」的具名狀態）
// 包含待確認成員、待人工簽核、待主管機關回覆等。
const pending = rows.filter(r =>
  r.status &&
  r.status !== "檢核完成" &&
  r.status !== "有疑義"
);
const nPending = writeCsv(
  "複核-待確認名單.csv",
  ["筆次", "作物", "藥劑", "傾向判定", "狀態", "待辦"],
  pending.map(r => [r.n, r.crop, r.agent, r.verdict, r.status, r.basis])
);

// 4) 未複核名單（尚無任何複核狀態）
const unreviewed = rows.filter(r => !r.status && r.verdict === "未複核");
const nUnrev = writeCsv(
  "複核-未複核名單.csv",
  ["筆次", "作物", "藥劑", "原候選判定"],
  unreviewed.map(r => [r.n, r.crop, r.agent, r.origin])
);

// 5) 僅列「人工已確認＋檢核完成＋判定確認」的後端白名單。
// 這是未來可供產品評估的最小安全集合；目前仍不得接入 App。
const confirmedNoDetect = rows.filter(r =>
  r.verdict === "確認" &&
  r.status === "檢核完成" &&
  isHuman(r.n)
);
const nConfirmedNoDetect = writeCsv(
  "複核-已確認登記但不得檢出名單.csv",
  ["筆次", "作物", "藥劑", "判定", "確認層級", "依據", "用途限制"],
  confirmedNoDetect.map(r => [
    r.n,
    r.crop,
    r.agent,
    r.verdict,
    "人工已確認",
    r.basis,
    "僅供後端複核；未接入App"
  ])
);

const total = nDone + nDoubt + nPending + nUnrev;
console.log(`已產生五份名單：已檢核完成 ${nDone}｜有疑義 ${nDoubt}｜待確認 ${nPending}｜未複核 ${nUnrev}｜已確認不得檢出白名單 ${nConfirmedNoDetect}（狀態合計 ${total}／${candidates.length}）`);
if (total !== candidates.length) throw new Error(`名單合計 ${total} 與候選 ${candidates.length} 不符`);
