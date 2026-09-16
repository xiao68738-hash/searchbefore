# 噴前查原生 Android 開發

2026-09-16：**原生預覽階段，不是完整替代版，不可發布到正式群組。**

與 `android-twa` 位於同一 Git 專案，但使用獨立 Gradle 專案。Kotlin + Jetpack Compose 畫面，沒有 WebView、Chrome 容器或執行期 JavaScript。

## 已實作

- 作物搜尋 → 原登記防治對象 → 藥劑清單；藥劑普通名稱／商品名反查。
- 作物用藥總覽，點防治對象進入獨立清單。
- 相關分類只在底部連結，不將夜蛾類／甜菜夜蛾等合併。
- 稀釋數學換算、未知採收期、特殊用途與殘留提醒。
- 本機用藥紀錄、日期檢查與逐筆採收日期參考（不是整田區採收判定）。
- 新增田區／種植批次、儲存用藥時明確選田區、紀錄按田區篩選。新紀錄只可指定相同登記作物，不推定未指定紀錄的歸屬。
- 既有紀錄可修改施藥日期、操作者與田區（也可解除歸屬）；田區可修改名稱／種植日期，不更改作物。保留其他備份欄位、拒絕過期編輯畫面，時間戳大於已知舊版本。
- JSON 完整備份匯入／匯出。匯入確認後保留上一份資料，可回復。
- 匯入時不帶入帳號、token、同步同意；10 MB、筆數、ID、日期、田區引用與巢狀深度防護。
- 資料與刪除日誌以一份 AtomicFile 存於 `noBackupFilesDir`；只新增登入／同步需要的網路權限，沒有相機／外部儲存權限，停用系統自動備份。
- 明確排除 Android 12+ 雲端備份與裝置轉移的所有資料 domain；不只依賴舊版 `allowBackup` 設定。各廠牌真實轉移行為仍待實機驗收，手動匯出 JSON 不受此保護。
- 使用專案既有透明 LOGO；不讀取或修改使用者現有 APP／網站資料。
- 原生 Google 登入與手動 Firestore 同步已接入。登入不自動上傳；須另外同意同步。預覽 Firebase app 與 debug 指紋已登記；Android 11 實機登入、空白安裝下載、測試上傳及登出重登同步已通過，限制見下方驗收表。
- 六類農務（含設備）新增／修改／刪除、田區採收提醒、常用配方、水量調整與單次本機撤銷。
- 收穫部位篩選、拼音／注音／錯字候選；不自動把候選當登記結果，不合併不同防治對象。
- CSV、Excel、PDF 閱讀報表；完整移轉仍使用 JSON。報表不是官方 TAP 固定格式或驗證證明。

## 尚未完成，不能當作可上架

2026-09-16 最新 [Android 11 實機驗收](../docs/NATIVE-PHONE-ACCEPTANCE-2026-09-16.md)：修正雲端查詢參數遭拒，改為有上限的完整分頁下載；55 JVM 與 Lint 通過。真實登入與同步已驗證部分流程，完整移轉與正式身分仍未完成。先前施藥表單、提醒及 7 項 Android 16 測試為 [上一輪證據](../docs/NATIVE-APPLICATION-REMINDERS-2026-09-16.md)，不視為最新版全部實測。

| 項目 | 狀態／下一步 |
|---|---|
| Google 原生登入 | Android 11 真實登入、登出與同帳號重登通過；正式身分另待同意設定，取消／跨帳號完整驗收待辦 |
| 原生雲端同步 | 空白安裝下載、1 筆 TEST_ONLY 上傳與重登同步通過；第二台空白裝置還原新增資料、離線與跨帳號實測待辦 |
| 田區、農務、設備、配方編輯 | 已接入本機編輯、刪除確認與撤銷；仍需真實資料回歸與手機操作驗收 |
| 採收總覽／多筆用藥判斷 | 已有田區彙整與未知優先，37 組網站對照通過；仍需真實資料驗收，不是可採收許可 |
| 查詢完整相容 | 保持精確作物原登記；收穫部位已依網站資料生成。模糊／注音僅提供候選，尚不宣稱與 Web 所有候選排序完全一致 |
| 匯出 | JSON 實機匯出通過；CSV／Excel／PDF 已實作，假資料中文 PDF 與 Excel 已獨立開啟／渲染通過；JSON 實機匯入卡在系統選檔，完整移轉與 TAP 固定表單待辦 |
| 無障礙、Android 16、離線與更新實機驗收 | Android 11 部分流程與通知通過；全頁無障礙、最新版 Android 16、離線與非空資料升級仍待驗 |
| 全量資料移轉 | 需真實網站 JSON → 原生 → JSON → 網站的對照驗收，以及帳號一致性驗證 |
| OCR | 不在本輪範圍，不是正式版功能 |

## 建置

在專案根目錄執行：

```powershell
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android-native.ps1
```

加上 `-Lint` 可連同 Android 靜態檢查一起執行，報告位於 `app/build/reports/lint-results-debug.html`。`-Connected` 只允許唯一連線的 `emulator-5580`，先用 `scripts/start-native-validation-emulator.ps1` 啟動可丟棄的唯讀 overlay，測試期間不要接其他裝置。UI 不登入／同步，但 Gradle 會安裝及解除安裝套件，**不可用此流程驗收使用者手機**。Lint、單元測試與建置都不能取代實機操作、登入／同步或備份移轉驗收。

腳本先以既有 JS 純函式產生唯讀資料檔，再跑原生單元測試與 debug APK。生成檔忽略於 Git；農藥原始資料不變。預覽目前有 287 作物、17,333 原登記列，資料日 2026-07-21；**不是新的官方資料更新**。

- 開發 APK：`app/build/outputs/apk/debug/app-debug.apk`
- 單元測試：`app/build/reports/tests/testDebugUnitTest/index.html`
- namespace：`tw.searchbefore.nativeapp`
- debug applicationId：`tw.searchbefore.app.nativepreview`，與現有 APP 並存。
- 正式基礎 applicationId：`tw.searchbefore.app`；未套用正式簽署。
- compile/target API 36，min API 23，Java 17／desugaring。
- versionCode 5 僅為預覽預留；真正發布前須重查 Play 當時最大版本。
- 預覽的 `firebase-preview.json` 由 Firebase Console 下載，必須符合預覽 package 與 project，且包含 Web OAuth client；此檔忽略於 Git。無設定時仍可使用本機功能，但登入不啟用。不能用此設定替代正式 Play 身分。

最新實測結果與尚未通過項目集中在 [原生整合驗收](../docs/NATIVE-INTEGRATION-2026-09-16.md)，歷史測試數字不代表目前整包已驗收。

`preReleaseBuild` 目前會主動拒絕執行，避免誤把未完成的原生版發給現有用戶。完成上述功能、資料移轉與安全驗收後，才可在另外的審查變更中解除。不要繞過保護直接打包正式版。

原生化不要求新開商店 APP，但必須維持 applicationId 與正確的 Play App Signing 身分。不要解除安裝 TWA 來測試移轉；瀏覽器 localStorage 不會自動移到原生資料目錄。

## 同步協定相容注意

Web 修正仍使用 `users/{uid}/{records|fieldPlots|farmRecords}/{id}`、`updatedAt` ISO 毫秒字串與 `_deleted` tombstone。完整伺服器核對不再依用戶端 checkpoint 過濾。原生接入時也必須保留帳號歸屬、主動上傳同意、伺服器確認、交易內重新比對，以及切換帳號取消在途工作；不能只把 JSON 直接 set 覆蓋。

參考：[Compose 設定](https://developer.android.com/develop/ui/compose/setup-compose-dependencies-and-compiler)、[Firestore 交易](https://firebase.google.com/docs/firestore/manage-data/transactions)。
