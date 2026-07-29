const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dataDir = path.join(root, "mrl-data");
const readJson = name => JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"));

const candidates = readJson("登記但不得檢出-候選.json").candidates;
assert.strictEqual(candidates.length, 95, "不得檢出候選應維持95筆");

const consolidatedPath = path.join(dataDir, "登記但不得檢出-複核工作表_第1-95筆.md");
assert.ok(fs.existsSync(consolidatedPath), "應保留第1–95筆單一複核工作表");
const consolidated = fs.readFileSync(consolidatedPath, "utf8");
for (let number = 1; number <= 95; number += 1) {
  assert.match(consolidated, new RegExp(`^### 第 ${number} 筆｜`, "m"), `合併工作表缺少第${number}筆`);
}

const removedSplitFiles = [
  "登記但不得檢出-複核工作表_第1-10筆.txt",
  "登記但不得檢出-複核工作表_第11-30筆.txt",
  "登記但不得檢出-複核工作表_第31-40筆.txt",
  "登記但不得檢出-複核工作表_第41-50筆.txt",
  "登記但不得檢出-複核工作表_第51-60筆.txt",
  "登記但不得檢出-複核工作表_第61-70筆.txt",
  "登記但不得檢出-複核工作表_第71-80筆.txt",
  "登記但不得檢出-複核工作表_第81-95筆.txt",
  "登記但不得檢出-複核彙整_11-50.txt"
];
for (const name of removedSplitFiles) {
  assert.ok(!fs.existsSync(path.join(dataDir, name)), `冗餘分段檔仍存在：${name}`);
}

const allowedStatuses = new Set([
  "檢核完成",
  "有疑義",
  "待確認",
  "待確認成員",
  "待人工簽核",
  "待食藥署回覆"
]);
for (const [index, candidate] of candidates.entries()) {
  const review = candidate["複核"] || {};
  assert.ok(review["判定"], `第${index + 1}筆缺少複核判定`);
  assert.ok(allowedStatuses.has(review["狀態"]), `第${index + 1}筆出現未知複核狀態：${review["狀態"]}`);
  assert.ok(review["依據"], `第${index + 1}筆缺少複核依據`);
}

const whitelistText = fs.readFileSync(path.join(dataDir, "複核-已確認登記但不得檢出名單.csv"), "utf8")
  .replace(/^\uFEFF/, "")
  .trim();
const whitelistLines = whitelistText.split(/\r?\n/);
assert.strictEqual(whitelistLines.length - 1, 17, "後端白名單筆數異常");
const whitelistNumbers = new Set(whitelistLines.slice(1).map(line => Number(line.match(/^(\d+),/)[1])));

for (const number of whitelistNumbers) {
  const review = candidates[number - 1]["複核"];
  assert.strictEqual(review["判定"], "確認", `白名單第${number}筆不是確認`);
  assert.strictEqual(review["狀態"], "檢核完成", `白名單第${number}筆尚未完成`);
}

const mustRemainBlocked = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  21, 24, 25, 26,
  63, 65, 71, 72, 73, 76, 77, 79, 80, 85, 86, 88, 91, 92
];
for (const number of mustRemainBlocked) {
  assert.ok(!whitelistNumbers.has(number), `第${number}筆仍有疑義或待簽核，不得進入白名單`);
}

const permits = readJson("pesticides-latest.json").rows;
assert.ok(
  permits.some(row =>
    row.chineseName === "白克松" &&
    row.permit === "農藥製" &&
    row.permitNumber === "03772" &&
    !String(row.revocationType || "").trim()
  ),
  "第5筆校正所依據的有效白克松許可證不存在"
);

const mrlRows = readJson("latest.json").rows;
assert.ok(
  mrlRows.some(row =>
    String(row["國際普通名稱"]).toUpperCase() === "ZOXAMIDE" &&
    row["作物類別"] === "黑皮波羅門參" &&
    String(row["容許量ppm"]) === "0.02"
  ),
  "第77筆應保留的黑皮波羅門參Zoxamide標準不存在"
);

const exemptRows = readJson("mrl-exempt-latest.json").rows;
assert.ok(
  exemptRows.some(row =>
    Object.values(row).some(value => String(value).toUpperCase().includes("COPPER OXYCHLORIDE"))
  ),
  "Copper oxychloride應存在於免訂容許量清單"
);

const firebaseIgnore = fs.readFileSync(path.join(root, ".firebaseignore"), "utf8");
assert.match(firebaseIgnore, /^mrl-data\/?\s*$/m, "Firebase部署必須排除mrl-data");
assert.match(firebaseIgnore, /^mrl-data\/\*\*\s*$/m, "Firebase部署必須遞迴排除mrl-data");

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.doesNotMatch(html, /複核-已確認登記但不得檢出名單|登記但不得檢出-候選\.json/);

console.log("mrl-review-gate.test.js: all assertions passed");
