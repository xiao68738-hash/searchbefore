# Cloudflare 安全標頭設定

最後更新：2026-08-04

## 為什麼還要在 Cloudflare 設定

`firebase.json` 已保存同一套安全標頭，但正式網站 `searchbefore.tw` 目前是 Cloudflare 代理 GitHub Pages，Firebase Hosting 的設定不會自動生效。正式站必須在 Cloudflare 新增「修改回應標頭」規則。

## 設定位置

Cloudflare 控制台 → `searchbefore.tw` → 規則（Rules）→ Transform Rules → 修改回應標頭（Modify Response Header）→ 建立規則。

規則套用條件選擇整個網域，依序設定：

| 標頭 | 值 |
| --- | --- |
| `Strict-Transport-Security` | `max-age=31536000` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` |
| `Content-Security-Policy-Report-Only` | 複製 `firebase.json` 內同名標頭的完整值 |

`Content-Security-Policy-Report-Only` 只記錄違規、不攔截功能。先觀察 Google 登入、雲端備份與贊助連結至少一週；確認瀏覽器主控台沒有必要資源遭攔截後，再另開 PR 評估改成正式的 `Content-Security-Policy`。

PaddleOCR 圖片辨識測試會在使用者主動開啟功能後，下載瀏覽器執行檔與辨識模型。因此 `connect-src` 還必須包含：

- `https://cdn.jsdelivr.net`
- `https://paddle-model-ecology.bj.bcebos.com`

請直接以目前 `firebase.json` 的完整值為準，避免日後正式啟用 CSP 時阻擋模型下載。照片只在使用者裝置內交給 PaddleOCR 處理，不會上傳到這兩個網域。

## 驗證

發布後在專案目錄執行：

```powershell
npm run security:headers
```

所有必要標頭都顯示 `✓` 才算完成。這項設定不應由網站 JavaScript 模擬，必須由伺服器或 Cloudflare 回應。
