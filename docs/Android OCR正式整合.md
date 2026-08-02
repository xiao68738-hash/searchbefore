# Android OCR 正式整合手冊

## 目標

把目前獨立安裝的表單辨識原型整合到正式 `tw.searchbefore.app`，流程固定為：

1. 使用者在噴前查「紀錄 → 拍攝表單建立草稿」主動按下掃描。
2. 正式 Android App 開啟 `ScanActivity`，在裝置上完成裁切、品質檢查與繁體中文 OCR。
3. Android 只把文字區塊、位置與品質指標傳回 `https://searchbefore.tw`，不傳照片。
4. 網頁建立未儲存草稿；使用者逐欄核對後，才可帶入原本的紀錄表單。

依 2026-08-03 訪談調整：OCR 只是其中一種輸入輔助，不是第一階段主要產品入口，也不能以「自動登打」對外宣傳。應先驗證會使用手機的農民能否以常用商品清單直接完成紀錄，以及登打人員逐筆覆核是否真的省時，再決定正式整合時程。

農藥辨識不得只依單一名稱自動決定產品。候選至少要同時顯示商品名、普通名稱、劑型與含量；可取得時再加入許可證識別資訊。資訊不足或有多個候選時只能標為待人工確認。

## 已完成的可重用部分

`android-ocr-prototype/ocr-feature` 是獨立 Android Library，正式 App 與測試 APK 可共用：

- `ScanActivity`：啟動 ML Kit 文件掃描器及中文文字辨識。
- `OcrQualityEstimator`：估算解析度、清晰度與反光比例。
- `OcrContract`：集中管理 `PQC_OCR_SCAN_REQUEST`、`PQC_OCR_SCAN_RESULT`、協定版本、`requestId` 與 Activity result key。
- Android Library 不要求網路、相簿或檔案讀寫權限；掃描 Activity 預設 `exported=false`。

網站端 `form-ocr-ui.js` 已完成：

- 只接受 `https://searchbefore.tw` 或正式 App 來源的訊息。
- 限制訊息大小，拒絕 Base64、圖片 URI、圖片資料與未知協定。
- 以 `requestId` 配對本次掃描，拒絕過期或非本次請求的結果。
- OCR 用藥名稱必須唯一對回正式登記資料，否則不能直接帶入。
- 所有辨識內容只是草稿，不會自動儲存。

## 正式 Android 原始碼到手後的步驟

1. 以 PWABuilder 或 Bubblewrap 取得 `tw.searchbefore.app` 的完整 Android 原始碼。只有 APK/AAB/keystore 不能安全修改功能。
   - TWA 的正式啟動網址使用 `https://searchbefore.tw/?app=google-play`，讓網站在任何付款設定載入前就能辨識 Google Play 版。
2. 將 `ocr-feature` 資料夾複製到正式 Android 工程根目錄。
3. 在 `settings.gradle` 加入 `include(":ocr-feature")`，在正式 `app/build.gradle` 加入 `implementation project(":ocr-feature")`。
4. 正式 Manifest 宣告 `tw.searchbefore.ocr.ScanActivity`，保持 `android:exported="false"`；它只能由 App 內部啟動，不可成為外部入口。
5. TWA Launcher 在 Digital Asset Links 驗證成功、頁面完成導覽後才建立 `postMessage` channel。`assetlinks.json` 必須保留 `delegate_permission/common.use_as_origin`。
6. Launcher 只接受以下 JSON，且來源必須是 `https://searchbefore.tw`：

   ```json
   {
     "type": "PQC_OCR_SCAN_REQUEST",
     "protocolVersion": 1,
     "requestId": "ocr-唯一識別碼"
   }
   ```

7. 驗證 `type`、`protocolVersion`、`requestId` 後，以 Activity Result API 啟動 `OcrContract.createScanIntent(context, requestId)`。
8. 掃描成功後，以 `OcrContract.resultJsonFrom(resultIntent)` 讀出 JSON，再透過同一個已驗證的 channel 回傳；不得額外加入 Bitmap、Base64、檔案路徑或 URI。
9. 取消、錯誤或 Activity 被系統回收時，清除尚未完成的 `requestId`，不要重送上一次結果。
10. 使用正式簽章建立內部測試 AAB，先在實體 Android 手機測試，再提交 Google Play。簽章檔與密碼不得加入 Git。
11. 正式 App 可依 `web-support-config.js` 的遠端開關顯示純自願支持；贊助不得換取任何內容、功能或權益。未來 App 內數位付費仍須另以 Google Play Billing 實作，詳細界線見 `docs/帳號與付款設定.md`。

## 實機驗收

- 從正式 App 按「開啟 Android 表單掃描」能開啟相機掃描器。
- 取消掃描會回到原頁，不建立草稿。
- 模糊、反光、裁切不全會顯示重拍或警告。
- 成功辨識後回到噴前查草稿確認頁，不會停在獨立 OCR 畫面。
- 飛航模式下仍可使用中文辨識。
- App 儲存空間內沒有留下原始照片；雲端備份與網站 localStorage 也沒有照片。
- 修改回傳 `requestId`、協定版本、訊息類型或加入圖片欄位時，網站會拒絕資料。
- 用藥名稱無法唯一對回登記資料時，不能直接建立用藥紀錄。
- `googlePlayVoluntarySupport: true` 時，Google Play App 的個人頁與公告可開啟綠界純自願支持頁；設為 `false` 並部署後，入口、連結與視窗須在使用者下次連線重新載入設定時停用。

## 目前唯一缺口

目前留存的 Google Play 套件只有已編譯的 APK/AAB 與簽章相關檔案，沒有正式 TWA Android 原始碼。因此本分支能完成共用 OCR 模組、訊息契約、網頁端防護與測試，但不能在沒有原始碼的情況下重新產生正式 AAB。取得或重新產生正式 Android 原始碼後，再完成第 4～8 步即可。
