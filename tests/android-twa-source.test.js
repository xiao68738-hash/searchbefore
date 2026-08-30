const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const gradle = read("android-twa/app/build.gradle");
const manifest = read("android-twa/app/src/main/AndroidManifest.xml");
const strings = read("android-twa/app/src/main/res/values/strings.xml");
const assetLinks = JSON.parse(read(".well-known/assetlinks.json"));

assert.match(gradle, /applicationId\s+"tw\.searchbefore\.app"/);
assert.match(gradle, /compileSdk\s+36/);
assert.match(gradle, /targetSdk\s+36/);
assert.match(gradle, /versionCode\s+2/);
assert.match(gradle, /versionName\s+"1\.0\.1\.0"/);
assert.match(gradle, /SEARCHBEFORE_KEYSTORE_PATH/);
assert.doesNotMatch(gradle, /storePassword\s+["'][^"']+["']/);
assert.doesNotMatch(gradle, /keyPassword\s+["'][^"']+["']/);

assert.match(manifest, /android\.support\.customtabs\.trusted\.DEFAULT_URL/);
assert.match(manifest, /android:host="searchbefore\.tw"/);
assert.match(strings, /https:\/\/searchbefore\.tw\/?\?app=google-play/);

const androidTarget = assetLinks.find(
  (entry) => entry?.target?.namespace === "android_app" && entry?.target?.package_name === "tw.searchbefore.app",
);
assert.ok(androidTarget, "assetlinks.json must authorize the formal Android package");
assert.ok(
  androidTarget.target.sha256_cert_fingerprints.includes(
    "D7:49:13:3D:6C:22:AA:BB:0E:48:65:4A:42:46:52:F4:5D:BF:92:20:C2:C5:86:81:3A:93:47:CD:A7:BF:2F:BE",
  ),
  "assetlinks.json must retain the production signing fingerprint",
);

assert.equal(fs.existsSync(path.join(root, "android-twa", "signing.keystore")), false);
assert.equal(fs.existsSync(path.join(root, "android-twa", "app", "signing.keystore")), false);

console.log("Android TWA source checks passed.");
