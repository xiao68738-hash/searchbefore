# 噴前查原生 Android 開發

2026-09-18 傍晚最終：D槽恢復後，補正深色模式系統列白底白圖示；最新 Android16／1.5倍字體 **22 UI 全通過**，71 JVM／Lint／網站全套／跨語言備份往返通過。測試新增專用模擬器及落檔腳本，實測失敗會正確阻擋。詳見[第四輪最終驗收](../docs/NATIVE-DISPLAY-MIGRATION-2026-09-18.md)。手機仍Play v6，本輪沒有发布AAB；新介面Play升級與跨帳號等發布閘門仍保留。以下輪次是歷史，勿將舊的「尚未測」當最新狀態。

2026-09-18 第四輪：新增裝置限定的字體／深色／高對比設定、紀錄搜尋與卡片、個人頁分區。首輪71 JVM／Lint與跨語言備份往返通過，Android14大字體21 UI全過；Android16環境啟動失敗，另補重開配色順序修正。最終驗收／提交狀態一律見[第四輪驗收](../docs/NATIVE-DISPLAY-MIGRATION-2026-09-18.md)。修正舊說明：網站 JSON 本來不含顯示偏好，偏好不遷移也不上傳；配方包含在 JSON，但不上傳雲端。下方輪次為歷史，不表示最新待辦仍全數未做。

2026-09-18 第三輪：新增保留登記上下限的面積換算（平方公尺／公頃），不對缺單位、特殊處理或劑型單位不符的資料硬算；配方新增多筆獨立試算、白色品牌卡，不代表混配建議，也不改寫保存設定。數字輸入按完成收起鍵盤。66 JVM、Lint及網站全套通過；最終Android16、1.5倍字體18UI全部通過（227.075s）。詳見設計一致性文件第三輪（含先前失敗與修正證據）。仍未更新手機或Play，偏好、其他頁面與完整移轉／發布驗收尚待。

2026-09-18 第二輪：新增倒數日曆／逐日明細、同田區最晚等待期與未知阻擋、每桶／整批桶數換算；不推定未指定田區的歸屬，不自動儲存施藥紀錄。61 JVM、Lint零問題、Android16 1.5倍字體完整16 UI及網站全套測試通過。見下方設計一致性文件的第二輪證據；仍未發布新AAB，手機Play v6不變。面積估算、多藥批次、偏好與其他頁面仍待。

2026-09-18 最新：v6 已發布內部測試，真實手機 Play 原地升級／登入保留／同步與完整資料比對通過，見 [v6 實機證據](../docs/NATIVE-PLAY-V6-2026-09-18.md)。使用者隨後要求以原 TWA 設計為基準；本機已還原深綠頁首、六個入口、查詢步驟與藥劑卡片，56 JVM、Lint 零問題、Android16 大字體 14 UI 通過，見 [設計一致性](../docs/NATIVE-TWA-DESIGN-PARITY-2026-09-18.md)。這輪新設計尚未發布 Play，手機 v6 未變；不是全頁像素級還原或正式替代驗收完成。以下日期較早段落保留為歷史。

2026-09-17 最新：Play v4 → v5 原地升級、Play 簽章、正式套件本人 Google 登入、空白本機匯入既有雲端及登出重登再同步已在 Android 11 通過，見 [Play 實機證據](../docs/NATIVE-PLAY-PHONE-2026-09-17.md)。完整移轉與其餘發布驗收仍待完成；以下 9/16 狀態屬歷史，不能再把正式登入列為完全未測。

品牌介面接續採透明 LOGO、米白底白卡、深綠字體、線條分頁圖示；用法與採收期在窄螢幕／大字體改成上下排列。附註、殘留提醒仍可直接閱讀，未合併不同登記。個人頁優先資料／登入／同步，提醒設定放後方。這些本機開發變更不會自動更新 Play v5。

2026-09-16：**原生候選版階段，不是已驗收的完整替代版，不可發布到正式群組。** 使用者僅同意內部測試，不更動 Alpha／正式版，也不新增測試者。

正式套件 `tw.searchbefore.app` 的 Firebase app 與 Play SHA-1／SHA-256 已經使用者同意建立；使用者提供的正式設定檔已核對並接入獨立 release resources，不能以預覽設定代替。正式簽署登入與移轉驗收仍待辦，發布鎖定保留。詳見 [正式登入設定紀錄](../docs/NATIVE-PRODUCTION-FIREBASE-2026-09-16.md)。

與 `android-twa` 位於同一 Git 專案，但使用獨立 Gradle 專案。Kotlin + Jetpack Compose 畫面，沒有 WebView、Chrome 容器或執行期 JavaScript。

## 已實作

- 作物搜尋 → 原登記防治對象 → 藥劑清單；藥劑普通名稱／商品名反查。
- 作物用藥總覽，點防治對象進入獨立清單。
- 相關分類只在底部連結，不將夜蛾類／甜菜夜蛾等合併。
- 稀釋數學換算、未知採收期、特殊用途與殘留提醒。
- 本機用藥紀錄、日期檢查與逐筆採收日期參考（不是整田區採收判定）。
- 新增田區／種植批次、儲存用藥時明確選田區、紀錄按田區篩選。新紀錄只可指定相同登記作物，不推定未指定紀錄的歸屬。
- 既有紀錄可修改施藥日期、操作者與田區（也可解除歸屬）；田區可修改名稱／種植日期，不更改作物。保留其他備份欄位、拒絕過期編輯畫面，時間戳大於已知舊版本。
- JSON 完整備份匯入／匯出。匯入確認後保留上一份資料，可回復。
- 匯入時不帶入帳號、token、同步同意；10 MB、筆數、ID、日期、田區引用與巢狀深度防護。
- 資料與刪除日誌以一份 AtomicFile 存於 `noBackupFilesDir`；只新增登入／同步需要的網路權限，沒有相機／外部儲存權限，停用系統自動備份。
- 明確排除 Android 12+ 雲端備份與裝置轉移的所有資料 domain；不只依賴舊版 `allowBackup` 設定。各廠牌真實轉移行為仍待實機驗收，手動匯出 JSON 不受此保護。
- 使用專案既有透明 LOGO；不讀取或修改使用者現有 APP／網站資料。
- 原生 Google 登入與手動 Firestore 同步已接入。登入不自動上傳；須另外同意同步。預覽 Firebase app 與 debug 指紋已登記；Android 11 實機登入、空白安裝下載、測試上傳及登出重登同步已通過，限制見下方驗收表。
- 六類農務（含設備）新增／修改／刪除、田區採收提醒、常用配方、水量調整與單次本機撤銷。
- 收穫部位篩選、拼音／注音／錯字候選；不自動把候選當登記結果，不合併不同防治對象。
- CSV、Excel、PDF 閱讀報表；完整移轉仍使用 JSON。報表不是官方 TAP 固定格式或驗證證明。

## 尚未完成，不能當作可上架

2026-09-16 最新 [Android 11 實機驗收](../docs/NATIVE-PHONE-ACCEPTANCE-2026-09-16.md)：修正雲端查詢參數遭拒，改為有上限的完整分頁下載；55 JVM 與 Lint 通過。真實登入與同步已驗證部分流程，完整移轉與正式身分仍未完成。先前施藥表單、提醒及 7 項 Android 16 測試為 [上一輪證據](../docs/NATIVE-APPLICATION-REMINDERS-2026-09-16.md)，不視為最新版全部實測。

| 項目 | 狀態／下一步 |
|---|---|
| Google 原生登入 | Android 11 預覽真實登入、登出與同帳號重登通過；正式 Firebase app／Play 指紋與資源已接入，正式簽署實測、取消／跨帳號完整驗收待辦 |
| 原生雲端同步 | 空白安裝下載、1 筆 TEST_ONLY 上傳與重登同步通過；第二台空白裝置還原新增資料、離線與跨帳號實測待辦 |
| 田區、農務、設備、配方編輯 | 已接入本機編輯、刪除確認與撤銷；仍需真實資料回歸與手機操作驗收 |
| 採收總覽／多筆用藥判斷 | 已有田區彙整與未知優先，37 組網站對照通過；仍需真實資料驗收，不是可採收許可 |
| 查詢完整相容 | 保持精確作物原登記；收穫部位已依網站資料生成。模糊／注音僅提供候選，尚不宣稱與 Web 所有候選排序完全一致 |
| 匯出 | JSON 實機匯出、同檔匯入及回復通過（使用者協助系統選檔）；CSV／Excel／PDF 已實作，假資料中文 PDF 與 Excel 已獨立開啟／渲染通過；完整雙向移轉與 TAP 固定表單待辦 |
| 無障礙、Android 16、離線與更新實機驗收 | Android 11 部分流程與通知通過；全頁無障礙、最新版 Android 16、離線與非空資料升級仍待驗 |
| 全量資料移轉 | 需真實網站 JSON → 原生 → JSON → 網站的對照驗收，以及帳號一致性驗證 |
| OCR | 不在本輪範圍，不是正式版功能 |

## 建置

在專案根目錄執行：

```powershell
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android-native.ps1
```

加上 `-Lint` 可連同 Android 靜態檢查一起執行，報告位於 `app/build/reports/lint-results-debug.html`。`-Connected` 只允許唯一連線的 `emulator-5580`，先用 `scripts/start-native-validation-emulator.ps1` 啟動可丟棄的唯讀 overlay，測試期間不要接其他裝置。UI 不登入／同步，但 Gradle 會安裝及解除安裝套件，**不可用此流程驗收使用者手機**。Lint、單元測試與建置都不能取代實機操作、登入／同步或備份移轉驗收。

`-UiTestApk` 只額外編譯 Android UI 測試 APK，完全不安裝／操作裝置。手機仍連接時不可跑 `-Connected`；如需手動驗證，先核對唯讀獨立模擬器的 serial、qemu 與 API，再對明確的 `emulator-5580` 執行安裝與 instrumentation，不能使用沒有 `-s` 的安裝／測試指令。

腳本先以既有 JS 純函式產生唯讀資料檔，再跑原生單元測試與 debug APK。生成檔忽略於 Git；農藥原始資料不變。預覽目前有 287 作物、17,333 原登記列，資料日 2026-07-21；**不是新的官方資料更新**。

- 開發 APK：`app/build/outputs/apk/debug/app-debug.apk`
- 單元測試：`app/build/reports/tests/testDebugUnitTest/index.html`
- namespace：`tw.searchbefore.nativeapp`
- debug applicationId：`tw.searchbefore.app.nativepreview`，與現有 APP 並存。
- 正式基礎 applicationId：`tw.searchbefore.app`；內部候選使用既有 upload key 簽署 AAB，由 Play App Signing 簽署派送的 APK。本機 upload key 不等於 Play 安裝簽章。
- compile/target API 36，min API 24（保留現有 Play 自動保護的最低要求），Java 17／desugaring。
- 目前候選 versionCode 6／versionName `1.1.1-internal`；2026-09-18 最新成功讀取的 Play 最大套件代碼為 5。v6 本機已建好，尚未上傳；續作上傳仍須核對並行發布是否占用版本碼。
- 預覽的 `firebase-preview.json` 由 Firebase Console 下載，必須符合預覽 package 與 project，且包含 Web OAuth client；此檔忽略於 Git。無設定時仍可使用本機功能，但登入不啟用。不能用此設定替代正式 Play 身分。

最新實測結果與尚未通過項目集中在 [原生整合驗收](../docs/NATIVE-INTEGRATION-2026-09-16.md)，歷史測試數字不代表目前整包已驗收。

一般 `preReleaseBuild` 仍會拒絕執行。僅明確的內部候選腳本可帶入正式 Firebase 設定與既有 upload key，並檢查上傳憑證 SHA-256、release 單元測試、Lint 再產出 AAB：

```powershell
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android-native-internal.ps1 -InternalTestingOnly
```

此腳本不執行上傳／发布，也不儲存密碼到 Git。**AAB 本身不能限制 Play 軌道**：內部測試限制必須在 Console 的實際發布操作遵守，不可將此候選提升到 Alpha 或正式版。正式 Google 登入與 TWA 升級仍必須使用 Play 派送版本驗收。

APP 已提供「舊版資料移轉」入口；不自動登入、讀 Chrome 或上傳。先在原瀏覽器匯出完整 JSON，再核對匯入筆數；僅已有雲端同步的資料可從同帳號還原，雲端不含配方與偏好。匯入會保留上一份本機資料並暫停同步。完整真實雙向驗收尚待完成。

原生化不要求新開商店 APP，但必須維持 applicationId 與正確的 Play App Signing 身分。不要解除安裝 TWA 來測試移轉；瀏覽器 localStorage 不會自動移到原生資料目錄。

## 同步協定相容注意

Web 修正仍使用 `users/{uid}/{records|fieldPlots|farmRecords}/{id}`、`updatedAt` ISO 毫秒字串與 `_deleted` tombstone。完整伺服器核對不再依用戶端 checkpoint 過濾。原生接入時也必須保留帳號歸屬、主動上傳同意、伺服器確認、交易內重新比對，以及切換帳號取消在途工作；不能只把 JSON 直接 set 覆蓋。

參考：[Compose 設定](https://developer.android.com/develop/ui/compose/setup-compose-dependencies-and-compiler)、[Firestore 交易](https://firebase.google.com/docs/firestore/manage-data/transactions)。
