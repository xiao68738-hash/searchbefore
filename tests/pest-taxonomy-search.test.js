const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const A = require('../query-aids.js');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const DATA = JSON.parse(html.match(/^const DATA=(.*);\r?$/m)[1]);
const before = JSON.stringify(DATA);
const nightPests = ['夜蛾類', '斜紋夜蛾', '甜菜夜蛾', '秋行軍蟲', '切根蟲'];

for (const q of ['鱗翅目害蟲', '鱗翅目', '鱗翅', '夜蛾科', '夜蛾類', '夜蛾']) {
  for (const p of nightPests) assert.ok(A.pestSearchMatch(q, p), `${q} 必須找到 ${p}`);
}
for (const p of nightPests) {
  assert.ok(A.isParentOf('鱗翅目害蟲', p));
  assert.equal(A.isParentOf(p, '鱗翅目害蟲'), false);
}
assert.equal(A.isParentOf('夜蛾科', '夜蛾類'), false, '搜尋別名不是父子');
assert.equal(A.pestSearchMatch('斜紋夜盜蛾', '斜紋夜蛾').kind, 'alias');
assert.ok(A.pestSearchMatch(' 夜 蛾 科 ', '甜菜夜蛾'));
assert.equal(A.pestSearchMatch('甜菜夜蛾', '斜紋夜蛾'), null, '物種不可互推');
assert.equal(A.pestSearchMatch('甜菜夜蛾', '夜蛾類'), null, '子項搜尋不直接混入上位登記');
for (const p of ['薊馬類', '蚜蟲類', '根瘤線蟲', '白粉病', '跳蟲', '未知蛾類']) {
  assert.equal(A.pestSearchMatch('鱗翅目', p), null, `不可誤納 ${p}`);
}
for (const p of ['小菜蛾', '毒蛾類', '螟蛾類']) {
  assert.equal(A.pestSearchMatch('夜蛾科', p), null, `不是夜蛾科 ${p}`);
}
assert.equal(A.pestSearchMatch('蛾', '秋行軍蟲'), null, '單字不擴大分類');
assert.equal(A.pestSearchMatch('__proto__', '秋行軍蟲'), null);
assert.equal(A.pestSearchMatch('constructor', '秋行軍蟲'), null);
assert.ok(A.pestSearchMatch('', '任意原始條目'));

let crops = 0, rows = 0, paired = 0;
for (const [crop, pests] of Object.entries(DATA)) {
  const hits = Object.keys(pests).filter(p => nightPests.includes(p));
  if (hits.length) {
    crops++; rows += hits.reduce((n, p) => n + pests[p].length, 0);
    if (pests['鱗翅目害蟲']) paired++;
  }
  for (const p of hits) {
    assert.ok(A.pestSearchMatch('鱗翅目', p));
    if (pests['鱗翅目害蟲']) {
      const groups = A.relatedPestRegistrations(crop, '鱗翅目害蟲', DATA);
      const group = groups.find(g => g.pest === p);
      assert.ok(group, `${crop} / ${p} 不得漏列`);
      assert.equal(group.agentCount, pests[p].length);
      assert.deepEqual(group.names, [...new Set(pests[p].map(a => a.name))].sort((a,b) => a.localeCompare(b, 'zh-Hant')));
      assert.ok(A.relatedPests(crop, p, DATA).some(r => r.pest === '鱗翅目害蟲' && r.relation === 'parent'));
    }
  }
  const buckets = Object.fromEntries(Object.entries(pests).map(([p, list]) => [p, {list}]));
  const overview = A.cropAgentOverview(buckets).filter(r => r.pests.some(p => A.pestSearchMatch('鱗翅目', p)));
  for (const p of hits) for (const agent of pests[p]) {
    assert.ok(overview.some(r => r.rows.some(row => row.pest === p && row.a === agent)), `${crop}/${p}/${agent.name} 必須保留原始物件`);
  }
}
assert.ok(crops > 100 && rows > 1000 && paired > 50, '全庫驗證不可意外跑空');
assert.equal(JSON.stringify(DATA), before, '查詢不修改作物、藥名、倍數、採收期或防治對象');
const isolated = {甲: {'秋行軍蟲': [{name:'甲藥'}]}, 乙: {'夜蛾類':[{name:'乙藥'}]}};
assert.ok(A.pestSearchMatch('鱗翅目', Object.keys(isolated.甲)[0]), '沒有上位登記仍可由搜尋找到');
assert.deepEqual(A.relatedPestRegistrations('甲', '秋行軍蟲', isolated), [], '不可借用另一作物');
assert.deepEqual(A.relatedPestRegistrations('甲', '鱗翅目害蟲', isolated), [], '不可捏造上位登記頁');

// 執行真正的前端函式，檢查篩選、分組、點擊目的地與混版相容性。
function fn(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}
const els = new Map();
const element = id => {
  if (!els.has(id)) els.set(id, {innerHTML:'',textContent:'',value:'',style:{},classList:{toggle(){}},scrollIntoView(){}});
  return els.get(id);
};
const ctx = vm.createContext({PQC_AIDS:A, window:{PQC_AIDS:A}, DATA, selCrop:'蔥', selPest:'鱗翅目害蟲',
  CUR:Object.fromEntries(Object.entries(DATA['蔥']).map(([p,list]) => [p,{list}])), overviewShow:1000, phiMax:0,
  document:{getElementById:element,querySelectorAll:()=>[]},
  esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),
  renderAgents(){ctx.agentRows = ctx.currentAgentList();}
});
for (const name of ['pestSearchMatchSafe','renderPests','cropOverviewData','renderCropOverview','renderPestRelated','currentAgentList','pickPest']) {
  vm.runInContext(fn(name), ctx);
}
ctx.renderPests('夜蛾科');
assert.match(element('pestChips').innerHTML, /夜蛾類/);
assert.match(element('pestChips').innerHTML, /甜菜夜蛾/);
assert.doesNotMatch(element('pestChips').innerHTML, /薊馬類/);
assert.match(element('pestSearchNote').textContent, /不代表用藥可互用/);
ctx.renderCropOverview('鱗翅目');
assert.match(element('cropOverviewList').innerHTML, /氟芬隆/);
assert.match(element('cropOverviewList').innerHTML, /甜菜夜蛾核多角體病毒/);
const related = ctx.renderPestRelated();
assert.match(related, /原登記：夜蛾類/);
assert.match(related, /20 筆用法 \/ 11 種藥劑/);
assert.match(related, /氟芬隆/);
assert.match(related, /不套用目前採收期篩選/);
assert.strictEqual(ctx.currentAgentList(), DATA['蔥']['鱗翅目害蟲']);

function clickHandlers(markup) {
  return [...markup.matchAll(/onclick="([^"]+)"/g)].map(m => m[1].replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&amp;/g,'&'));
}
const nightClick = clickHandlers(related).find(code => code.includes('夜蛾類'));
vm.runInContext(nightClick, ctx);
assert.equal(ctx.selPest, '夜蛾類');
assert.strictEqual(ctx.agentRows, DATA['蔥']['夜蛾類'], '點擊後動作索引只用原登記清單');

// 新增的 HTML/onclick 必須安全處理引號和 HTML，不信任資料內容。
const hostilePest = `夜蛾類');globalThis.injected=true;//<"`;
ctx.CUR = {[hostilePest]:{list:[{name:'<img src=x onerror=alert(1)>'}]}};
ctx.selCrop = '安全測試'; ctx.selPest = '夜蛾類';
ctx.DATA = {'安全測試':{'夜蛾類':[],[hostilePest]:ctx.CUR[hostilePest].list}};
ctx.renderPests('夜蛾');
const maliciousMarkup = ctx.renderPestRelated();
assert.doesNotMatch(maliciousMarkup, /<img/);
assert.match(maliciousMarkup, /&lt;img/);
for (const markup of [element('pestChips').innerHTML, maliciousMarkup]) {
  for (const handler of clickHandlers(markup)) vm.runInContext(handler, ctx);
  assert.equal(ctx.injected, undefined);
  assert.equal(ctx.selPest, hostilePest);
}
ctx.renderCropOverview('夜蛾');
assert.doesNotMatch(element('cropOverviewList').innerHTML, /<img/);
for (const handler of clickHandlers(element('cropOverviewList').innerHTML)) vm.runInContext(handler, ctx);
assert.equal(ctx.injected, undefined);

ctx.PQC_AIDS = {relatedPests:A.relatedPests}; ctx.window.PQC_AIDS = ctx.PQC_AIDS;
assert.ok(ctx.pestSearchMatchSafe('夜蛾', '夜蛾類'), '舊快取退回名稱搜尋');
assert.equal(ctx.pestSearchMatchSafe('鱗翅目', '夜蛾類'), null);
ctx.selPest = '夜蛾類';
assert.doesNotThrow(() => ctx.renderPestRelated());
assert.match(html, /pestSearchWrap"\)\.style\.display=pests\.length\?"block":"none"/, '少量病蟲害仍提供分類搜尋');
console.log(`✓ 分類搜尋：${crops} 作物、${rows} 筆原登記用法可發現；${paired} 作物有上下位分組；原資料與點擊用途不變，XSS／混版回歸通過`);
