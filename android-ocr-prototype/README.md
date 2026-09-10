# 噴前查 Android 表單 OCR 原型

這個資料夾是「方案 A」的裝置端驗證工程，先證明沒有固定表單模板時也能完成：

1. 用 ML Kit Document Scanner 拍攝並自動裁切一張紙本表單。
2. 在手機上以繁體中文模型辨識文字，並以 Latin 模型交叉檢查日期、用量等數字欄位。
3. 檢查解析度、模糊、局部反光、紙張覆蓋率、對比與墨跡比例。
4. 逐行保留文字與頁面位置，只產生品質指標 JSON，不保存或上傳照片。
5. 交由網站的 `form-ocr.js` 建立草稿，使用者逐欄確認後才帶入原紀錄表單。

## 目前完成範圍

- 可獨立安裝的掃描原型，套件為 `tw.searchbefore.ocrprototype`，不會覆蓋 Google Play 封測中的正式 App。
- OCR 已拆成 `ocr-feature` Android Library；獨立測試 App 與未來正式 TWA 共用同一份掃描、品質檢查及輸出程式。
- 掃描輸出欄位與網站 `PQC_FORM_OCR` 協定一致。
- 網頁端已有「紀錄 → 拍攝表單建立草稿」入口與人工確認流程。
- 已參考實際 TGAP 產銷履歷紀錄本，能提出紀錄類型、日期、田區代號、作物、防治對象、資材名稱、數量、稀釋倍數、安全採收期與操作人員候選。
- 病蟲害防治／用藥草稿必須能對回網站內的正式登記資料；無法對回或同時對到多筆時，不允許直接帶入。
- 網站拒絕含 Base64／影像欄位、過大資料或錯誤協定版本的訊息。
- Chinese 與 Latin 模型意見衝突時會降低數字候選信心，不允許自動選取；兩者一致也仍只建立待確認草稿。
- 月／日手寫值可保留為部分日期候選，但不會自行補年份；資材名稱的模糊字典候選也不會自動改字。

## 尚未接上正式 App 的原因

正式 TWA 原始碼已於 `../android-twa/` 重建，但首張繁中真實表單的兩個手寫欄位仍為0%完全符合，尚未達到整合門檻。OCR 原型繼續使用獨立套件測試，不加入目前送審或正式發布版本。

達到事先定義的真實樣本準確率並完成隱私驗收後，才評估把 `ocr-feature` 模組加入正式套件 `tw.searchbefore.app`，並在 TWA Launcher 接上已驗證的 postMessage channel。完整步驟見 [`../docs/Android OCR正式整合.md`](../docs/Android%20OCR正式整合.md)。合併前不可替換或上傳正式簽章檔。

## 本機建置

在 Android Studio 選擇「Open」，開啟本資料夾。工程使用：

- Android Gradle Plugin 8.1.2（配合目前電腦已有的建置快取）
- compileSdk / targetSdk 34
- minSdk 23
- ML Kit Document Scanner 16.0.0
- ML Kit Chinese Text Recognition 16.0.1（正式表單辨識；模型隨 App 安裝，首次辨識不必等下載）
- ML Kit Latin Text Recognition 16.0.1（NAF英文基準與日期／用量數字的跨模型比較）

文字辨識benchmark可在API 34模擬器執行；相機與ML Kit Document Scanner仍必須使用實體Android手機驗收，且掃描器要求裝置總記憶體至少1.7GB。部分模擬器映像即使含Google APIs，Google Play Services仍會回報Document Scanner不可用；App會顯示中文更新／改用實機指引。

## 隱私與安全底線

- 不要求相簿匯入，只允許當次拍攝。
- 不申請網路或儲存權限。
- 不將掃描影像編碼進網址、localStorage、雲端備份或 postMessage。
- 每次掃描都以 `requestId` 配對請求與結果，網頁拒絕不屬於本次操作的結果。
- 辨識結果永遠是未確認草稿；照片品質未通過時不能帶入紀錄。
- 正式整合後仍必須讓使用者確認紀錄類型、日期與作物；用藥紀錄另須確認藥劑／資材名稱。
- OCR 讀到的稀釋倍數與安全採收期只作比對線索；實際帶入值採網站內的正式登記資料，仍須核對產品標示。
