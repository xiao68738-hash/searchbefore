/* 把 DATA 的作物對應到食藥署「農作物類農產品分類表」的 22 個類別。

   目的:減少人工校對量。但誤判的代價不對稱 ——
   把食用作物誤標為「非農產品」會讓它永遠不做殘留檢查,
   把非食用誤標為食用只是多一筆待確認。所以一律往保守方向:
   任何有食用部位疑慮的,寧可留給人工。

   輸出僅為建議,需人工確認。 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));

/* ── 來源 ── */
const html = fs.readFileSync(path.join(DIR, "..", "index.html"), "utf8");
const di = html.indexOf("const DATA=") + "const DATA=".length;
const DATA = JSON.parse(html.slice(di, html.indexOf("\n", di)).trim().replace(/;$/, ""));
const CROPS = Object.keys(DATA);
const categories = read("crop-categories-latest.json").rows || [];

/* ── 1. 非農產品:施藥對象不是可食用的農產品 ──
   逐一列舉,不用關鍵字比對 —— 關鍵字會誤傷(例如「果樹」與「果菜類」)。 */
const NON_PRODUCE = new Set([
  /* 場所與地目 */
  "休閒地", "作物園", "倉庫", "穀倉", "菸草倉庫", "非耕作農地", "造林地",
  "輸入植物檢疫物", "虱目魚塭", "新墾或閒地",
  /* 草坪與林木 */
  "草皮", "百慕達草", "結縷草", "樹木", "松樹", "桉屬植物", "臺灣欒樹",
  "蘇鐵", "刺桐屬植物", "亞洲棕櫚",
  /* 泛稱,非具體作物 */
  "果樹", "果苗", "花木", "觀賞植物", "特用", "蔬菜",
  /* 非植物 */
  "蜜蜂"
]);

/* ── 2. 觀賞花卉:不供食用 ──
   刻意排除 百合(百合鱗莖可食,列於根莖菜類)、菊(杭菊可食)、
   野薑(野薑花可食)、睡蓮 等有食用疑慮者,那些留給人工。 */
const ORNAMENTAL = new Set([
  "唐菖蒲", "嘉德麗雅蘭", "康乃馨", "晚香玉", "洋桔梗", "火鶴花",
  "萬代蘭", "蘭", "蘭科作物", "茉莉", "鳳仙", "銀柳"
]);

/* ── 3. App 自訂的科別分組 → 食藥署類別 ──
   規則:取分組名的後綴。「十字花科根菜類」的科別只是 App 的細分,
   對應到食藥署仍是「根莖菜類」。 */
const SUFFIX_MAP = [
  ["小葉菜類", "小葉菜類"],
  ["包葉菜類", "包葉菜類"],
  ["根菜類", "根莖菜類"],
  ["果菜類", "果菜類"],
  ["瓜菜類", "瓜菜類"],
  ["瓜果類", "瓜果類"],
  ["豆菜類", "豆菜類"],
  ["乾豆類", "乾豆類"],
  ["梨果類", "梨果類"],
  ["核果類", "核果類"],
  ["大漿果類", "大漿果類"],
  ["小漿果類", "小漿果類"],
  ["雜糧類", "雜糧類"],
  ["茶類", "茶類"]
];

/* ── 4. 名稱不同但確定同一作物 ──
   只列食藥署清單中確實存在、且對應關係無歧義者。
   蓮(蓮藕/蓮子)、豇豆(鮮/乾)、花豆、樹豆、甜菜 等跨類別者不列入。 */
const ALIAS = {
  "不結球萵苣與半結球萵苣": "小葉菜類",
  "蔥韭": "小葉菜類",
  "蔥": "小葉菜類",
  "韭": "小葉菜類",
  "芋": "根莖菜類",
  "竹": "根莖菜類",
  "婆羅門參": "根莖菜類",
  "黑婆羅門參": "根莖菜類",
  "狗尾草": "根莖菜類",
  "闊葉大豆": "根莖菜類",
  "稻穀": "米類",
  "臺灣藜": "雜糧類",
  "薏苡": "雜糧類",
  "胡麻": "乾豆類",
  "亞麻": "乾豆類",
  "向日葵": "乾豆類",
  "棉": "乾豆類",
  "檬果": "核果類",
  "桑樹": "小漿果類",
  "獼猴桃": "大漿果類",
  "紅龍果": "大漿果類",
  "菠蘿蜜": "大漿果類",
  "木虌果": "瓜菜類",
  "太平洋榅桲": "梨果類",
  "柿": "梨果類",
  "茶": "茶類",
  "山茶科茶類": "茶類"
};

/* ── 5. 解析食藥署清單的成員 ──

   陷阱:括號內不是註解,而是成員清單本身。例如
     「十字花科小葉菜(小白菜、油菜、青江菜、芥藍…)」
     「十字花科包葉菜【甘藍(含球莖甘藍)、花椰菜、結球白菜…】」
   若把括號內容當註解刪掉,小白菜、青江菜、甘藍這些明明有列的作物
   會全部落到「需人工」。所以括號一律當成分隔符,保留內容。

   但「(含球莖甘藍)」「(乾)」「(鮮)」這類確實是註解,以開頭關鍵字排除。 */
const ANNOTATION = /^(含|包括|不含|鮮|乾|乾燥|莢果及種子|種子|果實|1|2|3)/;

/* 一個作物可能同時出現在多個類別,依收穫型態而定。例如
     乾豆類:菜豆(乾)
     豆菜類:菜豆(粉豆、醜豆、四季豆、敏豆、海軍豆)
   若用「先出現者勝」,菜豆會被靜默歸到乾豆類 —— 而農友種的多半是
   四季豆那種鮮食型態,容許量標準完全不同。這種一律標出來給人工判斷,
   不可猜。App 本身已有「收穫型態消歧」功能可承接。 */
const memberCats = new Map();
for (const row of categories) {
  const cat = String(row["類別"] || "").trim();
  const flat = String(row["農作物類農產品"] || "")
    .replace(/[（()【】）]/g, "、")
    .replace(/等。?/g, "、")
    .replace(/：/g, "、")
    .replace(/\[[^\]]*\]/g, "");
  for (const part of flat.split(/[、。]/)) {
    const m = part.trim();
    if (m.length < 1 || ANNOTATION.test(m)) continue;
    if (!memberCats.has(m)) memberCats.set(m, new Set());
    memberCats.get(m).add(cat);
  }
}

/* 食藥署的「類別」名稱本身也可能就是 App 的作物名(例如「柑桔類」) */
for (const row of categories) {
  const cat = String(row["類別"] || "").trim();
  if (cat && !memberCats.has(cat)) memberCats.set(cat, new Set([cat]));
}

const memberOf = new Map();
const multiCat = new Map();
for (const [m, set] of memberCats) {
  const list = [...set];
  if (list.length === 1) memberOf.set(m, list[0]);
  else multiCat.set(m, list);
}

/* ── 分類 ── */
const result = { 非農產品: [], 觀賞花卉: [], 分組對應: [], 名稱對應: [], 直接命中: [], 跨類別: [], 需人工: [] };

for (const crop of CROPS) {
  if (NON_PRODUCE.has(crop)) { result.非農產品.push({ crop, category: "-", how: "非可食農產品" }); continue; }
  if (ORNAMENTAL.has(crop)) { result.觀賞花卉.push({ crop, category: "-", how: "觀賞用,不供食用" }); continue; }
  if (ALIAS[crop]) { result.名稱對應.push({ crop, category: ALIAS[crop], how: "名稱不同但確定同一作物" }); continue; }
  if (multiCat.has(crop)) {
    result.跨類別.push({ crop, category: multiCat.get(crop).join(" / "),
      how: "依收穫型態分屬不同類別,容許量標準不同,須人工指定" });
    continue;
  }
  if (memberOf.has(crop)) { result.直接命中.push({ crop, category: memberOf.get(crop), how: "食藥署清單直接列名" }); continue; }

  const suffix = SUFFIX_MAP.find(([s]) => crop.endsWith(s) && crop !== s);
  if (suffix) { result.分組對應.push({ crop, category: suffix[1], how: `分組後綴「${suffix[0]}」` }); continue; }
  const self = SUFFIX_MAP.find(([s]) => crop === s);
  if (self) { result.直接命中.push({ crop, category: self[1], how: "與食藥署類別同名" }); continue; }

  /* 給人工一點線索:名稱有部分重疊的候選 */
  const hints = [...memberCats.keys()]
    .filter(m => m.length >= 2 && (m.includes(crop) || crop.includes(m)))
    .slice(0, 3).map(m => `${m}(${[...memberCats.get(m)].join("/")})`);
  result.需人工.push({ crop, category: "", how: hints.length ? "候選:" + hints.join("、") : "無線索" });
}

/* ── 報告 ── */
const order = ["直接命中", "名稱對應", "分組對應", "非農產品", "觀賞花卉", "跨類別", "需人工"];
console.log(`App 作物 ${CROPS.length} 種\n`);
for (const k of order) console.log(`  ${String(result[k].length).padStart(4)}  ${k}`);
const auto = CROPS.length - result.需人工.length - result.跨類別.length;
console.log(`\n自動處理 ${auto} 種(${(auto / CROPS.length * 100).toFixed(1)}%)`);
console.log(`需人工:跨類別 ${result.跨類別.length} 種 + 無法判定 ${result.需人工.length} 種`);

if (result.跨類別.length) {
  console.log(`\n=== 跨類別 ${result.跨類別.length} 種:依收穫型態分屬不同類別,容許量標準不同 ===`);
  for (const r of result.跨類別) console.log(`  ${r.crop.padEnd(10)} ${r.category}`);
}

console.log(`\n=== 無法判定的 ${result.需人工.length} 種 ===`);
for (const r of result.需人工) console.log(`  ${r.crop.padEnd(14)} ${r.how}`);

/* ── 輸出 ── */
const rows = order.flatMap(k => result[k].map(r => ({ tier: k, ...r })));
fs.writeFileSync(path.join(DIR, "作物分類對照.json"),
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    note: "本清單為建議,需人工確認。非農產品與觀賞花卉的判定一律採保守原則,有食用部位疑慮者留給人工。",
    total: CROPS.length, auto, manual: result.需人工.length, rows
  }, null, 2), "utf8");

const csv = ["作物,分類層級,對應食藥署類別,依據,人工確認(是/否),修正為"]
  .concat(rows.map(r => `"${r.crop}","${r.tier}","${r.category}","${r.how}",,`))
  .join("\r\n");
fs.writeFileSync(path.join(DIR, "作物分類對照.csv"), "﻿" + csv, "utf8");
console.log("\n已產出 作物分類對照.json / .csv");
