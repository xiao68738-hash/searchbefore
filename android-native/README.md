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
- JSON 完整備份匯入／匯出。匯入確認後保留上一份資料，可回復。
- 匯入時不帶入帳號、token、同步同意；10 MB、筆數、ID、日期、田區引用與巢狀深度防護。
- 資料存於私有目錄，以 AtomicFile 寫入；沒有網路／相機／外部儲存權限，停用系統自動備份。
- 使用專案既有透明 LOGO；不讀取或修改使用者現有 APP／網站資料。

## 尚未完成，不能當作可上架

| 項目 | 狀態／下一步 |
|---|---|
| Google 原生登入 | 尚未接入 Credential Manager／Firebase Auth；需核對 Android app 設定與簽章指紋 |
| 原生雲端同步 | 尚未接入 Firestore；不得把本輪 Web 同步修復當作原生同步已完成 |
| 田區、農務、設備、配方編輯 | 已有新增田區／新紀錄歸屬與篩選；既有紀錄重新歸屬、田區修改／刪除及農務／設備／配方編輯待完成，原始集合保存並可再匯出 |
| 採收總覽／多筆用藥判斷 | 尚未移植完整田區安全核心；目前只列逐筆參考日期 |
| 查詢完整相容 | 原生僅精確作物登記；作物群組、收穫部位選擇、模糊／注音搜尋仍待移植 |
| 匯出 | JSON 已有；CSV、Excel、PDF 與 TAP 對照尚未移植 |
| 無障礙、Android 16、離線與更新實機驗收 | 尚未完成；本輪沒有連接手機，不把編譯通過當實機通過 |
| 全量資料移轉 | 需真實網站 JSON → 原生 → JSON → 網站的對照驗收，以及帳號一致性驗證 |
| OCR | 不在本輪範圍，不是正式版功能 |

## 建置

在專案根目錄執行：

```powershell
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android-native.ps1
```

腳本先以既有 JS 純函式產生唯讀資料檔，再跑原生單元測試與 debug APK。生成檔忽略於 Git；農藥原始資料不變。預覽目前有 287 作物、17,333 原登記列，資料日 2026-07-21；**不是新的官方資料更新**。

- 開發 APK：`app/build/outputs/apk/debug/app-debug.apk`
- 單元測試：`app/build/reports/tests/testDebugUnitTest/index.html`
- namespace：`tw.searchbefore.nativeapp`
- debug applicationId：`tw.searchbefore.app.nativepreview`，與現有 APP 並存。
- 正式基礎 applicationId：`tw.searchbefore.app`；未套用正式簽署。
- compile/target API 36，min API 23，Java 17／desugaring。
- versionCode 5 僅為預覽預留；真正發布前須重查 Play 當時最大版本。

`preReleaseBuild` 目前會主動拒絕執行，避免誤把未完成的原生版發給現有用戶。完成上述功能、資料移轉與安全驗收後，才可在另外的審查變更中解除。不要繞過保護直接打包正式版。

原生化不要求新開商店 APP，但必須維持 applicationId 與正確的 Play App Signing 身分。不要解除安裝 TWA 來測試移轉；瀏覽器 localStorage 不會自動移到原生資料目錄。

## 同步協定相容注意

Web 修正仍使用 `users/{uid}/{records|fieldPlots|farmRecords}/{id}`、`updatedAt` ISO 毫秒字串與 `_deleted` tombstone。完整伺服器核對不再依用戶端 checkpoint 過濾。原生接入時也必須保留帳號歸屬、主動上傳同意、伺服器確認、交易內重新比對，以及切換帳號取消在途工作；不能只把 JSON 直接 set 覆蓋。

參考：[Compose 設定](https://developer.android.com/develop/ui/compose/setup-compose-dependencies-and-compiler)、[Firestore 交易](https://firebase.google.com/docs/firestore/manage-data/transactions)。
