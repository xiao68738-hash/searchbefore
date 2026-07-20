# .well-known — 網域驗證檔案

## 這個資料夾放什麼

`assetlinks.json` — Android App 與本網域的關聯證明（Digital Asset Links）。

上架 Google Play 的 TWA（Trusted Web Activity）版本時，Chrome 會讀取
`https://searchbefore.tw/.well-known/assetlinks.json`，
確認本網域承認該 App。

- **驗證成功** → App 全螢幕顯示，如原生 App。
- **驗證失敗或檔案不存在** → App 上方會出現 Chrome 網址列。

## ⚠️ 為什麼根目錄要有 `.nojekyll`

GitHub Pages 預設以 Jekyll 建置，而 **Jekyll 會忽略所有 `.` 開頭的資料夾**，
包含本資料夾。若少了根目錄的 `.nojekyll`，這裡的檔案部署後會是 404，
且不會有任何錯誤訊息，非常難以察覺。

**請勿刪除根目錄的 `.nojekyll`。**

## 檔案格式

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "tw.searchbefore.app",
    "sha256_cert_fingerprints": ["AA:BB:CC:...（64 組十六進位，冒號分隔）"]
  }
}]
```

- `package_name`：與 Play Console 上的套件名稱完全一致，**發布後不可更改**。
- `sha256_cert_fingerprints`：簽章金鑰的 SHA-256 指紋，由 PWABuilder 或
  Bubblewrap 產生金鑰時提供。

> 若日後改用 Google Play App Signing，Google 會**重新簽署**你的 App，
> 屆時必須改用 Play Console 提供的指紋
> （發布管理 → 應用程式完整性 → 應用程式簽署金鑰憑證），
> 否則驗證會失敗。

## 驗證方式

部署後執行：

```text
curl -s https://searchbefore.tw/.well-known/assetlinks.json
```

應回傳 JSON 而非 404。也可用 Google 的檢查工具：

```text
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://searchbefore.tw&relation=delegate_permission/common.handle_all_urls
```

## 注意

此資料夾**不屬於** App 功能，內容為公開資訊（指紋本身不是密鑰，可公開）。
真正的簽章金鑰檔（`.keystore`）**絕不可**放入本專案，
已由 `.gitignore` 排除。
