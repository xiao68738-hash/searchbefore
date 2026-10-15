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
const html = fs.readFileSync(path.join(__dirname,'../dev/ocr-manual-review.html'),'utf8');
assert.ok(html.includes('blankFields()'));
assert.ok(html.includes('independentHoldoutVerified: false'));
assert.ok(html.includes('target.fields = model.fields'));
assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|https?:\/\//.test(html));
for (const block of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(block[1]);
// Exercise the page event handlers without any browser network or private files.
const nodes = new Map();
const node = id => {
  if (!nodes.has(id)) nodes.set(id, {innerHTML:'',textContent:'',handlers:{},addEventListener(event,fn){this.handlers[event]=fn;},querySelectorAll(){return [];}});
  return nodes.get(id);
};
const sandbox = {
  window:{OcrReviewModel:model},
  document:{getElementById:node,querySelectorAll:()=>[]},
  confirm:()=>true,
  URL:{createObjectURL:()=> 'blob:local-test',revokeObjectURL:()=>{}},
  FileReader:class {readAsText(file){this.result=file.contents;this.onload();}}
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
console.log('OCR manual review: unreviewed fields excluded, blank false positives separate, numeric zero preserved, limits and offline script checked');
