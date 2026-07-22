# 重新產生 .aab：一次修掉所有 Play Console 問題

更新日期：2026-07-22

Play Console 目前跳出四個問題，加上你想改的啟動畫面，**全部都在 Android 外殼（`.aab`）裡，可以一次重新產生就全部解決**。

---

## 這些問題各是什麼

| 問題 | 嚴重度 | 說明 |
|---|---|---|
| **目標 API 必須到 Android 16（級別 36）** | 🔴 有期限 | **2026-08-31 起**，target API 不到 36 就**無法再更新 App**。目前是 35 |
| 無邊框畫面（edge-to-edge） | 🟡 建議 | Android 15 起應繪製到螢幕邊緣 |
| 已淘汰的無邊框 API | 🟡 建議 | 用到 Android 15 淘汰的參數 |
| 大螢幕方向限制 | 🟡 建議 | Android 16 在平板／摺疊機上會忽略方向鎖定 |
| **啟動畫面（你想改的）** | — | 白底圖示貼在背景上不搭 |

**前三個 Play 警告，用最新版 PWABuilder 重新產生時多半會自動處理掉**——因為新版 wrapper 本來就針對新版 SDK。真正要你手動確認的是 target API 36 與啟動畫面。

---

## ⏰ 什麼時候做

**建議在封閉測試 14 天跑完、申請正式版之前，一次做完。**

理由：
- target API 36 的期限是 8/31，還有幾週，**不急著在測試期間動**
- 測試期間換 `.aab` 萬一出問題，你會分不清是外殼問題還是測試問題
- 14 天跑完後重產一次，把全部修正打包進去，再申請正式版 —— 最乾淨

（上傳新 `.aab` 到同一個封閉測試軌道，理論上不會重置 14 天的測試人員計時——計時看的是測試人員是否連續加入，不是版本。但保險起見，等測試跑完再動。）

---

## 前置：三樣東西要備妥

1. **原本的 `.keystore` 檔與密碼**（上次產生時備份的那把）
2. 網址：`https://searchbefore.tw`
3. 下次的 versionCode：**填 2**（上次用掉 1，只能往上加）

⚠️ **金鑰一定要用同一把。** 換了金鑰 Play Console 直接拒收更新，而且 `assetlinks.json` 的指紋會對不上，App 上方會冒出瀏覽器網址列。

---

## 步驟

### 1. 到 PWABuilder 重新產生

1. 打開 <https://www.pwabuilder.com>
2. 輸入 `https://searchbefore.tw`，按 Start
3. 到 **Package For Stores → Android → Generate Package**
4. 展開 **All Settings / Advanced options**，逐項確認：

| 設定 | 值 |
|---|---|
| Package ID | `tw.searchbefore.app`（**一個字都不能改**） |
| App name | 噴前查 SearchBefore |
| **Version code** | **2** |
| Version name | 1.0.1（或你想要的） |
| **Signing key** | 選 **Use existing** → 上傳你的 `.keystore`，填密碼與 alias |
| **Splash screen / Background color** | **設為白色 `#FFFFFF`** ← 這是修啟動畫面的關鍵 |
| Theme color | `#2E6B3F`（綠） |
| **Target SDK** | 若有欄位可設，填 **36**；沒有就看下方「若 API 還不是 36」 |

### 2. 啟動畫面：白色背景是重點

manifest 我已改成 `background_color: #FFFFFF`（PR 內），PWABuilder 會據此產生白色啟動背景。白底圖示融進白背景，就是乾淨的 logo 置中，不再是「白方塊貼在米色上」。

如果 PWABuilder 有獨立的 splash 顏色欄位，也設 `#FFFFFF`。

### 3. 螢幕方向：一個要你決定的取捨

Play 警告「大螢幕方向限制」是因為 manifest 目前鎖定 `orientation: portrait`。

| 選擇 | 結果 |
|---|---|
| **維持鎖定直向** | 手機／平板都只能直向。警告不消，但這是刻意的——農友田間單手操作 |
| **解除鎖定** | 平板／摺疊機可橫向，清掉警告。但 App 是為直向設計的，橫向會左右留大片空白 |

**我的建議：維持鎖定。** 這是給農友在田裡用的工具，直向才合理；那個警告是「建議」不是「必須」，不影響上架。若你之後想支援平板橫向，再說。

如果你決定解除鎖定，跟我說，我把 manifest 的 `orientation` 拿掉。

### 4. 若 PWABuilder 產出的 API 還不是 36

PWABuilder 有時落後於最新 SDK。下載的 zip 裡若 target 仍是 35，有兩條路：

- **等 PWABuilder 更新**（它們通常會跟上，8/31 前應該沒問題）
- **用 Bubblewrap CLI 自己調**：zip 裡的 `twa-manifest.json` 找 `targetSdkVersion`，改成 36 後 `bubblewrap build`。這需要 Node 與 Android 環境，較進階

先用 PWABuilder 產一次看 target 是多少，不到 36 再處理。

### 5. 上傳

1. Play Console → 封閉測試 → 建立新版本
2. 上傳新的 `.aab`（versionCode 2）
3. **一定要先按「儲存」再「檢查版本」**（上次卡住就是漏了儲存）
4. 推出

---

## 上傳後確認

- 手機重新安裝，看**啟動畫面**是否變成乾淨的白底 logo
- App 開啟後**上方沒有瀏覽器網址列**（有的話代表金鑰換錯了，assetlinks 指紋對不上）
- Play Console 的四個警告應陸續消失（edge-to-edge 那幾個可能要等 Google 重新掃描）

---

## 為什麼這些改動不影響網站

`.aab` 只是外殼，App 打開載入的仍是 `searchbefore.tw` 即時內容。所以：

- **這次重產 `.aab` 只影響「Android App 的外殼」**：啟動畫面、target API、方向
- 你的農藥資料、功能、進站頁改版等**網頁層更新照常走 GitHub，不受影響**

這也是為什麼四個 Play 問題可以攢到一起、等測試跑完再一次處理——它們不擋你平常的網頁更新。
