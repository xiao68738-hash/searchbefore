const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {buildCatalog}=require('../scripts/export-native-catalog.cjs');
const catalog=buildCatalog(),A=require('../query-aids.js'),S=require('../safety.js'),M=require('../mrl-status.js');
const F=require('../crop-forms.js');
assert.equal(catalog.rows.length,17333);
assert.equal(new Set(catalog.rows.map(r=>r.id)).size,catalog.rows.length);
assert.equal(catalog.registrationScope,'exact-crop-only');
const sourceHtml=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const sourceData=JSON.parse(sourceHtml.match(/^const DATA=(.*);\r?$/m)[1]);
const originals=Object.values(sourceData).flatMap(pests=>Object.values(pests).flat());
assert.equal(originals.length,catalog.rows.length);
for(const [index,r] of catalog.rows.entries()){
  const source=originals[index];
  const phi=S.effectivePhi(source);
  assert.equal(r.phi,phi.phi,'native harvest interval must match the existing safety core');
  assert.equal(r.rawPhi,phi.basePhi);
  assert.equal(r.phiAdjusted,phi.adjusted);
  assert.equal(r.name,source.name);
  assert.deepEqual(r.usage,A.usagePresentation(r));
  assert.equal(r.formKind,S.formKind(r.form));
  assert.equal(r.mrl?.status||null,M.resolve(r.crop,r.name)?.status||null);
  for(const form of F.FORMS[r.crop]?.forms||[]){
    const split=F.splitIndices(r.crop,form.id,[source]);
    assert.equal(r.cropForms[form.id].category,split.matched.length?'matched':split.excluded.length?'excluded':'unspecified');
    assert.equal(r.cropForms[form.id].mrl?.status||null,M.resolve(r.crop,r.name,{form:form.id})?.status||null);
  }
}
const beet=catalog.rows.filter(r=>r.crop==='蔥'&&r.pest==='甜菜夜蛾');
assert.equal(beet.length,1,'native beet armyworm page must not inherit the 20 night-moth uses');
assert.ok(catalog.related['蔥']['甜菜夜蛾'].includes('夜蛾類'));
assert.equal(catalog.rows.filter(r=>r.crop==='蔥'&&r.pest==='夜蛾類').length,20);
const pea=catalog.rows.find(r=>r.crop==='豌豆'&&r.name==='脫克松');
assert.equal(pea.usage.canCalculateDilution,false);
assert.equal(pea.mrl.status,'scope-needs-review');
assert.equal(pea.cropForms['鮮豆莢'].mrl.status,'reviewed-no-detect');
assert.equal(pea.cropForms['葉用豌豆'].mrl.status,'scope-needs-review');
assert.equal(catalog.rows.find(r=>r.crop==='豌豆'&&r.name==='培丹').cropForms['鮮豆莢'].category,'excluded');
const main=fs.readFileSync(path.join(__dirname,'../android-native/app/src/main/java/tw/searchbefore/nativeapp/MainActivity.kt'),'utf8');
assert.doesNotMatch(main,/android\.webkit|WebView|evaluateJavascript/);
const manifest=fs.readFileSync(path.join(__dirname,'../android-native/app/src/main/AndroidManifest.xml'),'utf8');
assert.match(manifest,/allowBackup="false"/);
assert.match(manifest,/fullBackupContent="false"/);
assert.match(manifest,/dataExtractionRules="@xml\/data_extraction_rules"/);
const extraction=fs.readFileSync(path.join(__dirname,'../android-native/app/src/main/res/xml/data_extraction_rules.xml'),'utf8');
assert.doesNotMatch(extraction,/<include\b/);
for(const mode of ['cloud-backup','device-transfer']){
  const section=extraction.match(new RegExp('<'+mode+'>([\\s\\S]*?)</'+mode+'>'))?.[1];
  assert.ok(section,mode+' must have explicit exclusions');
  for(const domain of ['root','file','database','sharedpref','external','device_root','device_file','device_database','device_sharedpref']){
    assert.ok(section.includes('<exclude domain="'+domain+'" path="." />'),mode+' must exclude '+domain);
  }
}
assert.match(manifest,/<uses-permission android:name="android.permission.INTERNET"/);
assert.doesNotMatch(manifest,/READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|GET_ACCOUNTS|CAMERA/);
const state=fs.readFileSync(path.join(__dirname,'../android-native/app/src/main/java/tw/searchbefore/nativeapp/NativeState.kt'),'utf8');
const sync=fs.readFileSync(path.join(__dirname,'../android-native/app/src/main/java/tw/searchbefore/nativeapp/NativeCloud.kt'),'utf8');
const store=fs.readFileSync(path.join(__dirname,'../android-native/app/src/main/java/tw/searchbefore/nativeapp/NativeStore.kt'),'utf8');
assert.match(state,/viewModelScope\.launch/);
assert.doesNotMatch(main,/rememberCoroutineScope|AtomicFile|\.startWrite\(/);
assert.match(store,/context\.noBackupFilesDir/);
assert.match(state,/check\(syncEnabled && !ownerConflict\)/);
assert.match(state,/it\.isEmpty\(\) \|\| it == uid/);
assert.match(sync,/get\(Source\.SERVER\)/);
assert.match(sync,/runTransaction/);
assert.match(sync,/MemoryCacheSettings/);
assert.doesNotMatch(sync,/whereGreaterThan|lastSyncAt.*get\(|firebase-analytics/);
assert.match(manifest,/usesCleartextTraffic="false"/);
const gradle=fs.readFileSync(path.join(__dirname,'../android-native/app/build.gradle'),'utf8');
assert.match(gradle,/minSdk 24\b/,'retain Play automatic protection compatibility');
assert.match(gradle,/applicationIdSuffix "\.nativepreview"/);
assert.match(gradle,/name == "preReleaseBuild"[\s\S]*throw new GradleException/,'incomplete native preview must remain release-blocked');
assert.match(gradle,/if \(!internalCandidate\) throw new GradleException/);
assert.match(gradle,/nativeInternalCandidate/);
assert.match(gradle,/d749133d6c22aabb0e48654a424652f45dbf9220c2c586813a9347cda7bf2fbe/,'candidate must use existing upload identity');
const internalBuilder=fs.readFileSync(path.join(__dirname,'../scripts/build-android-native-internal.ps1'),'utf8');
assert.match(internalBuilder,/if \(!\$InternalTestingOnly\) \{ throw/);
assert.match(internalBuilder,/:app:testReleaseUnitTest :app:lintRelease :app:bundleRelease/);
assert.match(internalBuilder,/VerifyNativeBundle\.java/);
assert.doesNotMatch(internalBuilder,/publishBundle|upload_to_play_store|tracks\/production/);
const builder=fs.readFileSync(path.join(__dirname,'../scripts/build-android-native.ps1'),'utf8');
assert.match(builder,/\[switch\]\$Lint/);
assert.match(builder,/:app:lintDebug/);
assert.doesNotMatch(builder,/:app:(?:bundle|assemble)Release|keystore\.properties/);
console.log('Native catalog: 17,333 exact rows; native UI, retained IO, explicit-consent/account-guarded server sync.');
