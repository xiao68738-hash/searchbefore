# mrl-data — 農藥殘留容許量（MRL）資料管線

**此資料夾目前完全不影響 App。** 尚未接入 `index.html`、不在 Service Worker 快取，也由 `.firebaseignore` 排除。屬 MRL 對照功能的**階段 0**。

完整設計與安全原則見 `docs/MRL對照實施手冊.md`。

## 檔案

| 檔案 | 用途 |
|---|---|
| `fetch-mrl.mjs` | 下載 MRL 快照 |
| `fetch-reference-data.mjs` | 下載農藥許可證、作物分類與免訂容許量快照 |
| `lib.mjs` | 名稱正規化、混合劑拆分及稽核共用函式 |
| `*-<時間>.json` | 可保留及比較的資料快照 |
| `*-latest.json` | 各資料集的最新快照 |
| `build-review-list.mjs` | 產出完整人工確認清單 |
| `待人工確認.md/.csv/.json` | 人工校對用，接入 App 前必須處理 |

## 使用

```text
node mrl-data/fetch-mrl.mjs
node mrl-data/fetch-reference-data.mjs
node mrl-data/build-review-list.mjs
```

下載腳本會逐筆驗證必要欄位、檢查最低筆數，並採逾時、重試及原子寫入，避免不完整資料覆蓋最新快照。

## 官方資料來源

- dataset 8944「農藥殘留容許量標準」
- dataset 7293「農藥資料查詢」
- dataset 8940「農作物類農產品之分類表」
- dataset 8943「得免訂定容許量之農藥一覽表」

## 重要原則

1. MRL 與農藥登記資料分開維護、分開標示快照時間。
2. App 中文農藥名稱必須先經官方許可證資料轉成一種或多種英文有效成分。
3. 中文缺字萬用比對只可作人工候選提示。
4. 作物需依序檢查特定條目、官方分類、通用其他類別及免訂容許量。
5. 帶星號的容許量保留原字串，不做一般數值比較。
6. 名稱查無、分類不明或任何一層對照失敗時，只能標示「無法確認」，不得推論安全、違規或不得檢出。
