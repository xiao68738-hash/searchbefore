# 繁體中文手寫表單資料來源與人工核對方案

更新日期：2026-09-09（Asia/Taipei）

## 結論

公開資料中，尚未找到同時具備「台灣繁體中文、真實手寫、已填寫表格、逐 cell 標註、可商用」的完整資料集。現階段應把公開資料當作補強資料，真正的 NAF 表格準確率仍以取得同意的實拍表單與人工 ground truth 為準。

本次不下載或再散布來源圖片；只記錄來源、授權與適用範圍。未確認授權前，不把任何第三方圖片放入產品、訓練集或部署環境。

## 公開來源檢核

| 來源 | 內容與規模 | 授權／取得方式 | 對本專案的用途 | 結論 |
|---|---|---|---|---|
| [AI-FREE Traditional Chinese Handwriting Dataset](https://github.com/AI-FREE-Team/Traditional-Chinese-Handwriting-Dataset) | 13,065 個繁體中文字、平均每字約 50 樣本；主要是字元影像，不是填寫表格 | README 文字寫 CC BY-NC-SA 4.0（GitHub 頁首標示與此不同）；須署名、非商業、相同方式分享 | 補強繁體字形、筆畫與字元分類 | 授權先以 README／作者書面確認為準；不能直接當 NAF 表格 benchmark |
| [SCUT-HCCDoc](https://github.com/HCIILAB/SCUT-HCCDoc_Dataset_Release) | 12,253 張相機拍攝文件、116,629 行；含 HCCDoc-WT 繁體中文子集，也有格式化背景子集 | 僅限非商業研究；訓練資料需申請、簽署文件；公司使用須另洽授權 | 相機透視、紙張背景、手寫行級辨識與版面泛化 | 需先取得許可；可作外部泛化測試，不保證是台灣 NAF 表格 |
| [Nexdata 5,000 Taiwan Traditional Chinese handwriting](https://github.com/Nexdata-AI/5000-Images-Handwriting-OCR-Data-of-Traditional-Chinese-Characters-Taiwan-China) | 5,000 張；A4／方格／橫線紙；JSON 含行級四邊形與轉寫 | README 標示 Commercial License；實際使用須依 Nexdata 商業授權 | 行級偵測、手機拍攝與繁體字辨識 | 適合商業評估的候選，但需付費／取得書面授權；不是 cell-level 表格集 |
| [tw-OCR（Hugging Face）](https://huggingface.co/datasets/lianghsun/tw-OCR) | 台灣繁中日常文件（含表單等）的影像／文字 | 頁首顯示 CC BY-NC-SA 4.0，但資料卡內文另寫 CC BY-SA 4.0；且明確寫「不適用於手寫」及「不適用於版面理解」 | 印刷繁中、噪聲與台灣字形的輔助測試 | 授權先向作者確認；不納入手寫或表格主 benchmark，只能作印刷文字 sanity check |
| [TabRecSet](https://github.com/MaxKinny/TabRecSet) | 16,530 張中文影像、17,762 張表格；含 cell 空間／邏輯與文字標註 | CC BY-SA 4.0 | 表格結構、欄列對齊與 cell-level 評估前置訓練 | 不是手寫專集；可補強表格結構，不能代表手寫辨識率 |
| [DCOH-120K](https://github.com/SCUT-DLVCLab/DCOH-120K) | 83,142 行中文線上手寫資料；逐筆 JSON | 需研究用途申請與審核 | 書寫風格與序列模型研究 | 非紙本表格；列為後備研究資料，不直接混入 NAF 測試集 |

### 授權與資料治理判斷

1. AI-FREE 與 tw-OCR 均不應直接用於目前的商業產品訓練；兩者頁面都存在授權欄位／文字不一致，必須先向作者取得書面確認。即使是公開 GitHub／Hugging Face，也要遵守資料卡與原始來源條款。
2. SCUT-HCCDoc、DCOH-120K 的取得有申請條件；在沒有核准前不下載、不提交到 repository。
3. Nexdata 雖標示商業授權，但需保留購買／授權證明與版本；授權文件未確認前不納入產品建置。
4. 使用者提供的 NAF 實拍照片應單獨放在 `private/`，去除 EXIF 與個資，並以表單編號、欄位類型、人工轉寫、審核者與日期建立 audit trail。

## 可人工對照的流程

專案新增本機工具：`dev/ocr-manual-review.html`。它不會連網、不會上傳圖片，支援：

- 選取一張或多張表單照片並在瀏覽器內預覽。
- 每個欄位填入「OCR 候選」、「人工正確答案」及狀態（正確／需修正／不確定）。
- 顯示欄位級 exact match、字元 CER（若有候選與答案），並保留備註。
- 以 JSON 匯出人工核對結果；匯出的檔案仍由使用者自行保管，不會自動加入 git。
- 內建目前已確認的示例：表 13、日期 `7/14`、資材名稱 `蘇力菌`。照片仍須由使用者在本機選取。

開啟方式：

1. 在專案根目錄啟動任何本機靜態伺服器（例如 `python -m http.server`）。
2. 開啟 `/dev/ocr-manual-review.html`。
3. 選取表單照片；逐欄核對後按「匯出核對 JSON」。

若直接以 `file://` 開啟，部分瀏覽器會限制檔案預覽；改用本機伺服器即可。工具設計為 local-only，沒有 fetch、分析 SDK 或第三方 CDN。

## NAF 30–50 份 benchmark 建議

每張表單至少標註：`表單 ID`、`頁面／區塊`、`欄位 key`、`cell polygon`、`人工轉寫`、`是否空白`、`書寫型態`（印刷／手寫／混合）、`可見度`（清楚／反光／歪斜／遮擋）。

評分分開報告，不用單一平均數掩蓋問題：

- cell detection：precision、recall、F1、IoU、欄列索引正確率。
- 欄位轉寫：exact match、CER、WER；空白欄位另計 false positive。
- 重要欄位：日期、資材名稱、商品名、購買量、使用量、剩餘量各自列出。
- 場景切片：正拍／歪拍、低光／反光、手寫／印刷、單欄／多欄。

目前的 `form13` 只能作為 smoke test，不能宣稱模型達到 50% 準確率；至少完成 30 份、並保留未參與調參的 holdout 後才可對外報告。

## 下一步（可在本機完成）

1. 用 `dev/ocr-manual-review.html` 將現有 NAF 實拍照逐欄核對，先完成 10 份 pilot。
2. 依欄位與拍攝條件補齊 30–50 份 cell-level ground truth。
3. 對同一批 holdout 分別跑目前本地 OCR、Windows OCR，以及在取得憑證後的 ML Kit／Document AI／Azure；未取得授權或憑證的外部資料不會假造結果。
4. 只有在授權、去識別化與人工覆核完成後，才考慮把資料或模型變更放入 PR。

## 本機研究 runner

`scripts/run-traditional-zh-benchmark.py` 已加入，但預設 `local_files_only`，不會因測試而偷偷下載約 1.24 GB 的模型。只有在確認模型授權並明確加入 `--allow-download` 後才會下載；輸入與輸出仍限制在 `D:\SearchBefore\private`，結果固定標示 `requiresHumanReview=true` 與 `productionEligible=false`。

## 研究模型補充

[ZihCiLin Traditional Chinese TrOCR baseline](https://huggingface.co/ZihCiLin/trocr-traditional-chinese-baseline) 是可供本機研究的繁體中文模型：模型卡說明以約 410 萬組合成／歷史文字影像訓練，涵蓋 13,172 個 CNS11643 字元；同一模型卡也指出最佳表現是乾淨、排版印刷文字，不能視為已解決台灣手寫 NAF 表格。模型權利與商業使用條件仍需由使用者確認；本次只查核 metadata，未下載權重、未接入產品。
