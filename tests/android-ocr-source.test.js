const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const android = path.join(root, "android-ocr-prototype");
const gradle = fs.readFileSync(path.join(android, "app", "build.gradle"), "utf8");
const moduleGradle = fs.readFileSync(path.join(android, "ocr-feature", "build.gradle"), "utf8");
const manifest = fs.readFileSync(path.join(android, "app", "src", "main", "AndroidManifest.xml"), "utf8");
const moduleManifest = fs.readFileSync(path.join(android, "ocr-feature", "src", "main", "AndroidManifest.xml"), "utf8");
const scan = fs.readFileSync(path.join(android, "ocr-feature", "src", "main", "java", "tw", "searchbefore", "ocr", "ScanActivity.java"), "utf8");
const contract = fs.readFileSync(path.join(android, "ocr-feature", "src", "main", "java", "tw", "searchbefore", "ocr", "OcrContract.java"), "utf8");
const webBridge = fs.readFileSync(path.join(root, "form-ocr-ui.js"), "utf8");

assert.match(gradle, /applicationId "tw\.searchbefore\.ocrprototype"/, "原型不可覆蓋正式 App");
assert.match(gradle, /implementation project\(":ocr-feature"\)/, "獨立原型應重用正式 OCR 模組");
assert.match(moduleGradle, /com\.android\.library/);
assert.match(moduleGradle, /namespace "tw\.searchbefore\.ocr"/);
assert.match(moduleGradle, /play-services-mlkit-document-scanner:16\.0\.0/);
assert.match(moduleGradle, /text-recognition-chinese:16\.0\.1/);
assert.doesNotMatch(manifest, /android\.permission\.(?:INTERNET|READ_|WRITE_)/, "原型不應要求網路或儲存權限");
assert.doesNotMatch(moduleManifest, /android\.permission\.(?:INTERNET|READ_|WRITE_)/, "OCR 模組不應自行要求網路或儲存權限");
assert.match(moduleManifest, /android:exported="false"/, "正式主程式尚未明確啟用前，掃描 Activity 必須封閉");
assert.match(scan, /setGalleryImportAllowed\(false\)/, "只允許當次拍攝，不讀取相簿");
assert.match(scan, /OcrContract\.EXTRA_OCR_RESULT_JSON/);
assert.match(scan, /requestId = OcrContract\.requestIdFrom/);
assert.match(scan, /if \(task\.isSuccessful\(\)\) finish\(\)/, "辨識完成後必須把結果交還主程式");
assert.match(contract, /PQC_OCR_SCAN_REQUEST/);
assert.match(contract, /PQC_OCR_SCAN_RESULT/);
assert.match(contract, /PQC_OCR_WEB_READY/);
assert.match(contract, /public static Intent createScanIntent/);
assert.match(contract, /public static String resultJsonFrom/);
assert.match(scan, /for \(Text\.Line line : block\.getLines\(\)\)/, "表格 OCR 應逐行保留文字位置，避免整個表格欄位黏在一起");
assert.doesNotMatch(scan, /Base64|putExtra\([^\n]*Bitmap|localStorage/i, "不可把照片寫進橋接資料");
assert.match(webBridge, /event\.ports\s*&&\s*event\.ports\[0\]/, "TWA 必須透過驗證後的 MessagePort 傳訊");
assert.match(webBridge, /twaPort\.onmessage/);

console.log("Android OCR 原型：套件隔離、裝置端辨識與不傳照片規則通過");
