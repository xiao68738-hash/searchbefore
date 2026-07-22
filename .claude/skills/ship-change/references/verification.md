# 瀏覽器驗證探針

`node tests/run-all.js` 是語法與邏輯測試,但**看不出**版面跳動、水平溢出、狀態切換、載入骨架、圖示渲染這類「要實際畫出來才知道」的問題。改到 UI 時,用無頭 Chrome 探針補這一塊。

## 手法

不修改 `index.html`,而是複製一份、注入診斷 `<script>`、用無頭 Chrome `--dump-dom` 或 `--screenshot` 取回結果。放在 scratchpad,不進 repo。

Chrome 路徑:`C:/Program Files/Google/Chrome/Application/chrome.exe`

## 兩種探針

### A. 量測型(--dump-dom):抓數字,不會說謊

用於檢查溢出、元素尺寸、狀態切換是否生效。把量測結果寫進一個 `<pre id="__p">`,再從 dump 出來的 DOM 用 regex 撈。

關鍵:**先量測再判斷**。曾經憑截圖以為進站頁溢出,一量才發現是截圖視窗尺寸沒套用成功,實際沒溢出 —— 差點去修一個不存在的問題。

範例檢查項:
- `document.documentElement.scrollWidth > window.innerWidth` → 水平溢出
- 元素 `getBoundingClientRect()` 的寬高位置
- 骨架與最終按鈕是否同高(避免載入完成跳動)
- `window.__errors`(監聽 error 事件)→ 有無未捕捉的執行期錯誤

### B. 截圖型(--screenshot):給人看

用於把改動前後拿給使用者比較。手機尺寸用 `--window-size=540,960 --force-device-scale-factor=2`(產出 1080×1920,符合 Play 截圖規格)。

模擬特定狀態的技巧:
- 停在「載入中」:把 `<script src="./account.js">` 從複製的 HTML 移除,維持初始 loading 文字/骨架
- 預設某畫面:注入 `go(...)`, `pickCrop(...)`, `pickPest(...)` 等既有函式
- 隱藏浮動元件:注入 CSS `#onboard,#offlinePill,#updateBar{display:none!important}`
- 需要 localStorage 的狀態:先 `localStorage.setItem(...)` 再 `location.reload()`,兩階段處理

## 已寫好、可直接沿用的探針

在 scratchpad(`C:/Users/xiao6/AppData/Local/Temp/claude/.../scratchpad/`)有這些,改個選擇器就能重用:

| 檔案 | 驗證什麼 |
|---|---|
| `verify-sync.mjs` | 雲端同步接線:store.set 攔截、時戳、刪除標記、備份說明切換 |
| `verify-cal.mjs` | 行事曆:單筆/批次 .ics、VALARM、按鈕筆數 |
| `verify-phi-range.mjs` | 採收期區間顯示 7-15、字級不撐破徽章 |
| `verify-mrl-note.mjs` | 殘留容許量說明位置與中性措辭 |
| `measure-entry.mjs` | 進站頁溢出量測 |
| `shot-entry2.mjs` | 進站頁截圖(載入中 + 完成) |

## 坑

- `node -e` 行內腳本裡的 `\\` 會被 shell 吃掉,導致 `f.replace(/\\/g,"/")` 語法錯誤。**探針一律寫成 `.mjs` 檔再執行**,不要用 `-e`。
- `execFileSync` 的 `maxBuffer` 要開大(`1<<28`),DOM dump 很長。
- Chrome 的 `--window-size` 有時不套用(拿到 504×748 之類的預設),量測前先印 `window.innerWidth` 確認。
