# 噴前查 versionCode 3 送審前稽核

日期：2026-09-09（Asia/Taipei）  
工作目錄：`D:\SearchBefore\worktrees\android-release-3`  
基準：`origin/main`（PR #138 合併後，`d0a184e`）

## 結論

versionCode 3 候選包已重新建置，並包含 PR #138 的夜蛾／鱗翅目搜尋修正及目前同步修正。`compileSdk`／`targetSdk` 都是 36，AAB 結構、APK 版本資訊、簽章與網站發布成品檢查均通過。

本次只產生本機候選檔，沒有上傳 Google Play、變更 Play Console、發布網站或推送 PR。若 Play Console 尚未使用 versionCode 3，可沿用本候選包；若 versionCode 3 已上傳，下一包必須改成更高的 versionCode，不能重複上傳 3。

## 本次已處理

1. 先將 release worktree 快轉到 PR #138 合併後的主線，再還原原有未發布修正；修正合併衝突，避免 release 包漏掉最新分類搜尋。
2. Service Worker 快取版本合併為 `v0.3.9.9-pest-taxonomy-search-sync-session-guard-plot-scope-2026-09-09`，避免網站部署後仍使用舊快取。
3. 移除目前未使用的 `POST_NOTIFICATIONS` 原生權限，減少不必要的權限請求。
4. 在 Android 原生外殼明確設定 `android:usesCleartextTraffic="false"`；網站、Firebase 與登入端點仍使用 HTTPS。
5. 保留 `ManageDataLauncherActivity` 與 `FocusActivity` 的 `exported=false`，並固定同源 `MANAGE_SPACE_URL`，避免舊版 Chrome 啟動路徑再度缺少元件或被外部 App 任意呼叫。

## 驗證結果

| 項目 | 結果 |
|---|---|
| 網站單元／回歸測試 | `node tests/run-all.js`：全部通過（含登入、雲端同步生命週期、分類搜尋、MRL、OCR、Android 來源及資安測試） |
| 網站發布成品 | `node scripts/build-release.mjs`、`node scripts/check-release.mjs`：通過，26 個檔案、約 6.46 MB |
| AAB | `bundletool 1.18.3 validate`：exit 0 |
| APK | `versionCode=3`、`versionName=1.0.2.0`、`package=tw.searchbefore.app`、`targetSdkVersion=36` |
| 合併 Manifest | `allowBackup=true`、`usesCleartextTraffic=false`，未包含 `POST_NOTIFICATIONS` |
| APK 簽章 | v1、v2 驗證通過；RSA 2048；SHA-256 `D7:49:13:3D:6C:22:AA:BB:0E:48:65:4A:42:46:52:F4:5D:BF:92:20:C2:C5:86:81:3A:93:47:CD:A7:BF:2F:BE` |

候選檔案：

- `D:\SearchBefore\releases\2026-09-09-v3-candidate\searchbefore-v3-1.0.2.0-candidate.aab`
- `D:\SearchBefore\releases\2026-09-09-v3-candidate\searchbefore-v3-1.0.2.0-candidate.apk`

本次 SHA-256：

- AAB：`9b9c9ccd52610e8ccaad1f7bd50214834296295434f8634f4856d71b5f32b630`
- APK：`b1362c4cdae5b8c89bd78e57d6dcdba13d13067f0238d48fa7f089baccf61e3e`

## 仍需關注，不能由本機自動檢查代替

### 1. Chrome／Android 16 冷啟動 ANR

先前 API 36 隔離模擬器曾出現 Chrome `CustomTabActivity` FocusEvent 逾時。這不是 App crash，且本輪沒有健康 Android 16 實機或穩定模擬器可重做完整冷啟動，因此不能把 ANR 宣稱已修好。上傳前應以 Play 測試安裝的 v3，在至少一台 Android 16 實機完成冷啟動、返回、再次開啟與長時間查詢。

### 2. Digital Asset Links 憑證

目前 `.well-known/assetlinks.json` 的指紋與本機簽章一致。若 Google Play App Signing 使用另一把「App signing key」，正式從 Play 安裝的 APK 必須使用 Play Console 顯示的 App signing certificate 指紋；需將該指紋一併放入 `assetlinks.json`，否則可能在 Play 安裝版顯示網址列。這項資料只能在 Play Console 由專案擁有者核對，本機無法推測。

### 3. 登入／雲端還原

現有自動測試涵蓋帳號隔離、切換帳號競態、同步失敗重試及明確同意流程，但不等於真實 Firebase 端對端。仍需用測試帳號在 Play v3 完成：登入 → 手動開啟同步 → 新增標記資料 → Firebase 核對 → 另一個乾淨客戶端登入並還原 → 登出／換帳號確認不混入。

### 4. Play Console 資料與發布設定

本次沒有桌面瀏覽器控制權，因此未讀取最新 Console 狀態。上傳前需手動確認：封閉測試目前實際 versionCode、測試軌道、隱私權政策／資料安全表單、帳號刪除網址、內容分級、商店圖示與發布說明。`versionCode` 必須高於 Console 已存在的最高版本。

### 5. Android 備份語意

Manifest 仍保留 `allowBackup=true`，因為原生外殼保留系統備份／還原入口；登入後的跨裝置紀錄仍以使用者主動開啟的 Firebase 同步為準，不應在商店文案宣稱登入即自動備份。若產品決定完全禁止系統備份，需另行改為 `allowBackup=false` 並重測 `ManageDataLauncherActivity`，不可在未確認需求下直接切換。

### 6. 建置警告

Gradle 仍會顯示 SDK XML 版本差異、無法寫入 `C:\.android\analytics.settings` 及 Gradle 未來版本棄用警告；本次不影響建置或 AAB 驗證，但應在 CI／正式建置機統一 Android command-line tools 版本後再收斂。

## 建議送審順序

1. 先在 Play Console 確認最高已使用 versionCode；只有在 3 尚未使用時才上傳本候選包。
2. 以 Play 測試軌道安裝，不要用 sideload APK 取代 Play 安裝，完成 Android 16 啟動與登入／還原實測。
3. 核對 Play App Signing certificate 與 `assetlinks.json`；若不同，先補網域檔並部署，再重新驗證 TWA 無網址列。
4. 補上測試紀錄與商店更新說明後，再決定是否推送 PR／上傳。這份稽核本身沒有替使用者執行外部發布。
