const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('../dev/ocr-review-model.js');
assert.equal(model.score([{truth:'蘇力菌',candidate:'蘇力菌',status:'unknown'}]).exactRate, null);
assert.deepEqual(model.score([
  {truth:'蘇力菌',candidate:'蘇力菌',status:'confirmed'},
  {truth:'7/14',candidate:'7/4',status:'needs-fix'},
  {truth:'',candidate:'錯字',status:'needs-fix'},
  {truth:'',candidate:'',status:'confirmed'},
  {truth:'未確認',candidate:'',status:'unknown'}
]), {reviewed:4,unknown:1,nonblank:2,exact:1,exactRate:0.5,blank:2,blankFalsePositives:1});
assert.equal(model.fields([{candidate:0,truth:0,status:'confirmed'}])[0].truth,'0');
assert.equal(model.fields([{status:'invented'}])[0].status,'unknown');
assert.throws(()=>model.fields({}));
assert.throws(()=>model.fields(Array(501).fill({})));
assert.throws(()=>model.fields([{truth:{}}]));
assert.throws(()=>model.fields([{key:'same'},{key:'same'}]), /重複/);
assert.throws(()=>model.fields([{key:'  '}]), /空白/);
assert.throws(()=>model.fields([{group:{}}]));
const template = model.form13Fields();
assert.equal(template.length,156);
assert.equal(new Set(template.map(field=>field.key)).size,156);
assert.equal(new Set(template.map(field=>field.group)).size,6);
for (const group of new Set(template.map(field=>field.group))) {
  const panel = template.filter(field=>field.group===group);
  assert.equal(panel.length,26);
  assert.equal(panel.filter(field=>field.key.includes('.header.')).length,6);
  assert.equal(panel.filter(field=>/\.r[1-5]\./.test(field.key)).length,20);
}
assert.ok(template.every(field=>field.status==='unknown' && field.truth==='' && field.candidate===''));
assert.equal(model.score(template).reviewed,0);
assert.equal(model.score(template).exactRate,null);
assert.deepEqual(model.fields(JSON.parse(JSON.stringify(template))),template);
template[0].truth='must not leak';
assert.equal(model.form13Fields()[0].truth,'');
const html = fs.readFileSync(path.join(__dirname,'../dev/ocr-manual-review.html'),'utf8');
assert.ok(html.includes('blankFields()'));
assert.ok(html.includes('independentHoldoutVerified: false'));
assert.ok(html.includes('target.fields = model.fields'));
assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|https?:\/\//.test(html));
for (const block of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(block[1]);
// Exercise the page event handlers without any browser network or private files.
const nodes = new Map();
const windowHandlers = {};
let exported;
const node = id => {
  if (!nodes.has(id)) nodes.set(id, {innerHTML:'',textContent:'',handlers:{},addEventListener(event,fn){this.handlers[event]=fn;},querySelectorAll(){return [];}});
  return nodes.get(id);
};
const sandbox = {
  window:{OcrReviewModel:model,addEventListener(event,fn){windowHandlers[event]=fn;}},
  document:{getElementById:node,querySelectorAll:()=>[],createElement:()=>({click(){}})},
  confirm:()=>true,
  URL:{createObjectURL:()=> 'blob:local-test',revokeObjectURL:()=>{}},
  FileReader:class {readAsText(file){this.result=file.contents;this.onload();}},
  Blob:class {constructor(parts){exported=JSON.parse(parts.join(''));}}
};
vm.createContext(sandbox);
vm.runInContext([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1],sandbox);
assert.ok(node('cases').innerHTML.includes('蘇力菌'));
node('image-input').handlers.change({target:{files:[{name:'new.png',type:'image/png',size:20}]}});
assert.ok(!node('cases').innerHTML.includes('蘇力菌'), 'new photo must not inherit sample ground truth');
assert.ok(!node('cases').innerHTML.includes('未可靠辨識'), 'new photo must not inherit fake OCR output');
node('json-input').handlers.change({target:{files:[{size:30,contents:JSON.stringify({cases:[{title:'<img onerror=alert(1)>',imageUrl:'https://evil.test/private',fields:[{truth:'<script>x</script>',candidate:0,status:'unknown'}]}]})}]}});
assert.ok(!node('cases').innerHTML.includes('blob:local-test'), 'JSON import must clear stale photo association');
assert.ok(!node('cases').innerHTML.includes('https://evil.test'));
assert.ok(node('cases').innerHTML.includes('&lt;script&gt;'));
assert.ok(!node('cases').innerHTML.includes('<img onerror'));
let focused = '';
const trigger = {setAttribute(name,value){this[name]=value;},focus(){focused='trigger';}};
const panel = {hidden:true,querySelector(){return {focus(){focused='cancel';}};}};
const article = {dataset:{caseIndex:'0'},querySelector(selector){return selector.includes('template-confirm') ? panel : trigger;}};
const templateEvent = {target:{dataset:{role:'form13-template'},closest:()=>article}};
const acceptTemplate = {target:{dataset:{role:'template-accept'},closest:()=>article}};
const beforeTemplate=node('cases').innerHTML;
node('cases').handlers.click(acceptTemplate);
assert.equal(node('cases').innerHTML,beforeTemplate,'hidden confirmation cannot replace fields');
node('cases').handlers.click(templateEvent);
assert.equal(panel.hidden,false);
assert.equal(trigger['aria-expanded'],'true');
assert.equal(focused,'cancel','safe cancel action receives focus first');
assert.equal(node('cases').innerHTML,beforeTemplate,'opening confirmation does not replace answers');
node('cases').handlers.click(acceptTemplate);
assert.ok(node('cases').innerHTML.includes('p6.r5.remainingAmount'));
assert.ok(node('cases').innerHTML.includes('全部分區（156 欄）'));
assert.ok(!node('cases').innerHTML.includes('&lt;script&gt;'), 'template replacement must not retain old truth');
let prevented=0;
const leave = () => windowHandlers.beforeunload({preventDefault(){prevented++;}});
leave(); assert.equal(prevented,1,'unsaved template warns before leaving');
node('export').handlers.click();
assert.equal(exported.cases[0].fields.length,156);
assert.equal(exported.geometryVerified,false);
assert.equal(exported.independentHoldoutVerified,false);
assert.equal(exported.cases[0].metrics.reviewed,0);
leave(); assert.equal(prevented,1,'completed export clears dirty state');
// Exercise editing, reconfirming, filtering and exporting, including hidden rows.
const values = {candidate:{value:'蘇力菌'},truth:{value:'蘇力菌'},status:{value:'confirmed'},note:{value:''}};
const row = {dataset:{fieldIndex:'0'},querySelector(selector){return values[selector.match(/"(.+)"/)[1]];}};
article.querySelectorAll = selector => selector==='[data-field-index]' ? [row] : [{textContent:''},{textContent:''}];
sandbox.document.querySelectorAll = () => [article];
node('cases').querySelectorAll = () => [article];
node('cases').handlers.input({target:{dataset:{role:'truth'},closest:()=>row}});
assert.equal(values.status.value,'unknown','editing a reviewed answer requires review again');
node('export').handlers.click();
assert.equal(exported.cases[0].metrics.reviewed,0);
values.status.value='confirmed';
node('cases').handlers.input({target:{dataset:{role:'status'}}});
node('cases').handlers.change({target:{dataset:{role:'group-filter'},value:'區 6（右下）',closest:()=>article}});
assert.equal(row.hidden,true);
node('export').handlers.click();
assert.equal(exported.cases[0].fields.length,156,'filtering must not drop hidden fields from export');
assert.equal(exported.cases[0].metrics.exact,1);
assert.equal(exported.cases[0].metrics.unknown,155);
assert.equal(exported.cases[0].fields[0].group,'區 1（左上）');
values.candidate.value='changed prediction';
node('cases').handlers.input({target:{dataset:{role:'candidate'},closest:()=>row}});
assert.equal(values.status.value,'unknown','editing a prediction also invalidates review');
leave(); assert.equal(prevented,2);
const beforeCancel=node('cases').innerHTML;
node('cases').handlers.click(templateEvent);
node('cases').handlers.click({target:{dataset:{role:'template-cancel'},closest:()=>article}});
assert.equal(panel.hidden,true);
assert.equal(trigger['aria-expanded'],'false');
assert.equal(focused,'trigger');
assert.equal(node('cases').innerHTML,beforeCancel,'cancel keeps existing case');
console.log('OCR manual review: 156 logical cells, per-panel filtering, loss warning, review invalidation, safe roundtrip and no inflated scoring passed');
