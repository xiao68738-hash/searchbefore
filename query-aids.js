/* 噴前查 查詢輔助 PQC_AIDS
   兩個獨立但都屬「查詢顯示輔助」的功能:

   A. 害物從屬提示 —— 群組(如「夜蛾類」)與具體物種(如「斜紋夜蛾」)在資料庫
      是各自獨立條目,藥劑清單常完全不重疊(排查:42 組從屬中 18 組交集為 0)。
      只做搜尋歸納與分組預覽,不合併原登記清單。

   B. 種子/種苗處理辨識 —— 這類藥劑於播種前施用,採收期本就不適用;
      現行顯示「見標示」易被誤解為資料缺漏,也可能被誤當噴施用藥。

   ── 不可破壞的原則 ──
   1. 從屬只採有來源的明確對照，不以名稱字根或末字推論
      (排查證實會產生「毒蛾類⊃斜紋夜蛾」「根蟎類⊃二點葉蟎」等誤判)。
   2. 從屬提示不得自動合併藥劑清單(同交接文件安全規則 7)。
   3. 種子處理辨識只依備註明確文字,不推測。
   4. 兩者皆為顯示層輔助,不參與安全採收期計算。
   詳見 docs/害物從屬階層排查.md
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PQC_AIDS = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ── 搜尋容錯核心 ──
     所有近似結果都只能是「建議」,不得自動選定或直接當成合法用藥結論。
     中文讀音只在本機以 pinyin-pro 轉換,不會把查詢送到外部服務。 */
  let cachedPinyinApi = null;
  const readingCache = new Map();

  function getPinyinApi() {
    if (cachedPinyinApi) return cachedPinyinApi;
    if (typeof globalThis !== "undefined" && globalThis.pinyinPro) {
      cachedPinyinApi = globalThis.pinyinPro;
      return cachedPinyinApi;
    }
    if (typeof require === "function") {
      try { cachedPinyinApi = require("pinyin-pro"); } catch (_) { /* 瀏覽器不使用 require */ }
    }
    return cachedPinyinApi;
  }

  function normalizeSearchText(value) {
    return String(value == null ? "" : value)
      .normalize("NFKC")
      .toLocaleLowerCase("zh-Hant")
      .replace(/[\s·‧・,，.。()（）【】\[\]{}「」『』'"_\-–—/\\]/g, "");
  }

  function normalizeLatin(value) {
    return String(value == null ? "" : value)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/ü/g, "v").replace(/[^a-zv]/g, "");
  }

  const BPMF_INITIAL = {
    "ㄅ":"b","ㄆ":"p","ㄇ":"m","ㄈ":"f","ㄉ":"d","ㄊ":"t","ㄋ":"n","ㄌ":"l",
    "ㄍ":"g","ㄎ":"k","ㄏ":"h","ㄐ":"j","ㄑ":"q","ㄒ":"x","ㄓ":"zh","ㄔ":"ch",
    "ㄕ":"sh","ㄖ":"r","ㄗ":"z","ㄘ":"c","ㄙ":"s"
  };
  const BPMF_FINAL = {
    "ㄚ":"a","ㄛ":"o","ㄜ":"e","ㄝ":"e","ㄞ":"ai","ㄟ":"ei","ㄠ":"ao","ㄡ":"ou",
    "ㄢ":"an","ㄣ":"en","ㄤ":"ang","ㄥ":"eng","ㄦ":"er","ㄧ":"i","ㄧㄚ":"ia",
    "ㄧㄛ":"io","ㄧㄝ":"ie","ㄧㄞ":"iai","ㄧㄠ":"iao","ㄧㄡ":"iu","ㄧㄢ":"ian",
    "ㄧㄣ":"in","ㄧㄤ":"iang","ㄧㄥ":"ing","ㄨ":"u","ㄨㄚ":"ua","ㄨㄛ":"uo",
    "ㄨㄞ":"uai","ㄨㄟ":"ui","ㄨㄢ":"uan","ㄨㄣ":"un","ㄨㄤ":"uang","ㄨㄥ":"ong",
    "ㄩ":"v","ㄩㄝ":"ve","ㄩㄢ":"van","ㄩㄣ":"vn","ㄩㄥ":"iong"
  };
  const BPMF_ZERO = {
    "ㄚ":"a","ㄛ":"o","ㄜ":"e","ㄝ":"e","ㄞ":"ai","ㄟ":"ei","ㄠ":"ao","ㄡ":"ou",
    "ㄢ":"an","ㄣ":"en","ㄤ":"ang","ㄥ":"eng","ㄦ":"er","ㄧ":"yi","ㄧㄚ":"ya",
    "ㄧㄛ":"yo","ㄧㄝ":"ye","ㄧㄞ":"yai","ㄧㄠ":"yao","ㄧㄡ":"you","ㄧㄢ":"yan",
    "ㄧㄣ":"yin","ㄧㄤ":"yang","ㄧㄥ":"ying","ㄨ":"wu","ㄨㄚ":"wa","ㄨㄛ":"wo",
    "ㄨㄞ":"wai","ㄨㄟ":"wei","ㄨㄢ":"wan","ㄨㄣ":"wen","ㄨㄤ":"wang","ㄨㄥ":"weng",
    "ㄩ":"yu","ㄩㄝ":"yue","ㄩㄢ":"yuan","ㄩㄣ":"yun","ㄩㄥ":"yong"
  };

  function splitBopomofo(value) {
    const out = [];
    let part = "";
    for (const ch of String(value || "").replace(/\s+/g, "")) {
      if (/[ˊˇˋ˙]/.test(ch)) { if (part) out.push(part); part = ""; continue; }
      if (BPMF_INITIAL[ch] && part) { out.push(part); part = ch; }
      else part += ch;
    }
    if (part) out.push(part);
    return out;
  }

  function bopomofoSyllableToPinyin(syllable) {
    const first = syllable.charAt(0);
    const initial = BPMF_INITIAL[first] || "";
    const finalKey = initial ? syllable.slice(1) : syllable;
    if (!initial) return BPMF_ZERO[finalKey] || "";
    let final = BPMF_FINAL[finalKey] || "";
    if (!final && /^(zh|ch|sh|r|z|c|s)$/.test(initial)) final = "i";
    if (/^[jqx]$/.test(initial)) {
      if (final === "v") final = "u";
      else if (final === "ve") final = "ue";
      else if (final === "van") final = "uan";
      else if (final === "vn") final = "un";
    }
    return final ? initial + final : "";
  }

  function bopomofoToPinyin(value) {
    return splitBopomofo(value).map(bopomofoSyllableToPinyin).filter(Boolean).join("");
  }

  function readingProfile(value) {
    const raw = String(value == null ? "" : value).trim();
    const cacheKey = raw;
    if (readingCache.has(cacheKey)) return readingCache.get(cacheKey);
    let full = "", initials = "", source = "none";
    if (/[ㄅ-ㄩ]/.test(raw)) {
      full = normalizeLatin(bopomofoToPinyin(raw));
      source = "bopomofo";
    } else if (/^[a-zA-ZüÜvV\s'\-]+$/.test(raw)) {
      full = normalizeLatin(raw);
      source = "pinyin";
    } else if (/\p{Script=Han}/u.test(raw)) {
      const api = getPinyinApi();
      if (api && typeof api.pinyin === "function") {
        const parts = api.pinyin(raw, { toneType: "none", type: "array", v: true, nonZh: "removed" }) || [];
        full = normalizeLatin(parts.join(""));
        initials = parts.map(function (part) { return normalizeLatin(part).charAt(0); }).join("");
        source = "han";
      }
    }
    const result = { full: full, initials: initials, source: source };
    readingCache.set(cacheKey, result);
    return result;
  }

  function damerauLevenshtein(a, b) {
    a = String(a || ""); b = String(b || "");
    const rows = a.length + 1, cols = b.length + 1;
    const d = Array.from({ length: rows }, function () { return Array(cols).fill(0); });
    for (let i = 0; i < rows; i++) d[i][0] = i;
    for (let j = 0; j < cols; j++) d[0][j] = j;
    for (let i = 1; i < rows; i++) {
      for (let j = 1; j < cols; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[a.length][b.length];
  }

  function sameCharacters(a, b) {
    return a.length > 1 && a.length === b.length && Array.from(a).sort().join("") === Array.from(b).sort().join("");
  }

  function candidateMatch(query, candidate) {
    const q = normalizeSearchText(query), c = normalizeSearchText(candidate);
    if (!q || !c) return null;
    if (q === c) return { kind: "exact", score: 1, label: "完全符合" };
    if (c.includes(q)) return { kind: "contains", score: 0.96, label: "名稱包含" };
    /* 只擷取句子中已知的正式名稱或已審核別名，不憑空推論未知藥名。
       結果仍是待使用者點選確認的候選，不得直接進入登記內容。 */
    if (c.length >= 2 && q.includes(c)) return { kind: "semantic", score: 0.94, label: "從輸入內容辨識" };
    if (sameCharacters(q, c)) return { kind: "reordered", score: 0.91, label: "字序可能顛倒" };

    const qp = readingProfile(query), cp = readingProfile(candidate);
    if (qp.full && cp.full) {
      if (qp.full === cp.full) {
        const kind = qp.source === "han" ? "homophone" : (qp.source === "bopomofo" ? "bopomofo" : "pinyin");
        return { kind: kind, score: 0.9, label: qp.source === "han" ? "讀音相同" : (qp.source === "bopomofo" ? "注音符合" : "拼音符合") };
      }
      if ((qp.source === "pinyin" || qp.source === "bopomofo") && cp.initials && qp.full === cp.initials) {
        return { kind: "pinyin-initials", score: 0.87, label: "拼音縮寫符合" };
      }
      if (qp.full.length >= 4) {
        const pd = damerauLevenshtein(qp.full, cp.full);
        const maxPinyinDistance = qp.full.length >= 8 ? 2 : 1;
        if (pd <= maxPinyinDistance) return { kind: "pronunciation-near", score: 0.82 - pd * 0.02, label: "讀音相近" };
      }
    }

    if (q.length >= 2) {
      const distance = damerauLevenshtein(q, c);
      const maxDistance = Math.max(q.length, c.length) >= 6 ? 2 : 1;
      if (distance <= maxDistance) return { kind: "typo", score: 0.8 - distance * 0.03, label: "可能有錯字" };
    }
    return null;
  }

  function fuzzyCandidates(query, candidates, limit) {
    limit = limit || 12;
    return Array.from(new Set(candidates || [])).map(function (value) {
      const match = candidateMatch(query, value);
      return match ? { value: value, kind: match.kind, score: match.score, label: match.label } : null;
    }).filter(Boolean).filter(function (item) { return item.kind !== "exact" && item.kind !== "contains"; })
      .sort(function (a, b) { return b.score - a.score || a.value.length - b.value.length; }).slice(0, limit);
  }

  /* ── A. 害物從屬 ── */
  /* 官方查詢群組 != 生物學科別 != 登記適用範圍。
     來源：2026-09-08 官方 DOM；只採同名唯一對應，明列所有祖先，不以字根推論。
     完整來源與代碼：tests/fixtures/pest-official-tree-2026-09-08.txt
     證據與限制：docs/PEST-GROUPING-SEARCH-2026-09-09.md */
  const OFFICIAL_PEST_GROUPS = new Map([
    ["水螟類", ["褐帶紋水螟蛾"]],
    ["草螟蛾類", ["甜菜白帶野螟蛾"]],
    ["松葉蜂科", ["松綠葉蜂"]],
    ["介殼蟲類", ["盾介殼蟲類","粉介殼蟲類","膠蟲","軟介殼蟲類"]],
    ["刺蛾類", ["黃刺蛾"]],
    ["夜蛾類", ["切根蟲","大螟","小造橋蟲","擬尺蠖","斜紋夜蛾","甜菜夜蛾","稻螟蛉"]],
    ["天蛾類", ["蝦殼天蛾"]],
    ["木蠹蛾類", ["咖啡木蠹蛾"]],
    ["果實蠅類", ["東方果實蠅","瓜實蠅"]],
    ["椿象類", ["南方綠椿象","竹盲椿象","花編蟲","青椿象","黑椿象","黑盲椿象"]],
    ["毒蛾類", ["黑角舞蛾"]],
    ["潛蠅類", ["斑潛蠅類","根潛蠅類","番茄斑潛蠅","莖潛蠅類","蔥潛蠅","韭潛蠅"]],
    ["癭蚋類", ["壯鋏普癭蚋","荔枝癭蚋"]],
    ["稻熱病", ["穗稻熱病","葉稻熱病"]],
    ["稻蝨類", ["斑飛蝨","褐飛蝨","長綠飛蝨"]],
    ["積穀害蟲", ["穀蠹","菸甲蟲","蒜頭蛀蟲"]],
    ["粉蝨類", ["柑桔刺粉蝨","溫室粉蝨","銀葉粉蝨","黑疣粉蝨"]],
    ["細蛾類", ["柑桔潛葉蛾","檬果細蛾","荔枝細蛾"]],
    ["細蟎類", ["稻細蟎"]],
    ["花薊馬類", ["花薊馬"]],
    ["葉蜂類", ["優美藺葉蜂"]],
    ["葉蟎類", ["二點葉蟎","柑桔葉蟎","神澤氏葉蟎","赤葉蟎"]],
    ["葉蟬類", ["二點小綠葉蟬","小綠葉蟬","綠葉蟬","黑尾葉蟬"]],
    ["葉部薊馬類", ["南黃薊馬","小黃薊馬","淡色薊馬","腹鉤薊馬","蔥薊馬"]],
    ["薊馬類", ["南黃薊馬","小黃薊馬","淡色薊馬","腹鉤薊馬","花薊馬","花薊馬類","葉部薊馬類","蔥薊馬"]],
    ["蚜蟲類", ["偽菜蚜","大桔蚜","柑桔捲葉蚜","梨瘤蚜","棉蚜","蘋果綿蚜","豆蚜","高粱蚜"]],
    ["蝗蟲類", ["條背土蝗"]],
    ["螟蛾類", ["一點螟蟲","二化螟蟲","大菜螟","玉米螟","瘤野螟","菜心螟"]],
    ["蟎蜱類", ["二點葉蟎","捲葉節蟎","柑桔葉蟎","柑桔銹蟎","根蟎類","神澤氏葉蟎","稻細蟎","細蟎類","葉蟎類","赤葉蟎","銹蜱類"]],
    ["象鼻蟲類", ["假莖象鼻蟲","水象鼻蟲","球莖象鼻蟲","稻象鼻蟲"]],
    ["金花蟲類", ["負泥蟲","鐵甲蟲","黃守瓜","黃條葉蚤"]],
    ["銹蜱類", ["捲葉節蟎","柑桔銹蟎"]],
    ["鱗翅目害蟲", ["一點螟蟲","二化螟蟲","切根蟲","刺蛾類","咖啡木蠹蛾","夜蛾類","大菜螟","大螟","天蛾類","小菜蛾","小造橋蟲","尺蠖蛾類","捲葉蛾類","擬尺蠖","斜紋夜蛾","木蠹蛾類","松毛蟲","柑桔潛葉蛾","椰子綴蛾","樹蔭蝶","檬果細蛾","毒蛾類","燈蛾類","玉米螟","甘藷潛葉蛾","甜菜夜蛾","甜菜白帶野螟蛾","瘤野螟","稻苞蟲","稻螟蛉","紋白蝶","細蛾類","茶蠶","荔枝細蛾","菜心螟","蝦殼天蛾","螟蛾類","褐帶紋水螟蛾","避債蛾類","鳥羽蛾類","鳳蝶類","黃刺蛾","黑角舞蛾"]]
  ].map(function (entry) { return [entry[0], new Set(entry[1])]; }));
  // 獨立科別證據：官方 UI 把秋行軍蟲放在「其他」，不因此撤回既有分類搜尋。
  const SCIENTIFIC_PEST_GROUPS = new Map([
    ["夜蛾科", new Set(["斜紋夜蛾", "甜菜夜蛾", "秋行軍蟲", "切根蟲", "大螟", "稻螟蛉"])],
    ["夜蛾類", new Set(["秋行軍蟲"])],
    ["鱗翅目害蟲", new Set(["秋行軍蟲"])]
  ]);
  const PEST_ALIASES = new Map([
    ["鱗翅目", "鱗翅目害蟲"], ["鱗翅目害蟲", "鱗翅目害蟲"],
    ["夜蛾", "夜蛾類"], ["夜蛾類", "夜蛾類"],
    ["斜紋夜盜蛾", "斜紋夜蛾"], ["切根蟲類", "切根蟲"],
    ["一點螟蛾", "一點螟蟲"],
    ["二化螟蛾", "二化螟蟲"],
    ["鋸蠅", "偽毛蟲"],
    ["紫螟", "大螟"],
    ["姬黃薊馬", "小黃薊馬"],
    ["茶黃薊馬", "小黃薊馬"],
    ["捲葉蚜", "柑桔捲葉蚜"],
    ["梨綠蚜", "柑桔捲葉蚜"],
    ["柑桔皺葉刺節蜱", "柑桔銹蟎"],
    ["臺灣兜蟲", "犀角金龜"],
    ["癭蠅類", "癭蚋類"],
    ["盾介殼蟲科", "盾介殼蟲類"],
    ["草地貪夜蛾", "秋行軍蟲"],
    ["秋粘蟲", "秋行軍蟲"],
    ["草地夜蛾", "秋行軍蟲"],
    ["飛蝨類", "稻蝨類"],
    ["苗腐病", "苗立枯病"],
    ["蒂蛀蟲", "荔枝細蛾"],
    ["棉長鬚象蟲", "蒜頭蛀蟲"],
    ["長角象鼻蟲", "蒜頭蛀蟲"],
    ["草皮地下害蟲", "蠐螬害蟲"],
    ["軟介殼蟲科", "軟介殼蟲類"],
    ["節蟎類", "銹蜱類"],
    ["銹蜱", "銹蜱類"],
    ["節蜱科", "銹蜱類"],
    ["銹蟎", "銹蜱類"]
  ]);
  const AMBIGUOUS_PEST_NAMES = new Set(["扁蝸牛", "炭疽病", "立枯病", "黃葉病"]);
  function canonicalPest(value) {
    const p = normalizeSearchText(value);
    return AMBIGUOUS_PEST_NAMES.has(p) ? p : (PEST_ALIASES.get(p) || p);
  }
  function groupStem(pest) {
    const p = String(pest || "");
    return /類$/.test(p) ? p.slice(0, -1) : null;
  }
  function pestRelation(group, child) {
    group = canonicalPest(group); child = canonicalPest(child);
    if (group === child || AMBIGUOUS_PEST_NAMES.has(group) || AMBIGUOUS_PEST_NAMES.has(child)) return null;
    if (OFFICIAL_PEST_GROUPS.get(group)?.has(child)) return "official-group";
    if (SCIENTIFIC_PEST_GROUPS.get(group)?.has(child)) return "scientific";
    return null;
  }
  function isParentOf(group, child) {
    return pestRelation(group, child) !== null;
  }
  const SEARCH_GROUPS = Array.from(new Set([
    ...OFFICIAL_PEST_GROUPS.keys(), ...SCIENTIFIC_PEST_GROUPS.keys()
  ]));
  const GROUP_QUERY_TERMS = SEARCH_GROUPS.map(function (group) {
    return [group, [group, ...Array.from(PEST_ALIASES)
      .filter(function (entry) { return entry[1] === group; })
      .map(function (entry) { return entry[0]; })]];
  });
  const KNOWN_PEST_NAMES = new Set([
    ...SEARCH_GROUPS, ...PEST_ALIASES.values(), ...AMBIGUOUS_PEST_NAMES,
    ...Array.from(OFFICIAL_PEST_GROUPS.values()).flatMap(function (children) { return Array.from(children); }),
    ...Array.from(SCIENTIFIC_PEST_GROUPS.values()).flatMap(function (children) { return Array.from(children); })
  ]);
  /* 只允許分類入口做部分字串比對；物種別名須完整吻合。
     結果只能由呼叫端的同作物原始條目供應，不能逆向套用上位登記。 */
  function pestSearchMatch(query, pest) {
    const q = normalizeSearchText(query), p = normalizeSearchText(pest);
    if (!q) return { kind: "all", label: "" };
    if (p === q || (p.includes(q) && !SEARCH_GROUPS.includes(q))) return { kind: "name", label: "" };
    const cq = canonicalPest(q), cp = canonicalPest(p);
    // 可提示官方查詢群組，但不能將其所有成員當作現行夜蛾科。
    if (cq === "夜蛾科" && cp === "夜蛾類") {
      return { kind: "taxonomy", evidence: "group-query", label: "查詢群組・原登記：" + pest };
    }
    if (cq === cp) return { kind: "alias", label: "名稱對照・原登記：" + pest };
    let evidence = pestRelation(cq, cp);
    // 已知完整名稱只按本身對照，不能把「螟蛾類」當成「草螟蛾類」的片段。
    if (!evidence && q.length >= 2 && !KNOWN_PEST_NAMES.has(cq)) {
      for (const [group, terms] of GROUP_QUERY_TERMS) {
        if (!terms.some(function (term) { return term.includes(q); })) continue;
        evidence = group === cp ? "group-query" : pestRelation(group, cp);
        if (evidence) break;
      }
    }
    if (evidence) return { kind: "taxonomy", evidence: evidence, label: "分類相關・原登記：" + pest };
    return null;
  }
  /* 同一作物內,與 pest 有從屬關係的其他害物。
     回傳 [{pest, relation:"parent"|"child", agentCount}],依藥劑數多寡排序。 */
  function relatedPests(crop, pest, data) {
    const bucket = (data && data[crop]) || null;
    if (!bucket || !pest || !bucket[pest]) return [];
    const out = [];
    for (const other of Object.keys(bucket)) {
      if (other === pest) continue;
      let relation = null;
      if (canonicalPest(other) === canonicalPest(pest)) relation = "alias";
      else if (isParentOf(other, pest)) relation = "parent";
      else if (isParentOf(pest, other)) relation = "child";
      if (!relation) continue;
      out.push({ pest: other, relation: relation, agentCount: (bucket[other] || []).length });
    }
    return out.sort(function (a, b) { return b.agentCount - a.agentCount; });
  }
  function relatedPestRegistrations(crop, pest, data) {
    return relatedPests(crop, pest, data).filter(function (r) { return r.agentCount > 0; })
      .map(function (r) {
        const names = Array.from(new Set(data[crop][r.pest].map(function (a) { return a.name; }).filter(Boolean)))
          .sort(function (a, b) { return a.localeCompare(b, "zh-Hant"); });
        return { pest: r.pest, relation: r.relation, agentCount: r.agentCount, names: names };
      });
  }

  /* ── B. 種子/種苗處理 ── */
  const SEED_RE = /種子處理|種苗處理|拌種|浸種|稻種(?:浸|混拌|消毒)|每公斤稻種|公斤種子|種薯|種球/;
  function isSeedTreatment(agent) {
    if (!agent) return false;
    return SEED_RE.test([agent.dose, agent.note].filter(Boolean).join(" "));
  }

  /* 只有純數字或數字區間才是「倍數」。官方欄位也會放入「稀釋至600公升」、
     「均勻撒布」、「原液」等施用方式；這些值若一律加上「倍」會改變原意。 */
  const DILUTION_MULTIPLE_RE = /^\s*\d[\d,]*(?:\.\d+)?(?:\s*[-~～至]\s*\d[\d,]*(?:\.\d+)?)?\s*$/;
  function isDilutionMultiple(value) {
    return DILUTION_MULTIPLE_RE.test(String(value == null ? "" : value));
  }
  function usagePurpose(agent, raw) {
    agent = agent || {};
    raw = String(raw == null ? agent.dilution || "" : raw).trim();
    const dose = String(agent.dose || "").trim();
    const note = String(agent.note || "").trim();
    const text = [raw, dose, note].join(" ");
    if (isSeedTreatment(agent)) return { kind: "seed_treatment", value: "種子處理" };
    if (/育苗箱|育苗盤|苗床/.test(text)) return { kind: "nursery_treatment", value: "育苗設施處理" };
    if (/費洛蒙|誘蟲器|誘蟲盒|誘餌/.test(text)) return { kind: "pheromone", value: "誘引／費洛蒙使用" };
    if (/燻蒸|薰蒸|密閉蒸/.test(text)) return { kind: "fumigation", value: "燻蒸處理" };
    if (/樹幹.{0,20}(?:注入|注射)|(?:注入|注射).{0,20}樹幹/.test(text)) return { kind: "trunk_injection", value: "樹幹注入處理" };
    if (/浸泡|浸漬|浸濕|浸潤/.test(text)) return { kind: "soaking", value: "浸泡／浸漬處理" };
    if (/塗抹|塗佈|粉衣/.test(text)) return { kind: "coating", value: "塗抹／包覆處理" };
    if (/原液/.test(raw)) return { kind: "undiluted", value: "原液施用" };
    if (/公升|公撮|毫升|\bL\b|L\s*\/|水量|加水|稀釋至/i.test(raw)) return { kind: "water_volume", value: "依登記水量施用" };
    if (/^\s*\d[\d,]*(?:\.\d+)?\s*:\s*\d[\d,]*(?:\.\d+)?\s*$/.test(raw)) return { kind: "mixing_ratio", value: "依登記比例調配" };
    if (/撒布|撒佈|撒施|混土|溝施|穴施|土壤|土面|畦面|灌根|淋灌|埋入/.test(text)) return { kind: "soil_treatment", value: "土壤／撒施處理" };
    if (/GR|粒劑/i.test(String(agent.form || ""))) return { kind: "granule", value: "粒劑施用" };
    if (raw && !/^-+$/.test(raw)) return { kind: "special_method", value: "依登記方式施用" };
    if (dose && !/^-+$/.test(dose)) return { kind: "registered_dose", value: "依登記用量施用" };
    if (note && !/^-+$/.test(note)) return { kind: "registered_note", value: "依登記附註施用" };
    return { kind: "unconfirmed", value: "用途待核對產品標示" };
  }
  function usagePresentation(agent) {
    agent = agent || {};
    const raw = String(agent.dilution == null ? "" : agent.dilution).trim();
    if (isDilutionMultiple(raw)) {
      return { kind: "dilution", label: "稀釋倍數", value: raw + " 倍", detail: "", raw: raw, canCalculateDilution: true, isSpecial: false };
    }
    const purpose = usagePurpose(agent, raw);
    const detail = raw && !/^-+$/.test(raw) ? raw : "";
    return { kind: purpose.kind, label: "施用用途", value: purpose.value, detail: detail, raw: raw, canCalculateDilution: false, isSpecial: true };
  }

  /* 將同一作物的登記資料反向整理成「藥劑 → 防治對象」。
     只重組呼叫端傳入的既有登記列，不推論作物群組、相近藥名或額外用途。 */
  function cropAgentOverview(pestBuckets) {
    const grouped = new Map();
    const pests = Object.keys(pestBuckets || {});
    for (let pi = 0; pi < pests.length; pi++) {
      const pest = pests[pi];
      const bucket = pestBuckets[pest];
      const list = Array.isArray(bucket) ? bucket : ((bucket && bucket.list) || []);
      for (let ai = 0; ai < list.length; ai++) {
        const agent = list[ai];
        const name = String(agent && agent.name || "").trim();
        if (!name) continue;
        let record = grouped.get(name);
        if (!record) {
          record = { name: name, pests: new Set(), forms: new Set(), sources: new Set(), rows: [] };
          grouped.set(name, record);
        }
        record.pests.add(pest);
        if (agent.form) record.forms.add(String(agent.form));
        if (agent.src) record.sources.add(String(agent.src));
        record.rows.push({ pest: pest, a: agent });
      }
    }
    return Array.from(grouped.values()).map(function (record) {
      return {
        name: record.name,
        pests: Array.from(record.pests).sort(function (a, b) { return String(a).localeCompare(String(b), "zh-Hant"); }),
        forms: Array.from(record.forms).sort(function (a, b) { return String(a).localeCompare(String(b), "zh-Hant"); }),
        sources: Array.from(record.sources).sort(function (a, b) { return String(a).localeCompare(String(b), "zh-Hant"); }),
        rows: record.rows
      };
    }).sort(function (a, b) {
      return b.pests.length - a.pests.length || String(a.name).localeCompare(String(b.name), "zh-Hant");
    });
  }

  /* ── C. 藥劑本位索引(DATA 是作物本位,這裡建反向索引) ──
     設計依據見 docs/藥劑本位查詢-設計.md:
     - rows 只存「參照」,a 直接指向 DATA 內既有物件,不複製資料。
       這讓索引與 DATA 不可能出現倍數/採收期不一致(結構性保證)。
     - 入口以「普通名稱」為 key;劑型/含量的差異留到結果頁分層呈現。
     - 商品名另建索引,因農友多半記得商品名而非普通名稱。 */
  function buildAgentIndex(data) {
    const byName = new Map();
    const byBrand = new Map();
    const crops = Object.keys(data || {});
    for (let ci = 0; ci < crops.length; ci++) {
      const crop = crops[ci];
      const pests = data[crop] || {};
      const pestNames = Object.keys(pests);
      for (let pi = 0; pi < pestNames.length; pi++) {
        const pest = pestNames[pi];
        const list = pests[pest] || [];
        for (let ai = 0; ai < list.length; ai++) {
          const a = list[ai];
          const name = a && a.name;
          if (!name) continue;
          let rec = byName.get(name);
          if (!rec) { rec = { name: name, rows: [], crops: new Set() }; byName.set(name, rec); }
          rec.rows.push({ crop: crop, pest: pest, a: a });
          rec.crops.add(crop);
          const bl = a.bl || [];
          for (let bi = 0; bi < bl.length; bi++) {
            let s = byBrand.get(bl[bi]);
            if (!s) { s = new Set(); byBrand.set(bl[bi], s); }
            s.add(name);
          }
        }
      }
    }
    return { byName: byName, byBrand: byBrand };
  }

  /* 藥劑建議:先完全相同,再包含比對;普通名稱優先於商品名。
     一個商品名可能對到多個普通名稱(資料中有 6 例),一律全部列出,
     不自動挑一個 —— 挑錯會把農友導向另一支藥。 */
  function agentSuggestions(q, index, limit) {
    q = String(q == null ? "" : q).trim();
    if (!q || !index || !index.byName) return [];
    limit = limit || 24;
    const out = [];
    const seen = new Set();
    function add(name, kind, brand) {
      if (seen.has(name) || out.length >= limit) return;
      const rec = index.byName.get(name);
      if (!rec) return;
      seen.add(name);
      out.push({
        name: name, kind: kind, brand: brand || "",
        cropCount: rec.crops.size, rowCount: rec.rows.length
      });
    }
    if (index.byName.has(q)) add(q, "direct", "");
    const exactBrand = index.byBrand && index.byBrand.get(q);
    if (exactBrand) exactBrand.forEach(function (n) { add(n, "brand", q); });
    const names = index.byName.keys();
    for (let it = names.next(); !it.done && out.length < limit; it = names.next()) {
      if (String(it.value).indexOf(q) >= 0) add(it.value, "direct", "");
    }
    if (index.byBrand) {
      const brands = index.byBrand.entries();
      for (let it = brands.next(); !it.done && out.length < limit; it = brands.next()) {
        const brand = it.value[0];
        if (String(brand).indexOf(q) >= 0) it.value[1].forEach(function (n) { add(n, "brand", brand); });
      }
    }
    /* 有字面結果時不混入近似項目,避免正確搜尋被大量猜測淹沒。
       只有完全找不到時才依錯字、字序、讀音、拼音或注音提供建議。 */
    if (!out.length && q.length >= 2) {
      const nameMatches = fuzzyCandidates(q, Array.from(index.byName.keys()), limit);
      for (const hit of nameMatches) {
        add(hit.value, hit.kind, "");
        const added = out[out.length - 1];
        if (added && added.name === hit.value) added.reasonLabel = hit.label;
      }
      if (out.length < limit && index.byBrand) {
        const brandMatches = fuzzyCandidates(q, Array.from(index.byBrand.keys()), limit - out.length);
        for (const hit of brandMatches) {
          const namesForBrand = index.byBrand.get(hit.value) || [];
          namesForBrand.forEach(function (name) {
            const before = out.length;
            add(name, "brand-fuzzy", hit.value);
            if (out.length > before) out[out.length - 1].reasonLabel = hit.label;
          });
        }
      }
    }
    return out;
  }

  /* 某藥劑的登記內容,依作物分組。只回傳該藥劑「實際登記」者,
     絕不由作物分類或群組外推 —— 未列出不代表可以使用。 */
  function agentRegistrations(name, index) {
    const rec = index && index.byName && index.byName.get(name);
    if (!rec) return [];
    const byCrop = new Map();
    for (let i = 0; i < rec.rows.length; i++) {
      const r = rec.rows[i];
      let g = byCrop.get(r.crop);
      if (!g) { g = { crop: r.crop, rows: [] }; byCrop.set(r.crop, g); }
      g.rows.push(r);
    }
    return Array.from(byCrop.values()).sort(function (x, y) {
      return y.rows.length - x.rows.length || String(x.crop).localeCompare(String(y.crop), "zh-Hant");
    });
  }

  return Object.freeze({
    normalizeSearchText: normalizeSearchText,
    normalizeLatin: normalizeLatin,
    bopomofoToPinyin: bopomofoToPinyin,
    readingProfile: readingProfile,
    damerauLevenshtein: damerauLevenshtein,
    candidateMatch: candidateMatch,
    fuzzyCandidates: fuzzyCandidates,
    groupStem: groupStem,
    canonicalPest: canonicalPest,
    pestRelation: pestRelation,
    isParentOf: isParentOf,
    pestSearchMatch: pestSearchMatch,
    relatedPests: relatedPests,
    relatedPestRegistrations: relatedPestRegistrations,
    SEED_RE: SEED_RE,
    isSeedTreatment: isSeedTreatment,
    isDilutionMultiple: isDilutionMultiple,
    usagePurpose: usagePurpose,
    usagePresentation: usagePresentation,
    cropAgentOverview: cropAgentOverview,
    buildAgentIndex: buildAgentIndex,
    agentSuggestions: agentSuggestions,
    agentRegistrations: agentRegistrations
  });
});
