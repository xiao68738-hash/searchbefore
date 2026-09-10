const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const A = require('../query-aids.js');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const data = JSON.parse(html.match(/^const DATA=(.*);\r?$/m)[1]);
const names = [...new Set(Object.values(data).flatMap(bucket => Object.keys(bucket)))];
const dataBefore = JSON.stringify(data);
const raw = fs.readFileSync(path.join(__dirname, 'fixtures/pest-official-tree-2026-09-08.txt'), 'utf8').trimEnd().replace(/\r\n/g, '\n');
let checksum = 2166136261;
for (let i = 0; i < raw.length; i++) { checksum ^= raw.charCodeAt(i); checksum = Math.imul(checksum, 16777619) >>> 0; }
assert.equal(checksum.toString(16), 'f4384f4f', '官方快照不可隨產品規則任意改動');
const nodes = raw.split('\n').map(line => {
  const [id, parent, label] = line.split('|');
  return { id, parent, label, tokens: label.split(/[\s、，,；;]+/) };
});
const byId = new Map(nodes.map(n => [n.id, n]));
const found = name => nodes.filter(n => n.label === name || n.tokens.includes(name));
const matches = new Map(names.map(name => [name, found(name)]));
function ancestors(node) {
  const result = [], seen = new Set([node.id]);
  while (node.parent) {
    node = byId.get(node.parent);
    assert(node && !seen.has(node.id));
    seen.add(node.id); result.push(node);
  }
  return result;
}
assert.equal(names.length, 289);
assert.equal(nodes.length, 336);
assert(names.every(n => matches.get(n).length));
let pairs = 0, official = 0, exceptions = 0;
for (const group of names) for (const child of names) {
  assert(A.pestSearchMatch(child, child), child);
  if (group === child) { assert.equal(A.isParentOf(group, child), false); continue; }
  pairs++;
  const gs = matches.get(group), cs = matches.get(child);
  const expected = gs.length === 1 && cs.length === 1 && !!gs[0].parent &&
    ancestors(cs[0]).some(node => node.id === gs[0].id);
  const scientific = child === '秋行軍蟲' && ['夜蛾類', '鱗翅目害蟲'].includes(group);
  assert.equal(A.isParentOf(group, child), expected || scientific, group + ' → ' + child);
  if (expected || scientific) {
    assert(A.pestSearchMatch(group, child), group + ' 搜尋漏接 ' + child);
    assert.equal(A.pestRelation(group, child), scientific ? 'scientific' : 'official-group');
  }
  if (expected) official++;
  if (scientific) exceptions++;
}
assert.equal(pairs, 83232);
assert.equal(official, 149);
assert.equal(exceptions, 2);

const aliasText = fs.readFileSync(path.join(__dirname, 'fixtures/pest-alias-uniqueness-2026-09-08.txt'), 'utf8').trimEnd().replace(/\r\n/g, '\n');
let aliasChecksum = 2166136261;
for (let i = 0; i < aliasText.length; i++) { aliasChecksum ^= aliasText.charCodeAt(i); aliasChecksum = Math.imul(aliasChecksum, 16777619) >>> 0; }
assert.equal(aliasChecksum.toString(16), '1dd71ad');
const aliasIds = new Map(aliasText.split('\n').map(line => {
  const [alias, ids] = line.split('|'); return [alias, ids.split(',')];
}));
let aliases = 0;
for (const name of names) {
  const ns = matches.get(name);
  if (ns.length !== 1) continue;
  for (const alias of ns[0].tokens.filter(t => t !== name)) {
    const ids = aliasIds.get(alias);
    assert(ids, alias);
    if (ids.length !== 1) continue;
    aliases++;
    assert(A.pestSearchMatch(alias, name), alias);
    assert.equal(A.canonicalPest(alias), name);
  }
}
assert.equal(aliases, 26, '補 24 個漏接並保留 2 個原能命中別名');
assert.equal(A.canonicalPest('蚜蟲'), '蚜蟲', '多義泛稱不能指定物種');
assert(A.pestSearchMatch('蚜蟲', '棉蚜'));
assert(A.pestSearchMatch('蚜蟲', '豆蚜'));
assert.equal(A.pestSearchMatch('紫', '大螟'), null, '物種別名不可任意截短');
assert.equal(A.pestSearchMatch('螟蛾類', '草螟蛾類'), null, '完整群組名不得用字面包含誤納另一群組');
assert.equal(A.canonicalPest('夜蛾科'), '夜蛾科', '科別不得正規化成官方查詢群組');
assert.equal(A.isParentOf('夜蛾科','小造橋蟲'), false, '未核實科別不得沿官方 UI 推斷');
assert.equal(A.pestSearchMatch('夜蛾科','小造橋蟲'), null);
assert(A.isParentOf('夜蛾類','小造橋蟲'));
assert.equal(A.pestRelation('夜蛾科','大螟'), 'scientific');
for (const ambiguous of ['扁蝸牛', '炭疽病', '立枯病', '黃葉病']) {
  assert.equal(A.canonicalPest(ambiguous), ambiguous);
  for (const g of names) assert.equal(A.isParentOf(g, ambiguous), false);
}
for (const [g,c] of [
  ['螟蛾類','大螟'], ['螟蛾類','稻螟蛉'],
  ['螟蛾類','甜菜白帶野螟蛾'], ['螟蛾類','褐帶紋水螟蛾'],
  ['葉蜂類','松綠葉蜂'], ['斑潛蠅類','番茄斑潛蠅'],
  ['地下部線蟲類','根瘤線蟲'], ['地下部線蟲類','穿孔線蟲'],
  ['夜蛾類','未知夜蛾'], ['根蟎類','二點葉蟎']
]) {
  assert.equal(A.isParentOf(g,c), false, g + ' 不可錯配 ' + c);
  assert.equal(A.pestSearchMatch(g,c), null);
}
for (const [g,c] of [['草螟蛾類','甜菜白帶野螟蛾'],['水螟類','褐帶紋水螟蛾'],['松葉蜂科','松綠葉蜂']]) {
  assert(ancestors(found(c)[0]).some(n => n.label === g), '額外入口需官方路徑');
  assert(A.pestSearchMatch(g,c));
  assert.equal(A.pestSearchMatch(c,g), null, '不可反向合併上位登記');
}

// 全庫同作物導航與藥劑列表參照不可變。這不代表資料已取得逐列官方 ID。
let links = 0;
for (const [crop,bucket] of Object.entries(data)) {
  for (const pest of Object.keys(bucket)) {
    for (const rel of A.relatedPestRegistrations(crop,pest,data)) {
      assert(Object.hasOwn(bucket,rel.pest));
      assert.equal(rel.agentCount,bucket[rel.pest].length);
      assert.deepEqual(rel.names,[...new Set(bucket[rel.pest].map(a=>a.name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-Hant')));
      links++;
    }
  }
}
assert(links > 0);
assert.equal(JSON.stringify(data), dataBefore);
const isolated = {甲:{大螟:[{name:'甲藥',dilution:'',note:'原附註'}]},乙:{夜蛾類:[{name:'乙藥'}]}};
assert.deepEqual(A.relatedPestRegistrations('甲','大螟',isolated),[]);
assert.deepEqual(A.relatedPestRegistrations('甲','夜蛾類',isolated),[]);
for (const bad of ['__proto__','constructor','<img src=x onerror=alert(1)>']) {
  assert.equal(A.pestSearchMatch(bad,'大螟'),null);
  assert.equal(A.isParentOf('夜蛾類',bad),false);
}
console.log('✓ 全量群組重檢：289 名稱、83232 組配對、149 組官方關係 + 2 組獨立證據、26 別名、跨作物隔離；DATA SHA256 ' + crypto.createHash('sha256').update(dataBefore).digest('hex'));
