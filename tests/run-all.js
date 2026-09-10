const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

// Discover root test files so newly added release checks cannot be silently omitted.
const files = fs.readdirSync(__dirname).filter((file) => file.endsWith(".test.js")).sort();
for (const file of files) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

const taxonomyResult = spawnSync(process.execPath, [path.join(__dirname, "pest-taxonomy-search.test.js")], { stdio: "inherit" });
if (taxonomyResult.status !== 0) process.exit(taxonomyResult.status || 1);
const groupingResult = spawnSync(process.execPath, [path.join(__dirname, "pest-grouping-audit.test.js")], { stdio: "inherit" });
if (groupingResult.status !== 0) process.exit(groupingResult.status || 1);

console.log("\n全部測試完成");
