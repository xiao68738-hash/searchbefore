const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const build = read('android-native/app/build.gradle');
assert.match(build, /release \{ minifyEnabled false; signingConfig signingConfigs.release \}/, 'release rollout remains separate');
const optimized = build.split('optimizedPreview {')[1].split('buildFeatures')[0];
assert.match(optimized, /signingConfig signingConfigs.debug/);
assert.match(optimized, /debuggable false/);
assert.match(optimized, /minifyEnabled true/);
assert.match(optimized, /shrinkResources true/);
assert.match(optimized, /applicationIdSuffix "\.nativepreview"/);
assert.match(optimized, /NOT-FOR-PLAY/);
const keep = read('android-native/app/src/main/res/raw/keep_tw_searchbefore_firebase.xml');
assert.deepEqual(keep.match(/tools:keep="([^"]+)"/)[1].split(',').sort(), [
  '@string/default_web_client_id', '@string/gcm_defaultSenderId', '@string/google_api_key',
  '@string/google_app_id', '@string/project_id'
].sort(), 'explicit raw resource keep list must retain every dynamic Firebase name, without wildcards');
assert.doesNotMatch(build, /attributes\['tools:keep'\]/, 'values XML attributes are not a shrinker keep file');
assert.match(build, /project_id: 'demo-optimization-only'/);
assert.match(read('android-native/gradle.properties'), /android.r8.optimizedResourceShrinking=true/);
console.log('R8 policy: optimized isolated preview, dynamic Firebase resources kept, release still gated.');
