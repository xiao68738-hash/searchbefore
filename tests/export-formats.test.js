const assert = require("node:assert/strict");
const PQC_EXPORT = require("../export-formats.js");

/* ── CRC32 正確性（已知向量）── */
assert.equal(PQC_EXPORT.crc32(Buffer.from("123456789", "ascii")), 0xCBF43926, "CRC32 標準向量應相符");

/* ── 欄字母 ── */
assert.equal(PQC_EXPORT.colLetter(0), "A");
assert.equal(PQC_EXPORT.colLetter(25), "Z");
assert.equal(PQC_EXPORT.colLetter(26), "AA");
assert.equal(PQC_EXPORT.colLetter(27), "AB");

/* ── 工作表名稱清理 ── */
assert.equal(PQC_EXPORT.sheetName("a/b:c[d]"), "a b c d");
assert.ok(PQC_EXPORT.sheetName("超過三十一個字元".repeat(10)).length <= 31, "工作表名稱應截斷至 31 字");
assert.equal(PQC_EXPORT.sheetName("", "後備"), "後備");

/* ── 建立 .xlsx 並驗證為合法 ZIP + OOXML ── */
const bytes = PQC_EXPORT.buildXlsx([{
  name: "用藥紀錄",
  head: ["日期", "藥劑", "稀釋倍數"],
  rows: [["2026-07-17", "亞滅培", "2000 倍"], ["2026-07-18", "賽洛寧 <測試> & \"引號\"", "1500"]]
}]);

assert.ok(bytes instanceof Uint8Array && bytes.length > 0, "應產生位元組");
assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x50, 0x4B, 0x03, 0x04], "應為 ZIP(PK) 檔頭");

const buf = Buffer.from(bytes);
// End Of Central Directory 簽章存在
assert.ok(buf.indexOf(Buffer.from([0x50, 0x4B, 0x05, 0x06])) >= 0, "應有中央目錄結尾");

const asText = buf.toString("utf8");
for (const part of [
  "[Content_Types].xml",
  "_rels/.rels",
  "xl/workbook.xml",
  "xl/_rels/workbook.xml.rels",
  "xl/worksheets/sheet1.xml"
]) {
  assert.ok(asText.indexOf(part) >= 0, "xlsx 應包含檔案 " + part);
}
// 內容以 inlineStr 寫入，且特殊字元已逸出（不得出現裸的 < 或 & 在資料值）
assert.ok(asText.indexOf('t="inlineStr"') >= 0, "資料應以 inlineStr 寫入");
assert.ok(asText.indexOf("&lt;測試&gt;") >= 0, "角括號應逸出");
assert.ok(asText.indexOf("&amp;") >= 0, "& 應逸出");
assert.ok(asText.indexOf("&quot;引號&quot;") >= 0, "引號應逸出");
assert.ok(asText.indexOf('name="用藥紀錄"') >= 0, "工作表名稱應寫入");

/* ── 逐一驗證每個 STORE 條目的 CRC 與宣告長度（確保 Excel 不會判定損毀）── */
(function verifyEntries() {
  let pos = 0, count = 0;
  while (pos + 4 <= buf.length && buf.readUInt32LE(pos) === 0x04034b50) {
    const crc = buf.readUInt32LE(pos + 14);
    const size = buf.readUInt32LE(pos + 18);
    const nameLen = buf.readUInt16LE(pos + 26);
    const extraLen = buf.readUInt16LE(pos + 28);
    const dataStart = pos + 30 + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + size);
    assert.equal(PQC_EXPORT.crc32(data) >>> 0, crc >>> 0, "STORE 條目 CRC 應相符");
    pos = dataStart + size;
    count++;
  }
  assert.equal(count, 5, "單一工作表應有 5 個內部檔案（Content_Types、2 組 rels、workbook、sheet1）");
})();

/* ── 多工作表 ── */
const multi = PQC_EXPORT.buildXlsx([
  { name: "A", head: ["x"], rows: [["1"]] },
  { name: "B", head: ["y"], rows: [["2"]] }
]);
const multiText = Buffer.from(multi).toString("utf8");
assert.ok(multiText.indexOf("xl/worksheets/sheet2.xml") >= 0, "第二個工作表應存在");

/* ── 列印用 HTML ── */
const html = PQC_EXPORT.tableHtml({
  title: "用藥紀錄",
  meta: "期間 全部",
  head: ["日期", "藥劑"],
  rows: [["2026-07-17", "亞滅培 <x>"]]
});
assert.ok(html.indexOf('<h1 class="print-title">用藥紀錄</h1>') >= 0, "應有標題");
assert.ok(html.indexOf("<table") >= 0 && html.indexOf("<th>日期</th>") >= 0, "應有表頭");
assert.ok(html.indexOf("亞滅培 &lt;x&gt;") >= 0, "列印內容應逸出");

const emptyHtml = PQC_EXPORT.tableHtml({ title: "空", head: ["a"], rows: [] });
assert.ok(emptyHtml.indexOf("沒有紀錄") >= 0, "空資料應顯示提示");

console.log("✓ 匯出格式:CRC32、欄位、xlsx 結構與 CRC、逸出與列印 HTML 正確");
