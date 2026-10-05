const assert=require('node:assert/strict'),path=require('node:path');
const {buildHelp,text,files}=require('../scripts/native-help-content.cjs');
const root=path.resolve(__dirname,'..'),help=buildHelp(root);
assert.equal(help.guides.length,4);
assert.deepEqual(help.guides.map(g=>g.id),files);
for(const guide of help.guides){
  assert.match(guide.sourceSha256,/^[a-f0-9]{64}$/);
  assert.equal(guide.sourceUrl,`https://searchbefore.tw/${guide.id}`);
  const body=guide.blocks.join('\n');
  assert.match(body,/安全界線/);assert.match(body,/官方來源/);
  assert.doesNotMatch(body,/<script|adsbygoogle|ca-pub-|<iframe|<table/);
}
assert.match(help.guides.find(g=>g.id==='guide-phi.html').blocks.join('\n'),/看不到數字不等於零天/);
assert.match(help.guides.find(g=>g.id==='guide-phi.html').blocks.join('\n'),/田區與作物/);
assert.equal(text('<p>A&amp;B</p><script>PRIVATE</script><style>HIDDEN</style><p>&#x4E00;&#20108;</p>'),'A&B\n\n一二');
assert.match(help.feedbackEmail,/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
console.log('Native offline guides: four source-hashed text-only articles, safety warnings and public feedback configuration preserved.');
