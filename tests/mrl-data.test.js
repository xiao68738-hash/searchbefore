const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const lib = await import(pathToFileURL(path.join(__dirname, "..", "mrl-data", "lib.mjs")));

  assert.deepEqual(
    lib.splitActiveIngredients(" THIOPHANATE-METHYL + OXINE-COPPER "),
    ["THIOPHANATE-METHYL", "OXINE-COPPER"]
  );
  assert.deepEqual(
    lib.splitActiveIngredients("FLUXAPYROXAD+PYRACLOSTROBIN"),
    ["FLUXAPYROXAD", "PYRACLOSTROBIN"]
  );

  const rows = [
    { chineseName: "單劑甲", englishName: "ALPHA" },
    { chineseName: "混合乙", englishName: "BETA + GAMMA" },
    { chineseName: "歧義丙", englishName: "DELTA" },
    { chineseName: "歧義丙", englishName: "DELTA + EPSILON" }
  ];
  const index = lib.buildPesticideNameIndex(rows);

  assert.deepEqual(lib.resolvePesticideName("單劑甲", index), {
    status: "resolved",
    reason: "official-name-match",
    components: ["ALPHA"]
  });
  assert.deepEqual(lib.resolvePesticideName("混合乙", index).components, ["BETA", "GAMMA"]);
  assert.equal(lib.resolvePesticideName("歧義丙", index).status, "ambiguous");
  assert.equal(lib.resolvePesticideName("查無", index).status, "unresolved");

  const classified = lib.classifyComponents(
    ["ALPHA", "BETA", "UNKNOWN"],
    new Set(["ALPHA"]),
    new Set(["BETA"])
  );
  assert.deepEqual(classified.map(item => item.status), ["mrl-listed", "exempt", "unresolved"]);

  assert.deepEqual(
    lib.parseCropCategoryMembers("水稻、旱稻等。"),
    ["水稻", "旱稻"]
  );
  assert.equal(lib.contentHash([{ a: 1 }]), lib.contentHash([{ a: 1 }]));

  console.log("MRL 資料對照基礎測試通過");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
