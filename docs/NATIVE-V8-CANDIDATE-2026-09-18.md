# v8 原生內部候選版準備（2026-09-18）

更新：23:45已發布Play內部測試，9/19 00:03已完成真實Play更新、登入／同步／重啟與完整資料比對。下方「未上傳」為準備時歷史紀錄；最新狀態見`NATIVE-V8-INTERNAL-2026-09-18.md`。不是正式發布完成。

## 範圍

本輪依「確認後繼續作業」準備下一個可驗收套件，不代表正式上架完成。d53bcd6 的 Review／Native 兩項 CI 已於本輪確認成功。手機目前仍是 Play v7，沒有側載、解除安裝或清資料。

## 變更

- `versionCode 8`／`1.1.3-internal`，包含前輪已驗證的橫向版面與同步提示修正。
- 正式套件 `tw.searchbefore.app` 的安裝名稱改為「噴前查」；開發套件 `.nativepreview` 仍為「噴前查・原生預覽」，不混淆並排安裝。
- 頁首仍標示內部測試；預設 release 建置鎖、既有簽章檢查及僅內部發布限制不變。
- Google 同意頁顯示名稱由 OAuth 設定管理，不是 Android 安裝名稱；本輪沒有修改 OAuth 品牌、權限、Firebase 規則或價格。

## 驗證狀態

- 網站全套及新增 build-variant 名稱回歸檢查通過。
- 正式設定建置5分4秒成功：release JVM 71項通過、Lint零問題；300筆payload簽章符合既有upload憑證、4個64-bit library的16KB LOAD／RELRO通過，bundletool validate成功。
- 從實際AAB讀取 `versionCode=8`，`string/app_name=噴前查`，權限清單與封存的v7相同。沒有新增權限；合併Manifest仍為min24／target36、allowBackup=false、usesCleartextTraffic=false，未設debuggable。
- AAB已另存 `D:/SearchBefore/releases/native-internal-v8-20260918/searchbefore-native-v8-internal.aab`，SHA256 `a02b81a6f90d1c7facfd481f86b294f608af6c2970c3f65ddd2d16fe95742935`。只在本機準備，未上傳Play，未更新手機。
- 前輪 23 UI 與系統選檔還原證據見 `NATIVE-PRODUCTION-READINESS-2026-09-18.md`；不得當成 v8 已經由 Play 安裝驗收。

## 帳號驗收補記（23:21）

使用者已明確同意基本帳號分享。Play v7完成第二帳號登入、重啟後仍阻擋原資料同步、回原帳號同步與重啟保留；完整JSON的data與先前備份逐欄完全相等（2田區／1用藥／5農務／0配方）。没有把原紀錄同步到第二帳號。私人證據與範圍限制見`NATIVE-PRODUCTION-READINESS-2026-09-18.md`；不宣稱伺服器隔離全面驗收。

c4f1115兩項CI已確認SUCCESS。v8仍只在本機，尚待Play內部更新驗收，未發布Alpha或正式版。
