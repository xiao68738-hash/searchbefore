# 正式版發行前置清單

更新：2026-09-26。這是準備與驗收入口，不是已正式發布或安全認證。

## 現在在哪裡

- 每日 Console／Threads 監管已依使用者要求刪除，不再定時執行。既有監控紀錄保留。
- 程式來源：`agent/native-preview-20260916`，本輪開始時為 `7931ff77be03022dce0ca912082fa011c828c5ed`。9/26 只讀核對 PR #148 為 OPEN／draft，該提交的兩项 CI 皆 SUCCESS。這不代表本輪新變更的遠端 CI。
- Play 最後實際查證：9/23 正式版未開放、Alpha v4、內部 v9／1.1.4-internal；v9 9/22 23:08 發布。本輪沒有重讀 Console，沒有發布／送審／修改名單。
- 9/26 手機唯讀核對：Play v8／1.1.3-internal、min24／target36；首次安裝 9/17 07:45:22、上次更新 9/18 23:57:18。沒有替換安裝或更動帳號／紀錄。
- v9 AAB 14,220,438 bytes，SHA256 `b2398b3ebaf60f6e44ae5aeaa1a49f0529e75682d1034b621a5e805e1f259605`；9/26 重新計算一致。簽章300個payload、4個64-bit庫16KB LOAD／RELRO驗證通過。AAB 不入 Git。

## 發行順序：先完成前項，才進下一項

| 順序 | 工作 | 可完成條件 | 目前狀態 |
|---|---|---|---|
| 1 | v9 Play 原地升級 | 保留首次安裝時間、帳號及資料；匯出完整 JSON 前後逐欄比對，再驗證手動同步／重啟 | 手機仍 v8，待 Play 更新；不以側載或卸載代替 |
| 2 | 審查登入資訊 | 隔離環境驗證專用審查帳號；Console 聲明部分功能需登入並提供英文步驟 | 需要使用者準備帳號，憑證直接填 Console，不傳聊天或 Git |
| 3 | 正式識別與申報 | OAuth 顯示品牌、存取權、資料安全、隱私／刪除網址與最終依賴一致 | 需 Console 實際核對；不關閉安全保護或新增登入後門 |
| 4 | 最終正式候選 | 確認可用版號，移除內部／預覽標示；重建、簽章、Manifest、測試、Play 驗收 | 本轮維持現有發布鎖，不把 v9-internal 直接当正式版 |
| 5 | 正式商店素材 | 最終候選的手機與平板實際畫面；版本與功能吻合、无私人資料 | 舊候選圖僅供構圖參考，尚不能直接上架 |
| 6 | 品質與最終放行 | 查閱可用的預先發布報告／vitals；結合版本驗收與已知問題作判斷 | 最後讀取仍無報告／資料；不能當成零當機或自動通過 |
| 7 | 合併與正式發布 | 最終差異審查、CI、發布內容確認及明確正式發布授權 | 本輪不合併、不上傳、不發布 |

## 本輪修正

隱私頁先前寫「您可以不登入使用目前所有功能」，與雲端同步需要 Google 登入矛盾。改為：查詢、計算、本機紀錄和 JSON 備份不必登入；雲端同步需要登入、另行同意。補充帳號識別／安全／紀錄歸屬目的，保留登入不代表上傳同意。

新增 `tests/privacy-access-disclosure.test.js`，保護免登入範圍、手動同步同意、配方／偏好不上雲、舊 Chrome 紀錄不自動匯入與 SDK 技術資訊揭露。這是文案回歸，不是法律意見、線上申報驗收或安全認證。此修正尚未部署，商店表單亦未代填。

## 9/26 本機重新驗證結果

- 46 個根目錄 JS 測試檔全部通過（包含新增文案測試）；runner 另重跑的兩項分類測試不重複計入46。
- 網站重新建置及成品檢查通過：36檔、6.54MB，僅本機 `dist`，未部署。
- `build-android-native.ps1 -Lint`：11分7秒、60tasks／28executed／32up-to-date；17 suites／71 tests、0 failures／errors／skipped；Lint `No issues found.`。
- debug 合併 Manifest 安全基準與合成完整備份往返通過；Manifest 行為回歸另跑4正向／35負向通過。
- v9 封存 AAB 簽章／16KB與雜湊再驗證通過，沒有重新簽署或覆寫它。
- 保留既有 SDK XML／metrics 目錄及 Gradle 9 相容警告，不更改全域設定來隱藏警告。這些不是此次單元測試失敗；也不能因此宣稱真實 v9 手機驗收已完成。

## 審查者操作說明（不含憑證，待最終畫面核對）

Name: `Google sign-in and optional cloud sync`

> Search, calculations, local records and JSON backup work without sign-in. Cloud sync requires the supplied Google review account. Open 個人 (Personal) > 使用 Google 登入 (Sign in with Google). After signing in, choose 開啟雲端同步 (Enable cloud sync), read and accept the scope notice, then tap 立即同步／匯入雲端紀錄 (Sync now / import cloud records). Sign-in alone does not upload field records. Use synthetic records only. Recipes and display preferences are not cloud-synced. Use a clean test environment; do not switch accounts on a device that holds another account's records.

這段不是帳號本身。不要聲明所有功能無限制，也不要保證審查帳號已可用。Google 的要求包括可重複使用、不同地區可存取，以及第三方登入的完整資訊；[官方要求](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en)於9/26重讀。若 Google 額外驗證妨礙審查，需確認合規可用的登入方法，不降低私人帳號保護。

## 五張手機圖的內容規劃

| 圖 | 實際畫面 | 建議標題 | 截圖限制 |
|---|---|---|---|
| 1 | 查詢作物與防治對象 | 從作物開始，找到原登記用法 | 不使用 AI 假介面、不宣稱自動診斷 |
| 2 | 作物用藥總覽全寬卡片 | 同一作物的登記用途，一起看清楚 | 夜蛾類與甜菜夜蛾分開，不暗示互用 |
| 3 | 藥劑卡片與注意事項 | 倍數、採收期與注意事項，查得到 | 使用真實候選包顯示，不自行補資料 |
| 4 | 配藥換算 | 依登記用法換算用量 | 不宣稱可混配、有效或無殘留風險 |
| 5 | 個人頁備份入口或合成紀錄 | 本機備份與選用雲端同步 | 避開帳號／真實田區；標明示範資料 |

必須從最後正式候選重新擷取手機及所需平板畫面，不能修圖掩掉內部版文字冒充正式版。9/19圖檔仍只作參考；不沿用窄卡缺陷那張。

## 準備好的版本說明草稿

> 原生介面上線，提供作物登記用藥總覽、配藥換算、田間紀錄與採收等待期參考。Google 登入及手動雲端同步可自行選用。舊版使用者請先匯出完整 JSON 備份再移轉；常用配方不包含在雲端同步範圍，顯示設定請在新版本重新設定。

僅供真正完成原生替代驗收後使用；目前不填入現有正式／測試軌道，也不把 OCR 寫成已上線功能。

## 資料安全核對邊界

- 目前原生直接宣告 Firebase Auth／Firestore；不能只據此說「完全不收集技術資料」。最終依賴與 SDK 行為仍須核對。[Firebase 官方資料揭露](https://firebase.google.com/docs/android/play-data-disclosure)於9/26重讀，說明揭露需結合實際 SDK 版本及應用方式。
- 僅依源碼與本機測試不能替代線上 Rules／Console 申報或真實網路驗收。
- 不要求使用者提供主帳號密碼，不把私人 JSON／測試者 Email／憑證放本檔、Git 或商店素材。
- 進一步登入設定見本機 `releases/PLAY-REVIEW-ACCESS-SETUP-20260919.md`；歷史完整驗收見 [v8](NATIVE-V8-INTERNAL-2026-09-18.md)、[平板](NATIVE-TABLET-ACCEPTANCE-2026-09-19.md)。
