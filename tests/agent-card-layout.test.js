const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=html.slice(html.indexOf('function agentPhiPresentation('),html.indexOf('function parseDil('));
const ctx=vm.createContext({});vm.runInContext(source,ctx);
const normal={canCalculateDilution:true,isSpecial:false};
const special={canCalculateDilution:false,isSpecial:true};
for(const value of ['0.3-0.5公升','1–2公斤','每株10公克','100公升水用50公克','<img src=x>']){
  assert.equal(ctx.agentDosePresentation({dose:value},normal,false).value,value);
}
assert.equal(ctx.agentDosePresentation({dose:'0.3-0.5公升'},normal,false).label,'每公頃每次用量');
for(const dose of ['每株10公克','100公升水用50公克','依標示','0.3公升/桶']){
  assert.equal(ctx.agentDosePresentation({dose},normal,false).label,'登記用量（依原單位）');
}
assert.equal(ctx.agentDosePresentation({dose:'0.3公升'},special,false).label,'登記用量（依原單位）');
assert.equal(ctx.agentDosePresentation({dose:'0.3公升'},normal,true).label,'登記用量（依原單位）');
for(const dose of ['',null,'--','—'])assert.equal(ctx.agentDosePresentation({dose},normal,false),null);
assert.equal(ctx.agentPhiPresentation({phi:null},false).value,'請查產品標示');
assert.equal(ctx.agentPhiPresentation({phi:null},true).value,'不適用');
assert.equal(ctx.agentPhiPresentation({phi:0},false).value,'0 天');
assert.equal(ctx.agentPhiPresentation({phi:15,phiText:'7-15'},false).value,'7-15 天');
assert.equal(ctx.agentPhiPresentation({phi:21,phiAdjusted:true},false).value,'21 天');
const render=html.slice(html.indexOf('function renderAgents(){'),html.indexOf('function renderPestRelated(){'));
assert.match(render,/agentContext"\)\.textContent/);
for(const field of ['dose.value','dose.label','harvest.value','a.name'])assert.ok(render.includes('esc('+field+')'));
for(const handler of ['toCalc','recordAgent','quickSaveAgent','openAgentBrands'])assert.ok(render.includes(handler+'(${k})'));
assert.match(render,/mrlNoDetectNotice/);
assert.match(render,/special-uses/);
assert.match(render,/安全採收期已依備註採較長/);
console.log('✓ 清爽卡片：用量基準、特殊用途、採收期未知/零/區間、跳脫與動作索引');
