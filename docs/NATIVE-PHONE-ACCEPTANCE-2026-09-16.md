# 原生預覽：Android 11 實機驗收

本次使用 SUGAR C60（API 30），在原噴前查旁獨立安裝 `tw.searchbefore.app.nativepreview`。不解除安裝、不清除資料、不執行會安裝／解除安裝套件的 Gradle connected suite。正式 Play 套件與 release guard 不變。

## 已觀察

| 檢查 | 結果與限制 |
|---|---|
| 新安裝 | 四類本機集合與三類刪除日誌均為 0；同步、通知預設關閉 |
| Google 登入 | 使用者在原生 Credential Manager 選擇帳號後，Firebase 原生登入成功；沒有使用瀏覽器 token |
| 預覽版更新 | 同簽章 `adb install -r` 成功，Google 登入及本機設定保留；更新時尚無紀錄，不算非空資料升級或 TWA → 正式原生驗收 |
| 同步同意 | 登入後仍須明確開啟，再按立即同步；登入本身不會上傳 |
| 第一輪同步 | 失敗，沒有宣稱備份成功；本機仍 0 筆，完成時間空白 |
| 同步診斷 | `CLOUD_INVALID_ARGUMENT`，階段 `READ_fieldPlots`，固定診斷詞 `limit,query,invalid,value`；尚未進入任何上傳交易 |
| 修正後空白安裝下載 | 10:41:40 UTC 完成伺服器同步：2 田區、1 用藥、3 農務，原有用藥刪除標記 1 筆保留；本機初始四集合為空 |
| 測試紀錄上傳 | 只新增 1 筆明確 TEST_ONLY 的設備測試，不是實際施藥／採收；10:47:13 UTC 正常交易完成，農務增為 4 筆 |
| 登出／重登／再同步 | 登出保留資料並停用同步；同帳號重登後重新同意，10:51:58 UTC 同步成功，仍為 2／1／4，未重複新增 |
| JSON 匯出 | 系統儲存視窗成功輸出至手機 Download；驗證 data 內為 2 田區／1 用藥／4 農務，無 token、ownerUid 或同步授權設定 |
| JSON 實機匯入 | 尚未通過：系統檔案選擇器對測試工具點擊沒有反應，尚未進入 APP 匯入確認，不能推論匯入成功或確診 APP 解析故障 |
| 通知 | 開啟後系統 job 960916 等待排程；測試通知 960917 實際存在，visibility PRIVATE；關閉後兩者皆移除 |
| 查詢 | `cong` 顯示待確認的「蔥」；選擇後夜蛾類 20 筆與甜菜夜蛾 1 筆分列，不自動合併 |
| 田區視窗 | 新增視窗可開啟及取消，未寫入虛構施藥／採收紀錄 |

## 本次修正

- 將一次 `limit(45001)` 改成按文件 ID 排序、每頁最多 500 筆的 `Source.SERVER` 完整讀取；使用上一頁文件游標。不改 UID 路徑或規則。
- 仍有總筆數／位元組上限、重複分頁檢查；恰好達上限時讀取額外 1 筆以偵測超限，不靜默截斷。三個集合全部下載及檢核後才允許交易上傳。
- 增加固定錯誤代碼、有限詞彙診斷。開發日誌只記階段／代碼／程式位置，不記 exception message、token、帳號、文件 ID 或私人欄位。
- 新增唯讀 `scripts/read-native-device-state.ps1`，只輸出集合總數、設定與完成時間，不能單獨證明雲端已備份。未連線的 serial 會拒絕，不操作其他手機。
- 本機 JVM **55 項通過**；Lint **No issues found**；debug APK build 成功（3m30s）。本輪没有執行 Android 16 connected suite，之前 7 項結果仍為先前版本證據，不冒充此輪重測。

分頁設計參考 [Firebase 官方 query cursors](https://firebase.google.com/docs/firestore/query-data/query-cursors)。不能把本次觀察推論成所有 Firestore 服務一律限制 500 筆。

## 仍需驗收

本輪驗證了空白原生安裝下載既有雲端資料、正常交易上傳一筆測試、保留本機資料的登出重登再同步。沒有清空裝置，因此**尚未驗證新增測試紀錄在第二台空白裝置還原**；沒有獨立後台核對，也不把本機總數單獨當作伺服器證據。

待辦：JSON 實機匯入與回復、真實網站 JSON → 原生 → JSON → 網站移轉、離線重試、跨帳號拒絕、非空資料更新保留、最新版 Android 16 回歸與正式套件簽署。正式 `tw.searchbefore.app` Firebase／Play 簽章設定仍等待使用者同意；預覽設定的同意不等同正式設定授權。後台私人資料唯讀核對另等待確認，不改用其他通道繞過後台的安全攔截。

手機保留一筆 `TEST_ONLY_NATIVE_20260916` 設備紀錄，動作 `Sync_test_only_NOT_actual_farm_work`，以及 `Download/噴前查原生備份_2026-09-16.json`。測試通知已關閉，未刪除原紀錄。備份與私人畫面不加入 Git。測試期間鍵盤由注音切換為英文以輸入測試標記；尚待恢復原鍵盤語言。

```powershell
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/read-native-device-state.ps1 -Serial <adb-devices顯示的裝置序號>
```

**狀態：仍在驗收，不能標記完整原生正式版完成，不能發布到 Play。**
