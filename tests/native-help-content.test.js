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
const source=require('node:fs').readFileSync(path.join(root,'index.html'),'utf8');
const announcementBlock=source.match(/const ANNOUNCE=\[([\s\S]*?)\];/)[1];
assert.equal(help.announcements.length,Array.from(announcementBlock.matchAll(/\{date:/g)).length);
for(const item of help.announcements){
  assert.deepEqual(Object.keys(item),['date','version','title','body']);
  assert.match(item.date,/^\d{4}-\d{2}-\d{2}$/);
  assert.ok(item.title.length>0&&item.body.length>0);
  assert.doesNotMatch(item.body,/<script|<iframe|onclick=/);
  assert.ok(announcementBlock.includes(item.date)&&announcementBlock.includes(item.title));
}
console.log('Native offline guides: four source-hashed text-only articles, safety warnings and public feedback configuration preserved.');

// Public native home copy must not silently drift from the TWA feature descriptions.
const fs=require('node:fs');
const nativeHome=fs.readFileSync(path.join(root,'android-native/app/src/main/java/tw/searchbefore/nativeapp/NativeHome.kt'),'utf8');
const featureBlock=nativeHome.match(/internal val homeFeatures = listOf\(([\s\S]*?)\n\)/)[1];
const features=Array.from(featureBlock.matchAll(/"([^"]+)" to "([^"]+)"/g),m=>[m[1],m[2]]);
assert.equal(features.length,7);
for(const [title,description] of features){
  assert.ok(source.includes(title),`Missing TWA feature title: ${title}`);
  assert.ok(source.includes(description),`Native feature description differs: ${title}`);
}
const nativeHelp=fs.readFileSync(path.join(root,'android-native/app/src/main/java/tw/searchbefore/nativeapp/NativeHelp.kt'),'utf8');
for(const guide of help.guides) assert.ok(nativeHelp.includes(`"${guide.id}" ->`),`Missing home guide subtitle: ${guide.id}`);
console.log('Native home: seven TWA feature descriptions and all four guide IDs aligned.');
