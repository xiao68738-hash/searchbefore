/* DATA 轉換規則測試。

   這幾條規則錯了不會有任何錯誤訊息,只會讓農友看到錯的安全採收期,
   或看到已經撤銷、買不到的藥劑。 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const mod = await import(pathToFileURL(path.resolve(__dirname, "..", "scripts", "data-rules.mjs")).href);
  const { parsePhi, moaOf, isActive, keyOf, sameUsage, makeEntry, noteOf } = mod;

  /* ── noteOf:安全警語優先於施用說明 ──
     官方分「注意事項」(138 列,安全警語如「鐵具腐蝕性」)與
     「備註」(92,773 列,施用方式)。只讀備註會讓 92 列失去警語。 */
  assert.equal(noteOf({ "注意事項": "鐵具腐蝕性", "備註": "標示加註對鐵具腐蝕性" }), "鐵具腐蝕性",
    "兩者皆有值時取注意事項,安全警語優先");
  assert.equal(noteOf({ "注意事項": "", "備註": "本試驗加展著劑CS-7，3000倍。" }), "本試驗加展著劑CS-7，3000倍。");
  assert.equal(noteOf({ "注意事項": "鐵具腐蝕性", "備註": "" }), "鐵具腐蝕性",
    "只有注意事項時不可漏掉");
  assert.equal(noteOf({ "注意事項": "-", "備註": "施用說明" }), "施用說明", "「-」視為無值");
  assert.equal(noteOf({}), "");

  /* ── parsePhi:null 與 0 絕不可混淆 ── */
  assert.equal(parsePhi("18日"), 18);
  assert.equal(parsePhi("3日"), 3);
  assert.equal(parsePhi("0日"), 0, "0 日代表當天可採收,必須保留為數字 0");
  assert.equal(parsePhi("-日"), null, "「-日」是未訂/不適用,必須是 null 而非 0");
  assert.equal(parsePhi("-"), null);
  assert.equal(parsePhi(""), null);
  assert.equal(parsePhi(null), null);
  assert.equal(parsePhi(undefined), null);
  assert.equal(parsePhi("不適用"), null, "非數字文字不可被當成 0");
  assert.notEqual(parsePhi("-日"), 0, "null 與 0 意義不同:未訂 vs 當天可採");
  assert.equal(parsePhi("日"), null, "只有「日」沒有數字,是官方的空值寫法(28,960 列)");

  /* ── 區間寫法:必須取上限,且絕不可把數字串接起來 ──
     官方有 496 列是區間。直接移除非數字字元會讓「7-15日」變成 715,
     等於叫農友等兩年,而且不會拋任何錯誤。 */
  assert.equal(parsePhi("7-15日"), 15, "區間取較長的一端,避免農友過早採收");
  assert.equal(parsePhi("90-100日"), 100);
  assert.notEqual(parsePhi("7-15日"), 715, "不可把區間的數字串接成一個數");
  assert.notEqual(parsePhi("7-15日"), 7, "不可取下限,那會讓農友提早採收而可能超標");
  assert.equal(parsePhi("6天日"), 6, "官方資料中的錯字寫法");

  /* ── isActive:撤銷日期的空值是佔位字串,不是空字串 ── */
  assert.equal(isActive({ "撤銷類別": "", "撤銷日期": "   /  /  " }), true,
    "「   /  /  」是未撤銷的佔位字串,判成已撤銷會讓 DATA 變成空的");
  assert.equal(isActive({ "撤銷類別": "", "撤銷日期": "" }), true);
  assert.equal(isActive({ "撤銷類別": "逾期廢止", "撤銷日期": "079/05/03" }), false);
  assert.equal(isActive({ "撤銷類別": "", "撤銷日期": "079/05/03" }), false,
    "只有日期沒有類別也算已撤銷");
  assert.equal(isActive({ "撤銷類別": "自請廢止", "撤銷日期": "   /  /  " }), false);

  /* ── moaOf:三種抗藥性代碼擇一 ── */
  assert.equal(moaOf({ "IRAC殺蟲劑抗藥性": "28" }), "IRAC 28");
  assert.equal(moaOf({ "FRAC殺菌劑抗藥性": "7" }), "FRAC 7");
  assert.equal(moaOf({ "HRAC除草劑抗藥性": "K1" }), "HRAC K1");
  assert.equal(moaOf({ "IRAC殺蟲劑抗藥性": null, "FRAC殺菌劑抗藥性": "3" }), "FRAC 3",
    "null 欄位要略過,取下一個有值的");
  assert.equal(moaOf({ "IRAC殺蟲劑抗藥性": "-" }), "", "「-」視為無值");
  assert.equal(moaOf({}), "");

  /* ── keyOf ── */
  assert.equal(keyOf({ "許可證字": "農藥製", "許可證號": "00001" }), "農藥製-00001");

  /* ── sameUsage:商品名不同仍應合併 ── */
  const base = { name: "快得保淨", form: "WP", content: "75.000 (%)", dilution: "600", phi: 18, dose: "-", times: "2-3", note: "備註" };
  assert.equal(sameUsage({ ...base }, { ...base }), true);
  assert.equal(sameUsage({ ...base, bl: ["甲"] }, { ...base, bl: ["乙"] }), true,
    "商品名不同不影響用法是否相同");
  assert.equal(sameUsage({ ...base }, { ...base, dilution: "1200" }), false);
  assert.equal(sameUsage({ ...base }, { ...base, phi: null }), false,
    "採收期 18 與 null 是不同用法,不可合併");

  /* ── makeEntry:實際案例逐欄比對 ──
     許可證 農藥製 00001「快得保淨」→ 木瓜/白粉病,與現有 DATA 該筆一致 */
  const e = makeEntry(
    { "中文名稱": "快得保淨", "劑型": "WP", "含量": "75.000 (%)", "FRAC殺菌劑抗藥性": null },
    { "作物名稱": "木瓜", "病蟲害名稱": "白粉病", "稀釋倍數": "600", "安全採收期": "18日",
      "每公頃使用用藥量": "-", "施用次數": "2-3", "備註": "本試驗加展著劑CS-7，3000倍。" }
  );
  assert.equal(e.name, "快得保淨");
  assert.equal(e.form, "WP");
  assert.equal(e.content, "75.000 (%)");
  assert.equal(e.dilution, "600");
  assert.equal(e.phi, 18);
  assert.equal(e.dose, "-");
  assert.equal(e.times, "2-3");
  assert.equal(e.note, "本試驗加展著劑CS-7，3000倍。");
  assert.deepEqual(e.bl, []);

  console.log("✓ DATA 轉換規則:採收期、撤銷判定、抗藥性代碼與用法合併正確");
})().catch(e => { console.error(e); process.exit(1); });
