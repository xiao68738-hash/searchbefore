# Implementation Plan: OCR 表單輸入輔助

## Technical Context

- Frontend：單頁 PWA、原生 JavaScript、Service Worker。
- Current browser engine：PaddleOCR.js／ONNX Runtime Web／PP-OCRv6 tiny。
- Android prototype：Java、ML Kit Document Scanner、Chinese Text Recognition。
- Proposed cloud engine：Python 3.11、FastAPI、PaddleOCR 3.7、PP-OCRv6 small、Cloud Run CPU。
- Identity：Firebase Authentication ID token。
- Storage：OCR 流程不需要持久化照片；草稿只存在前端操作狀態，確認後才走既有紀錄儲存。
- Deployment：正式 PWA 目前由 GitHub Pages 經 Cloudflare；OCR 後端獨立部署。

## Constitution Check

1. **安全資訊不製造錯誤安全感**：OCR 只提供候選，不做法規判斷。
2. **未完善功能不冒充正式功能**：雲端 provider 預設關閉；測試入口明確標示。
3. **資料最小化**：不主動保存圖片或辨識文字，不傳 Cookie／referrer。
4. **人工確認不可省略**：所有結果先成為未確認草稿。
5. **用藥資料以正式來源為準**：OCR 不能覆寫登記資料。
6. **版本化契約**：跨 Web、Android、Cloud 的訊息用 protocol version 管理。

## Project Structure

```text
form-ocr.js                         # OCR 結果到欄位候選的純邏輯
form-ocr-ui.js                      # UI、provider、網路與人工確認
paddle-ocr-browser.js               # 瀏覽器推論封裝
service-config.js                   # provider 與 endpoint 公開設定
android-ocr-prototype/              # 尚未接入正式 App 的 Android 原型
cloud-ocr-service/                  # 尚未部署的 FastAPI/PaddleOCR 服務
tests/form-ocr*.test.js             # 草稿與前端協定測試
tests/cloud-ocr.test.js             # 雲端預設關閉及安全閘門
cloud-ocr-service/tests/            # 後端圖片、限流與標準化測試
docs/OCR系統規格與架構書.md         # 工程交接入口
specs/001-ocr-assist/               # 反推後的需求、計畫與任務
```

## Design Decisions

### D-001：共用結果協定，不共用辨識引擎

理由：裝置能力與隱私需求不同。固定輸出契約可替換引擎，避免後續欄位解析被 Paddle 或 ML Kit 綁死。

### D-002：雲端服務採獨立部署

理由：GitHub Pages 無法執行 Python 模型；OCR 需要獨立記憶體、CPU、配額與安全政策。前端只保存公開 endpoint。

### D-003：Firebase 登入是雲端 OCR 的最低身分門檻

理由：降低匿名濫用並可按 UID 限流。這不是完整的商用授權；正式版仍需 App Check、全域配額與預算防護。

### D-004：雲端結果仍走既有草稿解析

理由：讓安全驗證、候選欄位、唯一藥劑比對與人工確認維持單一路徑。

### D-005：不在此變更切換正式 provider

理由：程式骨架通過測試不等於已完成模型、資安、成本與真實資料驗收。

## Deployment Stages

1. **Code review**：審查協定、Paddle 輸出相容性、限流與逾時行為。
2. **Isolated build**：固定容器 digest、模型來源與依賴版本，完成漏洞掃描。
3. **Private test**：測試 Cloud Run，不切正式 provider；使用去識別化圖片。
4. **Measured pilot**：30～50 張真實表單，記錄準確率、時間、成本與人工修正。
5. **Security gate**：確認 Logging、IAM、App Check、配額、預算及刪除政策。
6. **Release PR**：另開 PR 填 endpoint 並改 provider；保留回退至 browser 的開關。

## Observability Without Sensitive Content

允許記錄：request ID、HTTP 狀態、耗時、圖片 byte／尺寸級距、block 數、模型版本、匿名化 UID hash（若法律與隱私評估允許）。

禁止記錄：原圖、OCR 全文、姓名／電話／地號、Authorization header、Firebase token、完整 UID、使用者填寫的正式紀錄。

## Rollback

- 將 `service-config.js` 的 `ocr.provider` 改回 `browser` 並清空 endpoint。
- 停用 Cloud Run 新流量或把 max instances 設為 0。
- 版本回退不刪除既有田間資料，因 OCR 本身不保存正式紀錄。
