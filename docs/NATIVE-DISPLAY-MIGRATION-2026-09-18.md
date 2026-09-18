# 原生第四輪：閱讀設定、紀錄卡片與備份往返

## 範圍

使用者要求繼續完成原生版，並優先用模擬器驗證。本輪只操作獨立 Android 16 emulator-5580 的可丟棄 overlay；不操作手機、Firebase 使用者資料、Alpha 或正式發布。

## 已實作

- 個人頁依資料概況、帳號同步、備份報表、通知閱讀分區。
- 本機標準／大／特大字體、深色與高對比模式。系統字體更大時不縮小；不需額外權限或網路字型。
- 偏好放在原子儲存的私有 envelope，與匯出資料分開。重開可保留；匯入紀錄不改偏好、不開啟同步同意。
- 用藥紀錄新增藥劑、作物、病蟲害、日期、操作者、備註的文字篩選；沿用明確田區篩選，不合併登記。每張紀錄卡包含用量、日期、備註及修改／刪除入口；農務亦採品牌卡片。
- 修正舊版移轉說明：網站 `exportFullBackup()` 本來就沒有顯示偏好。JSON 包含配方，雲端同步不包含配方；偏好兩者皆不包含，換裝置須重新設定。

## 可重跑驗證

在專案根目錄執行 `rtk proxy pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/build-android-native.ps1 -Lint -UiTestApk`。

- JVM：偏好白名單、錯誤值降級、系統字體不縮小、匯入保留偏好但不授予同步權限、紀錄搜尋。
- 模擬器：閱讀設定操作、四種配色文字對比、本機 AtomicFile 重開／匯入保存；完整既有導覽／通知／紀錄回歸另跑。
- 真正跨語言往返：網站 `farm-records.js` 產生匿名合成備份 → Kotlin 匯入及匯出 → `scripts/verify-native-backup-roundtrip.cjs` 交回網站 reader 比對。涵蓋兩田區、兩施藥、六種農務、兩配方、型態、實際用量與單位、備註和採收狀態。
- 匯入是本機修改，同步時間戳必須前進；測試明確驗證它增加，其餘支持欄位保持一致，不把時間戳變動當資料遺失，也不忽略其他差異。
- 此往返是合成資料，不能代替使用者完整私人資料及真實跨帳號驗收。未知擴充欄位不代表網站 reader 保證保留。

## 發布界線

現有映像為 API 34／36 Google APIs，沒有 Google Play Store。可驗證離線原生 UI／儲存，但不能據此宣稱最新版 Play 簽章更新或真實 Google 登入通過。舊 v6 的 Android 11 Play 升級／本人同步證據仍有效，但不是本輪所有新修改的驗收。

本輪不發布 AAB、不更改正式版鎖定。不將合成畫面當商店正式版截圖。

## 執行結果

首輪建置12m25s成功，71 JVM／零失敗／零錯誤，Lint `No issues found.`，網站全套及跨語言備份往返通過。

Android16（2核心與4核心）啟動過程均遇到System UI／system ANR，藍牙堆疊反覆SIGABRT，APP啟動也逾時；三次instrumentation都在測試開始前回報Process crashed，**不列為通過**。只在唯讀測試overlay關閉藍牙，未變更使用者手機或主機安全設定。

改用既有Android14的唯讀overlay；开機也曾SystemUI ANR，點等待恢復後，同一APK在720×1280、320dpi、1.5倍字體完成全套 **21 UI，全部通過，246.114s**。包括新增閱讀設定與文字對比、本機設定持久保存測試。

一般字體實際操作個人頁／切換深色及高對比，強制停止再開後私有設定仍為dark=true、highContrast=true、syncEnabled=false、無owner。合成／空白資料畫面在本機 `D:/SearchBefore/audits/native-display-migration-20260918/`；`personal-ready.png`、`settings-options.png`、`settings-dark.png`已目視確認。

視覺查核揭露重開時在查詢資料載入完成前仍顯示預設亮色，因此再調整NativeState：先讀取私有本機envelope，再解析catalog。此最後小修正在重建／回歸；上方21項是小修前結果，不能冒稱最新完整驗收。

測試啟動腳本增加明確白名單的API34／36選擇、2／4核心，以及可選的低解析framebuffer。低解析仍須於開機後設160dpi，保持與原720／320相同的360dp視窗及字體設定，不放寬UI斷言。預設行為不變，仍使用唯讀overlay、固定專用serial、不寫快照。
