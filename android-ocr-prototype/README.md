# 噴前查 Android 表單 OCR 原型

這個資料夾是「方案 A」的裝置端驗證工程，先證明沒有固定表單模板時也能完成：

1. 用 ML Kit Document Scanner 拍攝並自動裁切一張紙本表單。
2. 在手機上以繁體中文模型辨識文字。
3. 檢查解析度、模糊與反光程度。
4. 只產生文字區塊與品質指標 JSON，不保存或上傳照片。
5. 交由網站的 `form-ocr.js` 建立草稿，使用者逐欄確認後才帶入原紀錄表單。

## 目前完成範圍

- 可獨立安裝的掃描原型，套件為 `tw.searchbefore.ocrprototype`，不會覆蓋 Google Play 封測中的正式 App。
- 掃描輸出欄位與網站 `PQC_FORM_OCR` 協定一致。
- 網頁端已有「紀錄 → 拍攝表單建立草稿」入口與人工確認流程。
- 網站拒絕含 Base64／影像欄位、過大資料或錯誤協定版本的訊息。

## 尚未接上正式 App 的原因

目前留存的 Google Play 檔案只有 APK、AAB 與簽章檔，沒有 PWABuilder 產生的 Android 原始碼。正式 TWA 與網站互傳資料需要修改原生 Launcher 與 postMessage channel，不能安全地直接改已編譯的 APK/AAB。

下一個實機階段要先從 PWABuilder 重新下載 Android 原始碼，再把 `ScanActivity.java`、`OcrQualityEstimator.java` 與 ML Kit dependencies 合併進正式套件 `tw.searchbefore.app`。合併前不可替換或上傳正式簽章檔。

## 本機建置

在 Android Studio 選擇「Open」，開啟本資料夾。工程使用：

- Android Gradle Plugin 8.1.2（配合目前電腦已有的建置快取）
- compileSdk / targetSdk 34
- minSdk 23
- ML Kit Document Scanner 16.0.0
- ML Kit Chinese Text Recognition 16.0.1（模型隨 App 安裝，首次辨識不必等下載）

測試時必須使用實體 Android 手機；掃描器要求裝置總記憶體至少 1.7GB。此工程不需要 Android 模擬器。

## 隱私與安全底線

- 不要求相簿匯入，只允許當次拍攝。
- 不申請網路或儲存權限。
- 不將掃描影像編碼進網址、localStorage、雲端備份或 postMessage。
- 辨識結果永遠是未確認草稿；照片品質未通過時不能帶入紀錄。
- 正式整合後仍必須讓使用者確認紀錄類型、日期與作物。
