# v10 正式候選準備（尚未上傳）

日期：2026-09-26。此文件不代表正式發布、Play實機或完整安全驗收。

## 變更

- Console最新版本頁實讀最高代碼9後，來源改為versionCode10／versionName1.1.4；同套件tw.searchbefore.app，min24／target36，既有upload簽章。
- Release畫面改顯示「版本 1.1.4」，不宣稱正式軌道或已通過審查。Debug仍顯示原生開發預覽，舊internal版本仍可正確識別。
- 作物名稱提醒去除「原生預覽」開發措辭，保留不自動合併別名的實際限制。
- 不更動登入／同步規則、資料schema、權限或release簽章閘門。明確候選建置不授權任何Console發布。

## 本機成品

`D:/SearchBefore/releases/native-v10-candidate-20260926/searchbefore-native-v10-candidate.aab`

- 14,220,684 bytes
- SHA256：`147989c3cd51c5aa046945252e9ee3f1eeb83b3b2d90c51a7d6a5f21d738049c`
- 旁邊AndroidManifest.xml是建置產生的合併Manifest，不是從Play下載的文件。
- bundletool直接讀取AAB確認versionCode10、versionName1.1.4；validate exit0。
- 成品另存，不覆寫v9封存、不加入Git、不安裝使用者手機。

## 驗證

- `build-android-native-internal.ps1 -InternalTestingOnly`成功：7分55秒，72tasks／37executed／35up-to-date。
- 18 suites／74 release單元測試，0 failures／errors／skipped；3項新增版本標示測試。
- release Lint：`No issues found.`。
- 合併Manifest安全基準、300payload upload簽章、4個64-bit庫16KB LOAD及RELRO邊界、6個合成邊界測試通過。
- 47個根JS測試檔全過（runner另重跑2個分類檔，不重複計数）。
- 既有SDK XML、metrics目錄及Gradle9相容警告保留，不因此降低安全檢查或宣稱零風險。

## 私人備份比對工具

```text
node scripts/compare-native-backups.cjs <更新前.json> <更新後.json>
```

只讀兩份支援的完整備份，逐項比較整個data內容，忽略匯出時間與APP版本；陣列順序仍需相同。只輸出相同與否、固定欄位類別及筆數，不輸出紀錄、ID、帳號或檔案路徑。exit0相同、1有差異、2讀取／格式失敗。

回歸涵蓋同筆數但欄位改動、排序、未知欄位、缺集合、schema、過大檔案及錯誤訊息不外洩。這不是備份匯入驗證器，也不驗證Google登入、伺服器同步、顯示偏好或Play安裝。

9/26手機顯示2田區／1施藥／5農務／0配方，帳號已登入、同步開啟；未按同步或登出。新匯出3911bytes備份與9/22私人基準的完整data相同。檔案只存在private目錄，不入Git。

## 尚未通過的閘門

- 手機仍Play v8；9/26商店顯示離線。已請使用者接通網路，沒有改網路設定、卸載或清資料。
- v10尚未上傳／Play安裝，也沒有最終手機與平板商店圖；不可把舊v8驗收或debug畫面當v10正式验收。
- 審查帳號、登入聲明、公開政策部署、OAuth品牌及品質報告詳見[發行入口](PRODUCTION-LAUNCH-PREP-2026-09-26.md)。
