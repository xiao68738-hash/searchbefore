const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

// 備份可控制的 ID 不得再被串入 inline JavaScript。
for (const pattern of [
  /onclick=[^\n]*(?:p\.id|r\.id|x\.r\.id)/,
  /onclick=[^\n]*(?:openPlotDetail|setActivePlot|delFieldPlot|delFarmRecord|delRecord|addToCalendarById)[^\n]*\+[^\n]*\.id/,
  /onclick=[^\n]*exportCombinedRecordsAs[^\n]*\+[^\n]*p\.id/
]) assert.doesNotMatch(html, pattern);

for (const action of ['open-plot','set-active-plot','delete-plot','delete-farm-record','delete-record','add-calendar','export-plot']) {
  assert.match(html, new RegExp(`data-pqc-action=["']${action}["']`));
}

function functionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  return html.slice(start, html.indexOf('\n}', start) + 2);
}

const calls = [];
const ctx = vm.createContext({
  openPlotDetail:id=>calls.push(['open',id]),
  setActivePlot:id=>calls.push(['active',id]),
  delFieldPlot:id=>calls.push(['deletePlot',id]),
  delFarmRecord:id=>calls.push(['deleteFarm',id]),
  delRecord:id=>calls.push(['deleteRecord',id]),
  addToCalendarById:id=>calls.push(['calendar',id]),
  exportCombinedRecordsAs:(format,id)=>calls.push(['export',format,id])
});
vm.runInContext(functionSource('handleStoredRecordAction'), ctx);

function dispatch(action, id, format) {
  let stopped = false;
  const target = { dataset:{pqcAction:action,pqcId:id,pqcFormat:format}, closest:selector=>selector==='[data-pqc-action]'?target:null };
  ctx.handleStoredRecordAction({target,stopPropagation(){stopped=true;}});
  return stopped;
}

assert.equal(dispatch('open-plot','plot-safe_1'),true);
assert.deepEqual(calls.pop(),['open','plot-safe_1']);
assert.equal(dispatch('export-plot','plot-safe_1','xlsx'),true);
assert.deepEqual(calls.pop(),['export','xlsx','plot-safe_1']);

const before = calls.length;
assert.equal(dispatch('open-plot',`x');globalThis.pwned=true;//`),false);
assert.equal(dispatch('export-plot','plot-safe_1','html'),true);
assert.equal(dispatch('unknown','plot-safe_1'),true);
assert.equal(calls.length,before,'非法 ID、格式及未知動作不得執行');
assert.equal(ctx.pwned,undefined);

console.log('✓ 備份可控制 ID 已改用固定事件分派；非法 ID、格式與未知動作均拒絕');
