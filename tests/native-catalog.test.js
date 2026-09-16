const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {buildCatalog}=require('../scripts/export-native-catalog.cjs');
const catalog=buildCatalog(),A=require('../query-aids.js'),S=require('../safety.js'),M=require('../mrl-status.js');
assert.equal(catalog.rows.length,17333);
assert.equal(new Set(catalog.rows.map(r=>r.id)).size,catalog.rows.length);
assert.equal(catalog.registrationScope,'exact-crop-only');
for(const r of catalog.rows){
  assert.deepEqual(r.usage,A.usagePresentation(r));
  assert.equal(r.formKind,S.formKind(r.form));
  assert.equal(r.mrl?.status||null,M.resolve(r.crop,r.name)?.status||null);
}
const beet=catalog.rows.filter(r=>r.crop==='蔥'&&r.pest==='甜菜夜蛾');
assert.equal(beet.length,1,'native beet armyworm page must not inherit the 20 night-moth uses');
assert.ok(catalog.related['蔥']['甜菜夜蛾'].includes('夜蛾類'));
assert.equal(catalog.rows.filter(r=>r.crop==='蔥'&&r.pest==='夜蛾類').length,20);
const pea=catalog.rows.find(r=>r.crop==='豌豆'&&r.name==='脫克松');
assert.equal(pea.usage.canCalculateDilution,false);
assert.equal(pea.mrl.status,'scope-needs-review');
const main=fs.readFileSync(path.join(__dirname,'../android-native/app/src/main/java/tw/searchbefore/nativeapp/MainActivity.kt'),'utf8');
assert.doesNotMatch(main,/android\.webkit|WebView|evaluateJavascript/);
const manifest=fs.readFileSync(path.join(__dirname,'../android-native/app/src/main/AndroidManifest.xml'),'utf8');
assert.match(manifest,/allowBackup="false"/);
assert.doesNotMatch(manifest,/<uses-permission/,'offline preview cannot upload private records');
assert.match(manifest,/usesCleartextTraffic="false"/);
const gradle=fs.readFileSync(path.join(__dirname,'../android-native/app/build.gradle'),'utf8');
assert.match(gradle,/applicationIdSuffix "\.nativepreview"/);
assert.match(gradle,/name == "preReleaseBuild"[\s\S]*throw new GradleException/,'incomplete native preview must remain release-blocked');
console.log('Native catalog: 17,333 exact rows, related links separate, residue/special-usage parity, no WebView/no network permission.');
