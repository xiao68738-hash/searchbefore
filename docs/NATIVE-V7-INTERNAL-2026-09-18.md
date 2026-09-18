# 原生 v7 內部候選版

## 範圍

僅沿用已授權的內部測試，不變更 Alpha／正式群組、測試者、計費、Firebase 規則。v7 將已驗證的六入口品牌版面、日曆、面積／批次試算、閱讀設定及系統列修正交給 Play 簽章驗收，不是正式上架完成。

## 發布前證據

- 來源：0224eb1 的兩項 GitHub CI 成功；其最新 Android16／1.5 倍字體完整 22 UI 通過，詳見 NATIVE-DISPLAY-MIGRATION-2026-09-18.md。
- Play Console 本輪實際讀取：最高套件 6，內部 v6 提供給測試者，Alpha 仍 v4。故本輪使用 versionCode 7／1.1.2-internal，target36／min24。
- 正式設定建置 3m56s 成功：71 release JVM／零失敗／零錯誤、Lint `No issues found.`。
- 300 筆 payload 使用既有 upload 憑證且簽章有效；4 個64-bit native library 的16KB LOAD及RELRO檢查通過；bundletool validate通過。此靜態檢查不替代 Play 安裝驗收。
- AAB：`D:/SearchBefore/releases/native-internal-v7-20260918/searchbefore-native-v7-internal.aab`。
- SHA256：`956f2b271bcd9dd9197f782430693bbd4cb4747d253184ec409445ba0fcfdcc5`。
- 預先發布報告仍只顯示上傳構件的說明，沒有可讀結果；不是零問題。尚未重新核對 Android vitals。

## 手機升級基準

SUGAR C60，Play installer，v6／1.1.1-internal，firstInstallTime 2026-09-17 07:45:22，lastUpdateTime 2026-09-18 00:36:12。實際畫面仍本人登入、同步同意保留；上次同步 2026-09-17T16:39:01.334Z。未登出、清資料或觸發同步。

透過 APP「匯出完整備份」新增 `Download/native-v6-before-v7-20260918.json`，沒有覆寫舊檔。副本僅在本機 `private/native-v7-acceptance-20260918/before-v7.json`；不加入 Git。2田區／1用藥／5農務／0配方。為填寫ASCII檔名暫切英文鍵盤後已恢復注音。此基準可用來比對升級前後資料，並非全新帳號或全新空白裝置驗收。

## 目前 Play 狀態

9/18 19:47（Console顯示），v7 已發布至內部軌道，顯示「提供給內部測試人員」；版本名稱「1.1.2-internal (7) 原生版面與閱讀設定驗收」。更新說明只列已實作功能，明確要求測試原地升級、登入、紀錄及手動同步。沒有操作Alpha／正式群組或名單。

支援裝置新增／減少皆0。去模糊化檔與原生偵錯符號兩項非阻擋警告仍存在；本版minify未啟用，不偽造mapping檔。Manifest與v6相比沒有新增權限，allowBackup=false、usesCleartextTraffic=false、未啟用debuggable。手機Play更新及升級後比對結果待後續補記；Console成功不等於手機已安裝。

## 仍保留的閘門

- 真實 Play v6→v7 原地升級、登入與同步同意保留、完整 JSON data 比對。
- 真實跨帳號、空白環境完整還原、不同 Android／導覽模式驗收。
- 正式商店截圖／說明、資料安全／隱私一致性與足夠穩定性觀察。
- 不把內部版、合成測試或單次成功宣稱為完整正式版。
