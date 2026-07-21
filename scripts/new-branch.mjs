/* 從最新的 main 開新分支。

   ── 為什麼需要這支腳本 ──
   本專案的 PR 一律以 Squash and merge 合併,main 上的 commit 與原分支
   內容相同但 SHA 不同。若從一個「後來被合併的分支」再開新分支,
   新分支會帶著那筆孤兒 commit,對 main 發 PR 時 Git 判定為兩條分歧的
   歷史都改了同一批檔案,直接產生衝突。

   這個錯誤在開發過程中重複發生了四次。共同特徵是:當下分支看起來是
   最新的,實際上它的 commit 已經以另一個 SHA 進了 main。

   用法:
     node scripts/new-branch.mjs feature/我的功能

   會強制回到 main、拉取最新、確認工作區乾淨,才建立新分支。 */

import { execSync } from "node:child_process";

const name = process.argv[2];
if (!name) {
  console.error("用法:node scripts/new-branch.mjs <分支名稱>");
  console.error("例如:node scripts/new-branch.mjs feature/crop-hints");
  process.exit(1);
}
if (!/^(feature|fix|docs|data)\//.test(name)) {
  console.error(`分支名稱應以 feature/ fix/ docs/ data/ 開頭,收到「${name}」`);
  process.exit(1);
}

const run = cmd => execSync(cmd, { encoding: "utf8" }).trim();

/* 工作區必須乾淨,否則未提交的變更會被帶到新分支造成混淆 */
const dirty = run("git status --porcelain");
if (dirty) {
  console.error("工作區有未提交的變更,請先處理:\n" + dirty);
  process.exit(1);
}

const before = run("git rev-parse --abbrev-ref HEAD");
run("git checkout main");
run("git pull --ff-only");
const head = run("git rev-parse --short main");

/* 分支已存在就不要覆蓋 —— 那通常代表上次的工作還沒收尾 */
const exists = run("git branch --list " + JSON.stringify(name));
if (exists) {
  console.error(`分支「${name}」已存在。若要重來請先刪除,或換個名稱。`);
  process.exit(1);
}

run(`git checkout -b ${name}`);
console.log(`✓ 已從 main (${head}) 建立分支「${name}」`);
if (before !== "main") console.log(`  (原本在 ${before})`);
console.log("\n完成後:");
console.log("  npm run release:bump -- <版本> <代號>   ← 有動到 index.html/sw.js 才需要");
console.log("  node tests/run-all.js");
