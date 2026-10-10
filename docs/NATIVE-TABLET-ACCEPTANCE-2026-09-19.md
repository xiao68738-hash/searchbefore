# 原生平板視窗相容驗收（2026-09-19）

## 範圍

來源為 `5f82c4c` 的 debug 預覽 APK。本轮沒有修改 APP 程式、資料、版本代碼或 AAB，只新增可重跑的驗證腳本及文件。該來源的 GitHub Review35412708394／Native35412708409 均成功。

使用 API36 的獨立唯讀 `emulator-5580`，不登入 Google，不使用 Play 帳號 profile。手機 SUGAR C60 未操作，未安裝測試 APK，也未碰使用者本機或雲端紀錄。

**這是平板尺寸的視窗相容測試，不是實體 7 吋／10 吋平板、Play 簽章登入、長期 Android vitals 或正式上架驗收。**

## 可重跑流程

新增 `scripts/test-native-tablet-matrix.ps1`：

- 固定 serial、qemu、開機完成檢查；不允許選擇其他裝置。
- 先保存原有尺寸／密度覆寫值及字體比例。
- 兩組視窗各呼叫既有完整 UI runner；只有 runner 驗證完整成功標記後才列該組通過。
- 任何測試失敗會停止，不跳過失敗項目。`finally` 還原顯示設定；復原失敗同樣報錯。
- 證據含每個 APK SHA-256、實際 API／尺寸／密度／字體、完整 instrumentation 輸出及矩陣結果 JSON。
- 沒有卸載、清除資料、停止 ADB server 或操作其他裝置的指令。通知測試只在該獨立預覽套件運行。

執行方式見 `android-native/README.md`。需 PowerShell 7 與本次來源已建好的 debug／androidTest APK。

## 證據與結果

矩陣目錄：`D:/SearchBefore/audits/native-tablet-20260919-122843/`。

| 視窗 | 環境 | 結果 |
|---|---|---|
| 直向 | 600×960、160dpi、1.5 字體、API36 | 24/24 通過，212.094秒；native-ui-20260919-122844 |
| 橫向 | 1280×800、160dpi、1.5 字體、API36 | 24/24 通過，101.378秒；native-ui-20260919-123243 |

共 48 次測試檢查（同一套 24 項在兩種視窗各跑一次），不是 48 個不同測試。矩陣 `result.json` 為 `complete=true`、`restored=true`、無復原失敗；另以 ADB 查得尺寸恢復 360×640／無 override、密度 440／無 override、字體 1.0，與啟動前一致。完成後已對該獨立模擬器正常 poweroff，不影響手機。

負向防護亦實際執行：模擬器關閉、ADB 只剩 SUGAR C60 時再次啟動矩陣，回傳 exit 1／`Validation emulator is not online`，在任何顯示修改或安裝前停止；沒有退回預設装置或操作手機。

測試 APK 身分：

```text
app-debug.apk 85247171e05aeb291f7c622947dac6de56a3dbcf654c2851584659f89912ac45
app-debug-androidTest.apk 69de466ebbb5c4a8e60c22bdd133c0cf231e9cc74be40acb4f07927d1f2bfe81
```

網站 `tests/run-all.js` 本輪全部通過，包含新增的模擬器腳本靜態安全契約；靜態測試不替代上方實際執行。

## 圖片

本機 `D:/SearchBefore/releases/native-tablet-candidates-20260919/` 保留實際視窗原始 PNG。內容僅公開查詢：首頁、蔥×甜菜夜蛾、蔥×夜蛾類及登記用法。沒有用戶帳號或私有紀錄，沒有 AI 生成或移除預覽標示。

直向與橫向共八張均已目視確認；分開的防治對象標題與登記用法一致，六個分頁與移轉入口可見，內容超出時正常捲動，不將底部裁切誤認為全部內容皆已顯示。橫向目前仍是單欄全寬，留白較多；這輪只確認相容與操作，未宣稱已完成平板專用雙欄設計。

這些是大字體 QA／素材候選，不是已上傳的商店最終圖片。正式標示與最終建置確定後仍需重拍，不能把開發預覽冒充正式版。

## 發布狀態

本輪不合併 PR、不發布網站或 AAB、不更動 Alpha／正式版、測試者或 Firebase 規則。正式剩餘關卡仍見 `NATIVE-PRODUCTION-READINESS-2026-09-18.md`。
