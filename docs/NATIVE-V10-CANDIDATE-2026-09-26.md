# v10 正式候選準備（已發布至內部測試）

日期：2026-09-26。此文件不代表正式發布或完整安全驗收；Play 實機限定驗收見[另檔](NATIVE-PLAY-V10-2026-09-26.md)。

## 9/26 續作：內部發布

- 使用者恢復手機網路後，先完成 [v8→v9 實機資料保留驗收](NATIVE-PLAY-V9-2026-09-26.md)，再依既有「只發布內部測試」授權上傳同一 v10 AAB。重新計算 SHA256 與下列封存值一致。
- Console 內部軌道 `4701325807268914734`、release `6`，名稱「1.1.4 (10) 正式候選驗收－僅內部測試」。9/26 13:11 明確顯示「提供給內部測試人員」。未更動 Alpha、正式版、測試名單或 9/12 舊草稿。
- 上傳識別 10／1.1.4、min24／target36。Play 檢查無阻擋錯誤，兩項警告為未附去混淆檔與原生偵錯符號；原始碼 release 為 minifyEnabled false，原生符號限制沿用既有依賴診斷紀錄，不偽造檔案消除警告。
- Play 裝置差異表：手機 12,335、平板 6,747，皆新增／停止支援 0。這不是逐裝置測試通過。
- 程式提交 `9e77ffff79b6b63134a7e1736fe230004f055138`；Review 36217998545、Native 36217998560 均成功。
- 手機已於 13:15:11 透過 Play 原地升至 v10，登入／同步同意保留；更新後及同步重啟後完整資料比對均相同。詳見 [v10 實機驗收](NATIVE-PLAY-V10-2026-09-26.md)，不擴張為全新登入、跨帳號或全功能認證。

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
- 成品另存，不覆寫v9封存、不加入Git；初次本機建置未安裝，後續 Play 驗收見上方續作。

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

- 手機連線已恢復，v9 升級／登入保留／同步重啟／完整備份比對通過。沒有改網路設定、卸載或清資料。
- v10 已內部發布及完成上述 Play 升級／資料保留驗收。已擷取五張實機素材候選，但最終手機與平板商店圖仍須挑選／補齊；不可把 debug 畫面當 v10 驗收。
- 使用者本輪確認「尚未準備」專用審查帳號；不得以個人帳號代替或聲明已提供。
- 審查帳號、登入聲明、公開政策部署、OAuth品牌及品質報告詳見[發行入口](PRODUCTION-LAUNCH-PREP-2026-09-26.md)。
