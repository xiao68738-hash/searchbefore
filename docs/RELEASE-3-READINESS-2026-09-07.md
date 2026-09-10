# Android versionCode 3 候選版與封閉測試回歸

日期：2026-09-07（Asia/Taipei）

## 狀態與範圍

- 基於主分支 `676d285`（PR #137 已合併），工作分支 `agent/android-release-3`。
- `tw.searchbefore.app`，versionCode `3`、versionName `1.0.2.0`，minSdk 23 / targetSdk 36。
- **本機候選版，尚未推送 PR、上傳 Play 或發布網站。** Play 仍維持既有 versionCode 2；本檔不是新的 Console 查核結果。
- 這是 TWA 外殼，網頁功能由 `searchbefore.tw` 提供。AAB 更新和網站部署是不同步驟；不能把本機網站測試當成正式網站已更新。

## 本次實際修正

1. Android Browser Helper 2.6.2 → 2.7.3，納入上游啟動與 edge-to-edge 相容性更新；不宣稱 Play 警告已消失。
2. 模擬器實測發現升級後啟動當機：`Component class com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity does not exist in tw.searchbefore.app`。依官方範例補上該 Activity、固定同源的資料設定 URL 及 FocusActivity；兩者均 `exported=false`。
3. Android 打包腳本改為支援獨立 worktree，允許明確指定共用工具根目錄、JDK、SDK；成功與失敗都還原建置環境，簽章資料不入 Git。
4. 網站發布流程補入透明 LOGO；原本頁面／Service Worker 引用此圖，但 dist 沒有複製。
5. 發布檢查補入 `mrl-status.js`；保留明確允許清單，不放寬成任意檔案都能發布。
6. 測試入口自動收集根目錄 `*.test.js`，避免 Android / MRL 等新增測試被漏跑；新增 Windows 打包腳本的成功、失敗、缺簽章與環境還原測試。

## 驗證紀錄

| 檢查 | 結果與限制 |
|---|---|
| Node 自動測試 | 30 個測試檔通過；包含登入、雲端合併、資料防誤判、Android 與發布隔離。不是 Firebase 實際端對端驗證 |
| 網站建置與成品檢查 | 通過，26 個檔案，6.46 MB；含透明 LOGO 與 MRL 模組 |
| npm audit | 2026-09-07 回報 0 筆已知弱點；只涵蓋 npm 資料庫與本專案相依，不涵蓋完整 Android／Firebase 資安 |
| Android 簽署建置 | 修正後 clean / bundleRelease / assembleRelease 成功，包含 lintVitalRelease |
| 憑證 | 最終 APK v1/v2 驗證通過，SHA-256 與既有正式 assetlinks 憑證一致 |
| AAB 結構 | 最終包通過 Google bundletool 1.18.3 validate，exit 0 |
| Android 14 模擬器 | 修正後安裝成功；07:34:01 UTC force-stop 後冷啟動到 Chrome FirstRunActivity，該時間以後 crash buffer 無新紀錄。僅外殼啟動通過：尚未完成 Chrome 首次設定、網站載入、返回、Google 登入及雲端還原 |
| Android 16 | 本機只有 API 34 系統映像，尚未完成 API 36 畫面／手勢測試 |
| 真實登入／還原 | 本次未用真實 Google 帳號寫入雲端，不宣稱重新登入與跨裝置還原已通過 |

## 安全邊界與工具警告

- 無新增 Google/Firebase 權限、金鑰、管理 API 或私密資料上傳功能；沒有改動登入與雲端安全規則。
- manifest 的網站資料設定 URL 固定為本服務 HTTPS 網域，新增 Activities 不允許外部一般 App 直接啟動。
- 簽章檔仍在專案外部 private 目錄，AAB/APK 和 build 目錄被 Git 忽略。
- Gradle 顯示 SDK XML 工具版本及 Gradle 9 未來相容性警告，建置成功不等於無警告。
- `jarsigner` 首次驗證為 `jar verified`，同時回報自簽鏈、無 timestamp、JarFile/JarInputStream 項目順序等警告；`apksigner` 也有 v1 的 META-INF 警告。保留這些工具限制，不能摘要成「沒有任何資安疑慮」。另以 bundletool 驗證 AAB 結構、apksigner 驗證 APK 與既有憑證。

## 最終候選檔案（未發布）

位於本 worktree 的 `android-twa/app/build/outputs/`，後續重新建置會產生新的雜湊，請勿套用舊值。

已另存本次候選包至 `D:\SearchBefore\releases\2026-09-07-v3-candidate\`，檔名 `searchbefore-v3-1.0.2.0-candidate.aab` / `.apk`，未覆寫既有發布檔。

| 檔案 | Bytes | SHA-256 |
|---|---:|---|
| `bundle/release/app-release.aab` | 3741589 | `3ca18ce74c1320fd885b5c42f18a0c0167f6f22550ad2bc028718212bd0f4fbe` |
| `apk/release/app-release.apk` | 3934959 | `7b0ae91209ddc0f084a2182c6ccadc01f84e88d4a5b6333e080b22632b699e2a` |

本機驗證 log：`D:\SearchBefore\private\release3-bundle-validation.log`、`D:\SearchBefore\private\release3-apksigner.log`；啟動截圖 `D:\SearchBefore\private\release3-fixed.png`。不包含登入憑證或測試者 Email。

同時執行模擬器和 Gradle 時，一次查詢索引效能測試為 729 ms，超過既有 500 ms 門檻；初次完整測試為 320 ms 並通過。未放寬門檻；Gradle 結束後完整重跑 30 個測試檔皆通過，索引 107 ms、200 次查詢 30 ms。完成後停止本次唯讀模擬器，未儲存測試 snapshot，未修改使用者實機資料。

## 發布前必做（不得虛構完成）

1. 完成 Chrome 首次設定後確認網站載入、返回／重新開啟；API 36 真機或模擬器確認啟動畫面與上下系統列不遮擋。外殼冷啟動成功不等於整段通過。
2. 由 Play 測試版 v2 原地更新，確認既有本機紀錄保留；不要先解除安裝或清除 App／Chrome 資料。
3. 真實測試帳號：Google 登入 → 明確啟用雲端同步 → 新增可辨識的測試紀錄 → 確認同步成功 → 另一裝置／隔離瀏覽器登入 → 確認可還原；同時檢查未登入、關閉同步、離線、切換帳號不誤上傳或混入他人紀錄。
4. 網站部署後驗證作物用藥總覽、透明 LOGO、種子處理無「--倍」、人工覆核的不得檢出提醒；僅列有實際驗證結果的項目。
5. 取得 versionCode 3 發布確認，再上傳封閉測試；候選版通過不代表 production access 會通過。

## 測試者回饋紀錄（不記錄私人 Email）

每筆保留：日期、匿名測試代號、實際版本、操作情境、預期結果、實際結果、截圖（去識別）、修正版本、重測結果。不要把安裝人數當成活躍操作人數，或替測試者編造回饋。

優先情境：作物查詢與用藥總覽、配藥計算、田間紀錄、Google 登入與備份。讓測試者依日常需求操作，不要求無意義開關 App 或製造活動量。

## 封閉測試版本說明草稿

> 更新 Android 啟動相容性，並改善部分裝置開啟流程。請協助確認啟動、返回操作、查詢與紀錄功能是否正常；登入及雲端備份也歡迎提供實際使用回饋。

只在最終包回歸通過後使用。開發中功能不列入 Play 正式功能說明。

## 官方依據

- [Android Browser Helper 版本紀錄](https://github.com/GoogleChrome/android-browser-helper/releases)
- [2.7.3 官方 TWA manifest 範例](https://github.com/GoogleChrome/android-browser-helper/blob/android-browser-helper-2.7.3/demos/twa-basic/src/main/AndroidManifest.xml)
- [Google bundletool 1.18.3](https://github.com/google/bundletool/releases/tag/1.18.3)
- [Google Play 個人帳戶應用程式測試規定](https://support.google.com/googleplay/android-developer/answer/14151465?hl=zh-Hant)
