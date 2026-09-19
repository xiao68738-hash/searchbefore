# 原生系統整合驗收（持續更新）

## 本輪範圍

後續施藥輸入與本機通知已接續實作，最新狀態請讀 [原生施藥／提醒續作](NATIVE-APPLICATION-REMINDERS-2026-09-16.md)。使用者後來指定真實手機登入／雲端往返先跳過；此項仍待驗收。下方是前一階段整合證據，不覆蓋後續狀態。

使用者要求持續完成同專案原生 Android 系統；保留網站與 TWA，不更換目前 Play 版本。工作在 `agent/native-preview-20260916`／草稿 PR #148。Web 同步與底部分類導覽仍在獨立 PR #147，不能混稱已部署。

## 已完成的外部設定

2026-09-16，使用者明確同意後，在既有 Firebase `searchbefore-4648b` 新增 Android app：

- package：`tw.searchbefore.app.nativepreview`
- Firebase app ID：`1:934300362639:android:f8ffd9528072e4f5a5cdfa`
- debug SHA-1：`21:AD:5F:DE:2A:AD:0E:3D:69:1D:D0:C5:39:13:84:1B:8E:76:C9:7B`
- debug SHA-256：`CE:DF:69:7A:25:5D:55:28:96:CF:B7:63:F5:9A:61:19:F6:C7:61:01:4E:33:B5:9B:8F:C3:2B:26:F0:43:0A:03`
- Console 確認兩指紋均已保存；下載設定含 Android／Web OAuth client。
- 設定在本機忽略檔 `android-native/firebase-preview.json`，只為 debug 生成 SDK resources。沒有服務帳號私鑰，沒有改 Firestore 規則，沒有代使用者登入 Android Google 帳號。
- 正式 package 的 Firebase／Play App Signing 設定尚未處理；本輪同意只涵蓋預覽版，不能直接拿 debug 身分發布正式版。

## 程式整合

- Kotlin／Compose 原生五分頁：查詢、用藥紀錄、農務、配方、個人。
- Credential Manager + Firebase Auth；登入不觸發雲端讀寫。
- 明確開啟同意後手動同步 `users/{uid}/{fieldPlots|records|farmRecords}`；配方、偏好、登入資料不混進同步內容。
- Firestore 完整 server read，不按 checkpoint 過濾；上傳交易內重讀最新文件。`_deleted` 與網站一致，同時間刪除優先；doc ID 為準。
- 帳號 UID + session generation 檢查，換帳號拒絕直接上傳先前帳號資料。同步中途失敗不能顯示成功；已提交的寫入無法回收，提示可重試。
- Firestore 記憶體快取；本機 `noBackupFilesDir` 一份 AtomicFile 儲存資料與刪除日誌，避免兩份檔案不同步。舊預覽檔保留，移轉失敗不清空。
- ViewModel 持有 IO 工作，畫面重建不取消正在存檔的操作；匯入前保存回復副本，匯入／回復後停用同步。單次本機修改可撤銷，同步後撤銷快照失效。
- 六類農務新增／修改／刪除；採收紀錄需明確確認是事實紀錄，不代表可採收許可。
- 田區採收提醒不排除 track/notify 偏好，未知採收期不能標為可採。用藥及空白田區刪除需確認，有引用的田區拒絕刪除。
- 常用配方保存／水量調整／商品名核對／刪除；特殊用法與未知單位不提供自動稀釋。
- JSON 完整備份；CSV／XLSX／PDF 閱讀用報表。CSV 防公式注入，XLSX 一律 inlineStr，不建立公式、外部連結；PDF 上限 2,000 筆。這不是官方 TAP 固定表單或驗證證明。
- 作物收穫型態與殘留提醒從現有 `crop-forms.js`／`mrl-status.js` 生成，不重新推測；不適用／待確認列保留但停用捷徑。
- 拼音／注音／錯字建議在裝置本機比對，須點選正式名稱；不直接視為合法登記結論。

## 找到並修正的相容差異

1. 舊原生預覽採收日只加 phi，少於網站既有「日期 + phi + 1 日」。本輪改為日期 + ceil(phi) + 1，整數與現有網站一致，匯入小數不會縮短等待。
2. `UsageRow.phi` 原先取 Int 會截斷小數，改為保留 Double。
3. Firebase Auth 24.2.0 需要 Kotlin 2.3 metadata；原生工具改為 Kotlin／Compose plugin 2.3.0、AGP 8.13.2，保留 Gradle 8.13 / JDK 17。
4. 原生資料刪除標記必須用網站的 `_deleted`，不是另造 `deleted`。
5. 第一次 Android CI 找到連續編輯可能得到同一毫秒時間戳；`204eeb5` 先截成儲存的毫秒精度再比較，加入固定時鐘與 100 次連續編輯回歸。
6. 放大字型測試找到切換防治對象後仍保留上一清單捲動位置；`557d086` 切換範圍時重置頁首，測試改為標題必須實際可見，並保存公開查詢截圖。

## 驗證紀錄（不得把舊結果當最新）

- 前一輪中途版本：27 個 JVM 單元測試通過，debug APK 可編譯；Lint 當時 0 errors／2 warnings，已針對警告修改，仍需最後重跑。
- 新增網站基準產生器：1,464 組整數採收日期、37 組整田區判斷、13 組同步衝突案例，建置時由既有 Web 純函式生成；全部通過。
- Android 16 唯讀模擬器 `emulator-5580` 已完成開機；不清除原 AVD，結束不保存 snapshot。
- 前一整包 `build-android-native.ps1 -Lint -Connected` 通過：38 個 JVM、5 個 Android 16 測試，Lint **No issues found**。API 23 不相容的 ZipOutputStream 建構式已修正，沒有提高最低版本或忽略警告。
- 最新程式提交 `557d086`：本機 `build-android-native.ps1 -Connected` **BUILD SUCCESSFUL（7m15s）**，39 個 JVM／5 個 Android 16 測試全部通過，字型設定 **1.5**。遠端 [Android build／39 JVM／Lint](https://github.com/xiao68738-hash/searchbefore/actions/runs/35069058991) 及 [Node 回歸](https://github.com/xiao68738-hash/searchbefore/actions/runs/35069059065) 均成功。大字只涵蓋所列導覽，不代表全頁無障礙驗收完成。
- Android 測試包含：精確分類與底部跳轉、五分頁／畫面重建、隔離舊檔移轉及匯入回復、損壞檔案不被清空、20 筆假資料的中文多頁 PDF 可渲染與 XLSX 產生。沒有點 Google 登入、同步或修改使用者真實紀錄。
- Node 全套回歸再次通過；17,333 原登記列、部位分類及殘留狀態均對照既有資料。原始 DATA SHA256 維持 `b986f7b0c0dce60738a6850601cee670104a6dd7264b605ef4d59fbe3196950e`。
- AVD 的 Google 數位健康背景程式曾 ANR；只在本輪唯讀 overlay 停止該程式後完成測試。此環境問題有記錄，不代表真實手機效能已驗收。
- 真實 Android Google 登入、上傳、登出、另一裝置匯入：**尚未驗收**；沒有使用瀏覽器登入狀態冒充。
- 真正由 Android 產生的假資料 PDF：5 頁，第一頁中文與換行視覺檢查正常；獨立 PDF reader 確認每頁有內容。XLSX 以獨立讀取器重新開啟，20 筆／8 欄完整且無公式；已修自動換行、欄寬、列高，再次渲染確認範例長文字可讀。稽核檔位於專案根目錄 `audits/native-acceptance-20260916`，只含假資料與公開查詢。
- 狀態列深色圖示已經畫面重驗。模擬器非測試模式冷啟動較慢；效能仍需真實手機驗收，不能以 UI 測試的 60 秒等待門檻宣稱啟動速度合格。
- 正式手機資料移轉、全頁無障礙與 TalkBack、安裝更新保留資料：仍需驗收。實際施藥記錄的完整水量／用量輸入、原生通知及官方 TAP 固定表單尚未全面移植，不能宣稱功能完全等同網站。

## 建置與保護

`scripts/build-android-native.ps1 -Lint -Connected` 先生成資料與 Web 基準，再執行 JVM／debug APK／Lint／Android 測試。UI 不點登入、同步、匯入、保存或刪除；檔案測試只寫 cache 下獨立目錄。**Gradle 測試流程仍會安裝／解除安裝套件，不得跑在真實使用者手機。** 腳本於建置前再次檢查，只接受唯一連線的 `emulator-5580`；須先用 `start-native-validation-emulator.ps1` 啟動唯讀 overlay，測試期間不要連接其他裝置。裝置保護已驗證正常模擬器放行，手機、混接、離線、其他模擬器、無裝置、混接無權限裝置六種情況拒絕。真實手機驗收另外安排，不使用此 Gradle 流程。只要尚未完成正式身分、完整移轉與安全驗收，`preReleaseBuild` 保持阻擋，不合併、不發布。

新增 `.github/workflows/native-preview.yml`：PR 上編譯 debug、跑 JVM／Lint，官方 Actions 固定提交、contents:read、不保留 checkout 憑證，不提供 Firebase 設定或正式簽章、不部署。CI 的真實執行結果另核對，不能拿 YAML 檢查當遠端通過。

官方參考：[Firebase Google 原生登入](https://firebase.google.com/docs/auth/android/google-signin)、[Firestore 離線快取](https://firebase.google.com/docs/firestore/manage-data/enable-offline)、[Kotlin 與 Android 建置相容](https://developer.android.com/build/kotlin-support)。
