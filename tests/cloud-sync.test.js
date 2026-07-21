/* 雲端同步:合併與時戳邏輯測試
   這些是純函式,不需要 Firebase。合併錯誤會靜默弄丟農友手動輸入的紀錄,
   所以每條規則都要有對應案例。 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const code = fs.readFileSync(path.join(root, "cloud-sync.js"), "utf8");

/* 建立最小瀏覽器環境 */
const memory = {};
const sandbox = {
  window: {addEventListener(){}},
  localStorage: {
    getItem(k){return Object.prototype.hasOwnProperty.call(memory,k)?memory[k]:null},
    setItem(k,v){memory[k]=String(v)},
    removeItem(k){delete memory[k]}
  },
  navigator: {onLine:false},
  location: {protocol:"https:"},
  setTimeout(){return 0},
  clearTimeout(){}
};
sandbox.window.addEventListener = () => {};
vm.createContext(sandbox);
new vm.Script(code, {filename:"cloud-sync.js"}).runInContext(sandbox);
const S = sandbox.window.PQC_SYNC;

assert.ok(S, "cloud-sync.js 必須掛上 window.PQC_SYNC");
assert.equal(Array.from(S.COLLECTIONS).join(","), "records,fieldPlots,farmRecords",
  "同步範圍應為用藥紀錄、田區與農務紀錄;配方不同步");

/* ── mergeCollection:較新的一方勝出 ── */
{
  const local = [{id:"a", note:"本機較新", updatedAt:"2026-07-21T10:00:00.000Z"}];
  const remote = [{id:"a", note:"雲端較舊", updatedAt:"2026-07-20T10:00:00.000Z"}];
  const res = S.mergeCollection(local, remote);
  assert.equal(res.merged.length, 1);
  assert.equal(res.merged[0].note, "本機較新");
  assert.equal(res.toPush.length, 1, "本機較新時應上傳");
}
{
  const local = [{id:"a", note:"本機較舊", updatedAt:"2026-07-19T10:00:00.000Z"}];
  const remote = [{id:"a", note:"雲端較新", updatedAt:"2026-07-20T10:00:00.000Z"}];
  const res = S.mergeCollection(local, remote);
  assert.equal(res.merged[0].note, "雲端較新");
  assert.equal(res.toPush.length, 0, "雲端較新時不應覆寫回去");
}

/* ── 兩邊各有獨有紀錄:都要保留,不可互相覆蓋 ── */
{
  const local = [{id:"a", updatedAt:"2026-07-20T00:00:00.000Z"}];
  const remote = [{id:"b", updatedAt:"2026-07-20T00:00:00.000Z"}];
  const res = S.mergeCollection(local, remote);
  assert.equal(res.merged.length, 2, "兩台裝置各自新增的紀錄都要保留");
  assert.equal(Array.from(res.merged, x=>x.id).sort().join(","), "a,b");
  assert.equal(Array.from(res.toPush, x=>x.id).join(","), "a", "只需上傳本機獨有的那筆");
}

/* ── 刪除必須傳播,不可復活 ── */
{
  const local = [{id:"a", _deleted:true, updatedAt:"2026-07-21T10:00:00.000Z"}];
  const remote = [{id:"a", note:"舊內容", updatedAt:"2026-07-20T10:00:00.000Z"}];
  const res = S.mergeCollection(local, remote);
  assert.equal(res.merged.length, 0, "本機刪除較新時,合併結果不得包含該筆");
  assert.equal(res.toPush.length, 1, "刪除標記要推上雲端,否則另一台會同步回來");
  assert.equal(res.toPush[0]._deleted, true);
}
{
  const local = [{id:"a", note:"本機還在", updatedAt:"2026-07-20T10:00:00.000Z"}];
  const remote = [{id:"a", _deleted:true, updatedAt:"2026-07-21T10:00:00.000Z"}];
  const res = S.mergeCollection(local, remote);
  assert.equal(res.merged.length, 0, "雲端刪除較新時,本機也要跟著刪掉");
}

/* ── 時戳相同時「刪除優先」,否則紀錄會刪不掉 ── */
{
  const t = "2026-07-21T10:00:00.000Z";
  const a = S.mergeCollection([{id:"x", _deleted:true, updatedAt:t}], [{id:"x", note:"在", updatedAt:t}]);
  const b = S.mergeCollection([{id:"x", note:"在", updatedAt:t}], [{id:"x", _deleted:true, updatedAt:t}]);
  assert.equal(a.merged.length, 0, "時戳相同,刪除方應勝出(本機刪除)");
  assert.equal(b.merged.length, 0, "時戳相同,刪除方應勝出(雲端刪除)");
}

/* ── 缺 id 的髒資料不可讓合併爆掉 ── */
{
  const res = S.mergeCollection([{note:"沒有 id"}, null], [undefined]);
  assert.equal(res.merged.length, 0, "缺 id 的項目直接忽略,不得拋錯");
}

/* ── sameContent:忽略 updatedAt 本身 ── */
assert.equal(S.sameContent({id:"a",n:1,updatedAt:"x"}, {id:"a",n:1,updatedAt:"y"}), true,
  "只有 updatedAt 不同,應視為內容未變,否則每次存檔都會被當成修改");
assert.equal(S.sameContent({id:"a",n:1}, {id:"a",n:2}), false);

/* ── stampCollection:新增蓋時戳、未變動保留原時戳、消失產生刪除標記 ── */
{
  const now = "2026-07-21T12:00:00.000Z";
  const prev = [
    {id:"keep", n:1, updatedAt:"2026-07-01T00:00:00.000Z"},
    {id:"edit", n:1, updatedAt:"2026-07-01T00:00:00.000Z"},
    {id:"gone", n:1, updatedAt:"2026-07-01T00:00:00.000Z"}
  ];
  const next = [
    {id:"keep", n:1, updatedAt:"2026-07-01T00:00:00.000Z"},
    {id:"edit", n:2, updatedAt:"2026-07-01T00:00:00.000Z"},
    {id:"new", n:9}
  ];
  const res = S.stampCollection("records", next, prev, now);
  const by = Object.fromEntries(Array.from(res.items, i=>[i.id,i]));
  assert.equal(by.keep.updatedAt, "2026-07-01T00:00:00.000Z", "內容沒變就不該更新時戳");
  assert.equal(by.edit.updatedAt, now, "內容變了要蓋新時戳");
  assert.equal(by.new.updatedAt, now, "新增要蓋時戳");
  assert.equal(res.tombstones.length, 1, "消失的 id 要產生刪除標記");
  assert.equal(JSON.stringify(res.tombstones[0]), JSON.stringify({col:"records", id:"gone", updatedAt:now}));
}

/* ── stampCollection 不可就地改動傳入物件 ── */
{
  const item = {id:"a", n:1};
  S.stampCollection("records", [item], [], "2026-07-21T12:00:00.000Z");
  assert.equal(item.updatedAt, undefined, "應回傳新物件,不得污染呼叫端的資料");
}

/* ── pruneTombstones:過舊的刪除標記要清掉,避免無限成長 ── */
{
  const now = "2026-07-21T00:00:00.000Z";
  const list = [
    {col:"records", id:"old", updatedAt:"2025-01-01T00:00:00.000Z"},
    {col:"records", id:"new", updatedAt:"2026-07-20T00:00:00.000Z"}
  ];
  const kept = S.pruneTombstones(list, now, 180);
  assert.equal(Array.from(kept, t=>t.id).join(","), "new");
}

/* ── beforeStore:非同步範圍的 key 原樣通過 ── */
{
  const value = [{id:"r1"}];
  assert.equal(S.beforeStore("recipes", value), value, "配方不在同步範圍,不應被加工");
  assert.equal(S.beforeStore("records", "not-an-array"), "not-an-array", "非陣列原樣通過");
}

/* ── 預設開啟,可關閉 ── */
assert.equal(S.isEnabled(), true, "登入後預設開啟同步");
S.setEnabled(false);
assert.equal(S.isEnabled(), false, "可由使用者關閉");
S.setEnabled(true);
assert.equal(S.isEnabled(), true);

/* ── 未登入時狀態文字必須說明資料只在本機 ── */
{
  const line = S.statusLine();
  assert.match(line.text, /只保存在這台裝置/, "未登入時要明確告知資料只在本機");
}

/* ── 兩邊完全一致時不得重複上傳 ──
   這條直接關係免費額度是否夠用。若時戳相同仍判為「本機較新」,
   每次同步都會把全部資料重傳一次:200 筆 × 每天 15 次 × 12 人 = 36,000 次寫入,
   超過 Spark 方案每天 20,000 次的上限。 */
{
  const same = [
    {id:"a", n:1, updatedAt:"2026-07-20T00:00:00.000Z"},
    {id:"b", n:2, updatedAt:"2026-07-20T00:00:00.000Z"}
  ];
  const res = S.mergeCollection(same.map(x=>({...x})), same.map(x=>({...x})));
  assert.equal(res.merged.length, 2, "資料應完整保留");
  assert.equal(res.toPush.length, 0, "本機與雲端一致時不得產生任何上傳");
}

/* 一致的多、只有一筆本機較新 → 只推那一筆 */
{
  const base = {updatedAt:"2026-07-20T00:00:00.000Z"};
  const local = [
    {id:"a", ...base},
    {id:"b", ...base},
    {id:"c", updatedAt:"2026-07-21T00:00:00.000Z", n:"改過"}
  ];
  const remote = [
    {id:"a", ...base},
    {id:"b", ...base},
    {id:"c", ...base}
  ];
  const res = S.mergeCollection(local, remote);
  assert.equal(res.toPush.length, 1, "只有實際變動的那筆需要上傳");
  assert.equal(res.toPush[0].id, "c");
}

/* 平手採 remote,不可讓 merged 內容被本機舊值蓋掉 */
{
  const t = "2026-07-20T00:00:00.000Z";
  const res = S.mergeCollection([{id:"a", who:"local", updatedAt:t}], [{id:"a", who:"remote", updatedAt:t}]);
  assert.equal(res.merged[0].who, "remote", "平手時採雲端版本,結果才在各裝置間一致");
  assert.equal(res.toPush.length, 0);
}

/* ── 時戳必須嚴格遞增 ──
   Date 只有毫秒解析度,同一毫秒內的連續寫入會拿到相同值,後一次修改就判不出較新。
   手機時鐘被往回調時更糟:新編輯會輸給舊資料,等於靜默回滾農友的輸入。 */
{
  const stamps = [];
  for (let i = 0; i < 200; i++) stamps.push(S.nowIso());
  for (let i = 1; i < stamps.length; i++) {
    assert.ok(stamps[i] > stamps[i-1],
      `第 ${i} 個時戳未遞增:${stamps[i-1]} → ${stamps[i]}`);
  }
  assert.equal(new Set(stamps).size, stamps.length, "時戳不得重複");
}

console.log("✓ 雲端同步:合併、時戳、刪除傳播與清理邏輯正確");
