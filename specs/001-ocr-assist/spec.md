# Feature Specification: OCR 表單輸入輔助

**Status**: Reverse-engineered draft  
**Source of truth date**: 2026-08-04  
**Scope**: 瀏覽器 OCR、Android OCR 原型、雲端 PaddleOCR 與共用草稿流程

## User Scenarios & Testing

### User Story 1：從照片建立可檢查的草稿（Priority: P1）

使用者拍攝或選擇一張田間紀錄表單，系統辨識文字並提出欄位候選，但不替使用者完成最終確認。

**Independent Test**: 使用測試圖片辨識後，畫面出現日期、作物等候選；資料庫與正式紀錄筆數保持不變。

**Acceptance Scenarios**:

1. **Given** 使用者選擇合格圖片，**When** OCR 回傳有效 v1 結果，**Then** 系統建立 `confirmed: false` 草稿。
2. **Given** 圖片品質不足，**When** 品質檢查失敗，**Then** 系統阻止辨識或要求重新拍攝。
3. **Given** OCR 結果無法找到欄位，**When** 顯示草稿，**Then** 使用者仍能手動修正，不會保存猜測值。

### User Story 2：安全辨識用藥紀錄（Priority: P1）

使用者辨識病蟲害防治／用藥表單時，系統必須把作物、防治對象與藥劑候選唯一對回站內正式登記資料。

**Independent Test**: 模糊、無對應或多重對應的藥劑候選皆不能直接帶入正式用藥表單。

**Acceptance Scenarios**:

1. **Given** 候選唯一對回登記資料，**When** 使用者逐欄確認，**Then** 可帶入既有紀錄表單。
2. **Given** 候選無對應或有多筆對應，**When** 使用者嘗試帶入，**Then** 系統要求回查詢頁重新選藥。
3. **Given** OCR 讀到稀釋倍數或安全採收期，**When** 建立用藥草稿，**Then** 該值只供比對，不覆蓋正式登記資料。

### User Story 3：低記憶體手機使用雲端辨識（Priority: P2）

已登入的使用者可在理解照片將上傳後，單次同意把照片送到噴前查控制的 OCR 後端，以避開瀏覽器模型 RAM 限制。

**Independent Test**: provider 設為雲端且 endpoint 有效時，未登入、未勾同意、非 HTTPS、超大圖片或錯誤 Origin 都被阻擋。

**Acceptance Scenarios**:

1. **Given** 使用者未登入，**When** 啟動雲端 OCR，**Then** 前端不送出圖片。
2. **Given** 使用者未勾選單次上傳同意，**When** 按下辨識，**Then** 前端不送出圖片。
3. **Given** 後端完成推論，**When** 回傳結果，**Then** 圖片不保存，結果仍走共同草稿流程。

## Edge Cases

- 圖片 MIME 宣稱與實際內容不符。
- 大尺寸壓縮圖造成解碼後像素爆增。
- EXIF 方向旋轉。
- 表單只有部分區域、四角不完整、反光或嚴重模糊。
- OCR 文字包含 Base64、data URL、HTML 或超長內容。
- 民國年與西元年混用；同頁存在多個日期。
- 同一藥名對到不同劑型、含量或許可證。
- Cloud Run 冷啟動、推論逾時、使用者重複點擊。
- Firebase token 過期、撤銷或屬於其他專案。
- 多個 Cloud Run 執行個體導致記憶體限流不同步。

## Requirements

### Functional Requirements

- **FR-001** 系統 MUST 支援拍照與選擇 JPG／PNG／WebP 檔案兩種明確入口。
- **FR-002** 系統 MUST 在辨識前顯示照片品質確認。
- **FR-003** 所有 provider MUST 輸出 `PQC_OCR_SCAN_RESULT` protocol v1。
- **FR-004** 系統 MUST 驗證協定版本、來源、請求配對與內容上限。
- **FR-004a** 雲端請求 MUST 由前端產生 requestId，後端驗證後原樣回傳，前端 MUST 拒絕不屬於本次請求的結果。
- **FR-005** 系統 MUST 將 OCR 結果建立為未確認草稿。
- **FR-006** 使用者 MUST 逐欄確認後才能帶入既有表單。
- **FR-007** 用藥草稿 MUST 唯一對回站內正式登記資料，否則阻擋帶入。
- **FR-008** OCR 候選 MUST NOT 覆蓋主管機關資料中的稀釋倍數與安全採收期。
- **FR-009** 雲端模式 MUST 要求有效 Firebase ID token 與單次上傳同意。
- **FR-010** 雲端後端 MUST 限制來源、格式、bytes、像素、頻率、逾時與輸出大小。
- **FR-011** 雲端後端 MUST NOT 主動保存原圖、OCR 文字或 Authorization token。
- **FR-012** 正式 provider 切換 MUST 經由另一個 PR，且在部署與驗收完成前保持 `browser`。
- **FR-013** 功能在未正式驗收前 MUST 標示「測試中・開發中」。
- **FR-014** 系統 MUST 區分自動偵測四角與使用者人工確認，不得用 `cornersDetected` 表示人工勾選。

### Key Entities

- **OCR Request**：照片、provider、Firebase 身分與一次性操作狀態。
- **OCR Block**：文字、信心值及相對座標。
- **OCR Result Envelope**：協定版本、requestId、來源、品質與文字區塊。
- **OCR Draft**：紀錄類型與欄位候選集合，永遠預設未確認。
- **Registered Pesticide Match**：依作物、防治對象、有效成分／商品等條件唯一對回的正式資料。

## Success Criteria

- **SC-001** 任何 provider 的有效結果都能通過相同草稿測試。
- **SC-002** 錯誤協定、圖片內容、非信任來源與無效 token 的阻擋率為 100%。
- **SC-003** OCR 不會直接增加正式紀錄，測試覆蓋率為 100%。
- **SC-004** 用藥多重／無對應候選不會被帶入正式表單，阻擋率為 100%。
- **SC-005** 真實表單驗收時，除辨識率外，必須量測總處理時間與人工修正次數。
- **SC-006** 正式啟用前確認日誌及平台設定不保存圖片、token 或 OCR 文字。
- **SC-007** 雲端方案有單張成本、月預算上限、逾時率與回退策略的實測數據。
