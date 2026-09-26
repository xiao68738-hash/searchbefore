# 原生第四輪：閱讀設定、紀錄卡片與備份往返

## 9/18 傍晚接續狀態（優先於下方過程紀錄）

**最終：追加系統列修正後，API36／360×640／160dpi／1.5倍字體完整22/22通過，76.397s。** 證據 `audits/native-ui-20260918-181251/`；app SHA256 `6a43b4db6a51fdae7d29af49eba7d56378e30b7db612f80107d32dfc632d4e7d`、test SHA256 `fbab87e0d6b1114853bac13f0629de8c3cba5955db39ec4ab93a6d907651bf36`。網站全套（含新增模擬器安全契約）、71 JVM、Lint及跨語言备份往返均通過。本輪不新增Android權限、不變更Firebase規則或同步格式；只在可丟棄模擬器做偏好切換並恢復，未碰手機資料。不等同真實Google／新版Play驗收。

D 槽恢復後核對工作樹，原生修改仍為已推送草稿 PR148 的 `496d1fe`，沒有重建或覆寫來源。該提交的 GitHub Review 與 Native Android 檢查均成功。最後的啟動配色順序修正已完成建置：71 JVM／0 失敗／0 錯誤、Lint 零問題；網站全套及跨語言備份往返本輪再次通過。

手機唯讀確認為 SUGAR C60、Play installer、versionCode 6／1.1.1-internal。本輪不改裝或清除手機，不操作其帳號、同步或紀錄。最新介面仍未發布 Play。

第一次重測使用 API36、360×640／160dpi、1.5 倍字體，完整 21 項中 19 通過。兩項頁首像素失敗，預期 RGB(23,51,31)，實際 RGB(9,19,12)；截圖確認 System UI ANR 系統視窗把下方畫面變暗。沒有降低斷言或修改 APP 來掩蓋；僅在獨立 overlay 關閉無回應的 System UI，確認 Android 桌面恢復後重跑同一 APK 全套。

第一輪證據：本機 `audits/native-ui-20260918-174758/`；開機／遮罩／復原圖：`audits/native-emulator-20260918-174421/`。第二輪證據：`audits/native-ui-20260918-175137/`；**21/21 全通過，70.758s**。兩輪相同 APK SHA256：app `810bf16705fb82f099a71e78d936ff26a691567d8951a49039bc5482dac4c3ec`，test `b6db42c38c3a1272ebaf0b520ed98af7f7fd7de3831dae064c1b88347ac6ff14`。

其後一般字體實際操作深色開關、force-stop／重開，深色偏好已保留；畫面見 `dark-settings.png`／`dark-reopen.png`。另發現 Android 系統狀態列白底配白色圖示，仍不易閱讀。補正 MainActivity 明確 edge-to-edge，並在 systemBarsPadding **之前**繪製主題背景，保留所有控制的安全邊距。新增第22項實際視窗測試，驗證深色狀態列／手勢區背景及圖示亮暗旗標；不是只測元件配色。

追加修正重建7m15s成功，71 JVM／零失敗、Lint零問題、備份往返通過。第一次新套件21/22：新增測試未先捲入LazyColumn尚未組合的深色設定，故尚未走到配色斷言；失敗證據 `audits/native-ui-20260918-180710/`。改為先找外層清單的目標item，再用最多8次真實手勢使控制顯示，保留可見與配色斷言，不更改APP邏輯。僅重編測試套件2m23s成功。一般字體實際操作也確認系統列深色／亮色正常：`audits/native-emulator-20260918-180400/fixed-dark.png`、`restored-light.png`。測試前已用UI恢復預設亮色及1.5倍系統字體。

新增 `scripts/test-native-emulator.ps1`：固定 emulator-5580，確認 qemu 與 boot completed，只安裝本專案 debug preview／test APK；逐次保存 SHA256、系統／字體設定、完整 runner 輸出。adb 返回 0 不足以代表通過，必須有完整 OK 標記且沒有 crash／failure。首次 19/21 已驗證腳本確實回報失敗。

另備 `scripts/start-native-play-emulator.ps1`，專用 private Google Play API36 profile 與 emulator-5582；和 UI profile 不共用帳號或資料。兩個啟動腳本均拒絕與既有模擬器並行。Play 腳本的並行拒絕已實測；帳號登入及下載尚未執行，不能據此宣稱 Play 驗收完成。

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
