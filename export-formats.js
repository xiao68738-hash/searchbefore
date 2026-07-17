/* 噴前查匯出格式工具 PQC_EXPORT
   目標:在純前端、離線、無第三方套件的條件下，把紀錄表格輸出成
     1. 真正的 Excel .xlsx 檔（雙擊直接開，不跳格式警告）
     2. 可列印／存成 PDF 的排版畫面（中文正常，手機與電腦皆可）
   設計原則:不引入任何函式庫，維持 App 輕量與離線可用。
   .xlsx 內部即 ZIP + OOXML；此檔用 STORE(不壓縮) 方式手工組出合法的 xlsx。
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PQC_EXPORT = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ── UTF-8 編碼 ── */
  function utf8(str) {
    str = String(str == null ? "" : str);
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
    return Uint8Array.from(Buffer.from(str, "utf8")); // Node fallback
  }

  /* ── CRC32（ZIP 需要）── */
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ── XML 逸出（並移除 XML 1.0 不允許的控制字元，避免 Excel 判定檔案損毀）── */
  function xmlEscape(value) {
    return String(value == null ? "" : value)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  /* ── 欄索引轉字母（0->A, 26->AA）── */
  function colLetter(index) {
    let s = "";
    index += 1;
    while (index > 0) {
      const rem = (index - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      index = Math.floor((index - 1) / 26);
    }
    return s;
  }

  /* ── 工作表名稱清理:Excel 限制 31 字元且不可含 : \ / ? * [ ] ── */
  function sheetName(name, fallback) {
    let s = String(name == null ? "" : name).replace(/[:\\/?*\[\]]/g, " ").trim();
    if (!s) s = fallback || "工作表";
    return s.slice(0, 31);
  }

  /* ── 組出單一 worksheet XML ── */
  function worksheetXml(sheet) {
    const head = Array.isArray(sheet.head) ? sheet.head : [];
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    const all = head.length ? [head].concat(rows) : rows.slice();
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
    all.forEach(function (row, r) {
      const cells = Array.isArray(row) ? row : [row];
      xml += '<row r="' + (r + 1) + '">';
      cells.forEach(function (val, c) {
        const ref = colLetter(c) + (r + 1);
        // 全部以 inlineStr 輸出，對中文、代碼與混合內容最安全
        xml += '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">'
          + xmlEscape(val) + '</t></is></c>';
      });
      xml += '</row>';
    });
    xml += '</sheetData></worksheet>';
    return xml;
  }

  /* ── 把多個 (名稱, 位元組) 檔案打包成 STORE 方式的 ZIP ── */
  function zipStore(files) {
    const chunks = [];
    const central = [];
    let offset = 0;

    function pushU16(arr, v) { arr.push(v & 0xFF, (v >>> 8) & 0xFF); }
    function pushU32(arr, v) { arr.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF); }

    files.forEach(function (file) {
      const nameBytes = utf8(file.name);
      const data = file.data;
      const crc = crc32(data);
      const size = data.length;

      const local = [];
      pushU32(local, 0x04034b50);   // local file header signature
      pushU16(local, 20);           // version needed
      pushU16(local, 0x0800);       // flags: bit 11 = UTF-8 檔名
      pushU16(local, 0);            // compression: 0 = STORE
      pushU16(local, 0);            // mod time
      pushU16(local, 0);            // mod date
      pushU32(local, crc);
      pushU32(local, size);         // compressed size
      pushU32(local, size);         // uncompressed size
      pushU16(local, nameBytes.length);
      pushU16(local, 0);            // extra length
      const localHeader = Uint8Array.from(local);

      chunks.push(localHeader, nameBytes, data);

      const cd = [];
      pushU32(cd, 0x02014b50);      // central directory header signature
      pushU16(cd, 20);              // version made by
      pushU16(cd, 20);              // version needed
      pushU16(cd, 0x0800);          // flags
      pushU16(cd, 0);               // compression
      pushU16(cd, 0);               // mod time
      pushU16(cd, 0);               // mod date
      pushU32(cd, crc);
      pushU32(cd, size);
      pushU32(cd, size);
      pushU16(cd, nameBytes.length);
      pushU16(cd, 0);               // extra length
      pushU16(cd, 0);               // comment length
      pushU16(cd, 0);               // disk number start
      pushU16(cd, 0);               // internal attrs
      pushU32(cd, 0);               // external attrs
      pushU32(cd, offset);          // local header offset
      central.push(Uint8Array.from(cd), nameBytes);

      offset += localHeader.length + nameBytes.length + data.length;
    });

    const centralStart = offset;
    let centralSize = 0;
    central.forEach(function (c) { centralSize += c.length; });

    const end = [];
    pushU32(end, 0x06054b50);       // end of central directory signature
    pushU16(end, 0);                // disk number
    pushU16(end, 0);                // disk with central dir
    pushU16(end, files.length);     // entries on this disk
    pushU16(end, files.length);     // total entries
    pushU32(end, centralSize);
    pushU32(end, centralStart);
    pushU16(end, 0);                // comment length

    const parts = chunks.concat(central, [Uint8Array.from(end)]);
    let total = 0;
    parts.forEach(function (p) { total += p.length; });
    const out = new Uint8Array(total);
    let pos = 0;
    parts.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  /* ── 建立 .xlsx 位元組（sheets: [{name, head, rows}]）── */
  function buildXlsx(sheets) {
    const list = (Array.isArray(sheets) ? sheets : [sheets]).map(function (s, i) {
      return { name: sheetName(s && s.name, "工作表" + (i + 1)), head: s && s.head, rows: s && s.rows };
    });
    if (!list.length) list.push({ name: "工作表1", head: [], rows: [] });

    const files = [];

    const overrides = list.map(function (s, i) {
      return '<Override PartName="/xl/worksheets/sheet' + (i + 1)
        + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    }).join("");
    files.push({
      name: "[Content_Types].xml",
      data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + overrides + '</Types>')
    });

    files.push({
      name: "_rels/.rels",
      data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>')
    });

    const sheetTags = list.map(function (s, i) {
      return '<sheet name="' + xmlEscape(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
    }).join("");
    files.push({
      name: "xl/workbook.xml",
      data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<sheets>' + sheetTags + '</sheets></workbook>')
    });

    const rels = list.map(function (s, i) {
      return '<Relationship Id="rId' + (i + 1)
        + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'
        + (i + 1) + '.xml"/>';
    }).join("");
    files.push({
      name: "xl/_rels/workbook.xml.rels",
      data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + rels + '</Relationships>')
    });

    list.forEach(function (s, i) {
      files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", data: utf8(worksheetXml(s)) });
    });

    return zipStore(files);
  }

  const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  function xlsxBlob(sheets) {
    if (typeof Blob === "undefined") throw new Error("此環境不支援 Blob");
    return new Blob([buildXlsx(sheets)], { type: XLSX_MIME });
  }

  /* ── 列印／存成 PDF 用的表格 HTML ──
     options: { title, meta, head, rows }  或  { title, meta, sections:[{caption, head, rows}] }
  */
  function tableHtml(options) {
    const opts = options || {};
    const title = xmlEscape(opts.title || "噴前查紀錄");
    const meta = opts.meta ? '<p class="print-meta">' + xmlEscape(opts.meta) + "</p>" : "";
    const sections = Array.isArray(opts.sections) ? opts.sections
      : [{ caption: "", head: opts.head, rows: opts.rows }];
    let body = "";
    sections.forEach(function (sec) {
      const head = Array.isArray(sec.head) ? sec.head : [];
      const rows = Array.isArray(sec.rows) ? sec.rows : [];
      if (sec.caption) body += '<h2 class="print-caption">' + xmlEscape(sec.caption) + "</h2>";
      body += '<table class="print-table"><thead><tr>'
        + head.map(function (h) { return "<th>" + xmlEscape(h) + "</th>"; }).join("")
        + "</tr></thead><tbody>";
      if (!rows.length) {
        body += '<tr><td colspan="' + (head.length || 1) + '" class="print-empty">沒有紀錄</td></tr>';
      } else {
        rows.forEach(function (row) {
          const cells = Array.isArray(row) ? row : [row];
          body += "<tr>" + cells.map(function (v) { return "<td>" + xmlEscape(v) + "</td>"; }).join("") + "</tr>";
        });
      }
      body += "</tbody></table>";
    });
    return '<h1 class="print-title">' + title + "</h1>" + meta + body;
  }

  return {
    crc32: crc32,
    colLetter: colLetter,
    sheetName: sheetName,
    buildXlsx: buildXlsx,
    xlsxBlob: xlsxBlob,
    tableHtml: tableHtml,
    XLSX_MIME: XLSX_MIME
  };
});
