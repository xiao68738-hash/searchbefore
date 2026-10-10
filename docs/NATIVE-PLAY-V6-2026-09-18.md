# Play v6 原地升級實機驗收

## 結論

2026-09-18 00:34（台北），原生 6／1.1.1-internal 已發布**內部測試**，Console 顯示「提供給內部測試人員」。未操作 Alpha／正式版、名單、價格或 Firebase 規則。不是正式上架完成。

## 可重現證據

| 檢查 | 結果 |
|---|---|
| AAB | 14,150,416 bytes；SHA256 1a9cda7e8c95063d47569a17fbeceacf3add5ba0372c91df083db6ca723f90c1 |
| Git | c9099a33c93936263e0e2e572ac593ca73a94f74；#148 仍 draft；Review run35246869696、Android run35246869624 成功 |
| Play | v6 接受；支援裝置新增／減少皆 0；兩項非阻擋符號檔警告未解除 |
| 手機 | SUGAR C60／Android11；由 Play 商店「更新」，不是旁載 |
| 安裝 | tw.searchbefore.app；versionCode6、1.1.1-internal、min24／target36、installer=com.android.vending |
| 原地升級 | firstInstallTime=2026-09-17 07:45:22 不變；lastUpdateTime=2026-09-18 00:36:12 |
| 新介面 | 公開查詢首頁與個人頁顯示新版品牌排版、隱私／帳號入口 |
| 登入 | 本人既有登入及手動同步同意保留，不需重新授權；不是新帳號登入驗收 |
| 升級資料 | 匯出前後 data 完全一致：2 田區、1 用藥、5 農務、0 配方 |
| 版本欄位 | 備份 appVersion 由舊的 1.1.0-native-preview 修正為 1.1.1-internal |
| 真實同步 | 手動同步完成時間 2026-09-17T16:39:01.334Z；沒有錯誤提示 |
| 程序重啟 | force-stop／重開後仍登入、同意保留、上次同步時間保留 |
| 同步後資料 | 再次匯出，node:assert/strict.deepEqual 與升級前 data 一致；JSON 字串不同僅因物件鍵順序，所有欄位值與陣列順序一致，沒有重複／遺失 |

## 私人證據保管

三份 JSON 僅留本機 private，不加入 Git、附件或公開報告：

- native-v5-before-play-v6-20260918.json
- native-v6-after-play-update-20260918.json
- native-v6-after-sync-restart-20260918.json

手機 Download 原檔與自動產生的 (1)、(2) 副本保留；未覆寫旧備份、未匯入替換使用者資料。既有 TEST_ONLY 測試紀錄保留，本輪升級未新增或刪除田間紀錄。

## 不能據此宣稱的項目

- 不代表全新第二台空白裝置完整還原、真實配方／偏好移轉已完成。
- 不代表所有離線、跨帳號、通知與無障礙情境皆通過；不能以一次成功保證長期可靠。
- 不代表預先發布報告無問題或 Android vitals 零當機；目前沒有足夠報告資料。
- 商店原生截圖與資料安全／隱私一致性仍需正式發布前查核；release guard 與內部標記保留。
