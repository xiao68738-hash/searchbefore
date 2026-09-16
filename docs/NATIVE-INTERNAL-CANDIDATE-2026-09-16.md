# 原生內部候選版驗收

## 授權界線

使用者明確同意：只建立並發布 Google Play 內部測試；不更改封閉測試 Alpha 或正式版，不新增測試者。發布內部候選不等於正式替代完成。

## 候選內容

- `tw.searchbefore.app`，versionCode 5，`1.1.0-internal`，API 36。
- 2026-09-16 Play 套件清單最高為 4／1.0.3.0，Alpha 全面推出；尚無 5。
- 正式 Firebase 設定依 exact package 選取，驗證 appId／project／Play OAuth 憑證，與 debug 資源隔離。
- AAB 使用既有 upload key；Gradle 在內部候選 opt-in 時驗證其 SHA-256，未提供 opt-in 則一般 release build 仍拒絕。
- 顯示內部候選標籤，新增舊版資料移轉指引。網站／舊 TWA 的瀏覽器資料不會自動轉入原生；完整 JSON 匯入前須確認並保存上一份。
- 不加入 OCR、不自動上傳、不放寬 Firestore 規則、不新增權限。

## 本輪驗證狀態

- Native catalog Node 對照測試：通過（17,333 筆）。
- 本輪 release 單元測試／Lint／簽署 AAB：進行中，不能沿用前次 debug 成果。
- Android 16 UI：隔離模擬器設定路徑已修復，後續與建置分階段執行；未完成新一轮結果前不得宣稱通過。
- Play 內部發布：待建置及驗收通過後操作，未上傳即不得寫成已發布。

## 仍需 Play 派送與實機的驗收

1. 舊版先匯出 JSON；保留原網站資料，不卸載／不清除 Chrome。
2. 既有內部測試成員從 Play 更新，核對 package、versionCode、Play signing SHA-256。
3. 同帳號 Google 登入、明確同意同步、伺服器完成後核對紀錄。
4. 加入明確 TEST_ONLY 非施藥紀錄，上傳，登出重登並還原；跨帳號不得混傳。
5. 真實 JSON 網站 → 原生 → 網站，逐項核對田區／用藥／農務／配方與刪除標記。
6. 非空資料重啟、離線、更新及通知；實測與 Play 預先發布報告分別記錄。

只有完成上述驗收及差異檢查，才評估正式替代；不把單元測試或成功上傳 AAB 當成正式驗收。
