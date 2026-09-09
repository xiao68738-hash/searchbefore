# Android v3 與登入／備份續作紀錄

日期：2026-09-08（Asia/Taipei）

## 結論與發布界線

D 槽已恢復存取；`agent/android-release-3` 工作分支及 9/7 簽章候選包保留。本日沒有部署網站、更新 Firestore 規則、上傳 Play、送出審核或推送 PR。

本次本機修正了兩類可重現的同步問題，31 個測試檔及網站成品檢查通過。API 36 已實際安裝候選 APK、載入正式網站並操作訪客入口及 Google 登入入口；沒有完成真實帳號登入與跨裝置還原，不能把這次結果當作完整上線放行。

前一日的原生程式變更、AAB/APK 雜湊與簽章證據見 [9/7 候選版紀錄](RELEASE-3-READINESS-2026-09-07.md)。本日同步修正屬網站程式；只上傳 AAB 不會部署它們。

## 同步修正及重現證據

### 1. 同步尚未完成時，切換帳號／登出／撤回同步同意

原程式在等待雲端回應後，仍可能把舊帳號資料寫進本機，並在下一次寫入使用已切換的新帳號路徑。測試先以原始程式重現：切換到 B 後，A 的延遲回應仍新增 `remote-a` 到本機。

`cloud-sync.js` 現在固定每次同步的 UID 並使用工作階段版本，於讀寫前後核對帳號與同意狀態；A→B→A 及關閉→重開也會使舊工作失效。鎖定範圍提前至載入 Firebase SDK 之前，避免同時啟動兩次同步。SDK 載入失敗會明確顯示錯誤並允許重試。

切換本機資料歸屬時，新增明確合併確認；確認後只重設舊帳號的同步游標與刪除標記，不刪除原帳號雲端紀錄，也不清掉本機田間資料。取消確認則不改歸屬。

限制：已送出的請求無法由前端撤回；測試保證該請求仍指向原 UID，且切換後不再送下一筆。這不是對伺服器權限規則的替代。

### 2. 上傳等待中又編輯，後續修改被誤判為已備份

原程式在整輪結束時才記錄同步時間，可能把等待期間產生、尚未上傳的編輯列為已同步。先新增測試確認會失敗，再把成功游標改為該輪開始時間；下一輪必須補送等待期間的編輯。

## 自動測試

新增 `tests/cloud-sync-lifecycle.test.js`，直接載入原始瀏覽器模組，使用替代 Firebase 模組，沒有真實帳號、網路或正式資料寫入。

12 個情境：讀取中換帳號、登出、停用同步、A→B→A、停用後重啟；寫入中換帳號；SDK 初始化時重複同步；SDK 初始化時登出；SDK 失敗後重試；拒絕帳號合併；同意合併後重設舊游標及刪除標記並保留 B 的舊資料；上傳等待中編輯後下輪補傳。

| 檢查 | 結果及範圍 |
|---|---|
| `node tests/run-all.js` | 31 個測試檔通過；包含 12 個新增生命週期情境，不是真實 Firebase 端對端 |
| `node scripts/build-release.mjs` | 建置成功 |
| `node scripts/check-release.mjs` | 通過：26 個檔案，6.46 MB |
| Service Worker | 快取版本更新為 `v0.3.9.9-sync-session-guard-2026-09-08`，部署後才會影響使用者 |
| 原生候選包 | 仍為 9/7 保存的 versionCode 3 / 1.0.2.0，沒有重新簽章或替換 |

## Android 16 實測

- 安裝官方 `system-images;android-36;google_apis;x86_64` revision 7；建立獨立 `SearchBefore_API36_Release3` AVD，沒有個人 Google 帳號。
- 裝置 `emulator-5556`：1080×2340、440 dpi、2 GB RAM、2 cores、SwiftShader。WHPX 日誌顯示可用。
- 首次開機耗時約 652 秒；System UI、Google Play services 等多個系統程序發生 ANR，另有 Bluetooth 原生當機。這是實際觀察到的環境異常，不能省略或歸算為噴前查已完全穩定。
- 安裝 9/7 已驗證 APK 成功。02:05:57 UTC 開始首次啟動，`am start -W` 回報 COLD / Status ok，接到 Chrome FirstRunActivity。
- 完成 Chrome 不加帳號的初始設定後，確實載入 `searchbefore.tw`。登入頁透明 LOGO、兩種入口、底部說明可見；選擇訪客後公告與查詢首頁載入，底部六項導航可見且個人頁可點選。只驗證這個螢幕設定，未涵蓋所有手機或字級。
- 個人頁顯示 Google 雲端備份選用說明，登入不等於自動上傳；按登入後成功開啟 `accounts.google.com` 的「Sign in … 噴前查 SearchBefore」頁面，未輸入任何帳號、密碼或驗證碼。
- 02:05:57 UTC 之後至登入入口操作完成，crash buffer 沒有新紀錄；不能據此排除所有 ANR 或長時間使用問題。
- **冷啟動重測未通過穩定性門檻**：02:17:56 UTC 在此獨立模擬器同時 force-stop App 與 Chrome 後再啟動，雖回報 COLD / Status ok 且顯示登入頁，02:18:12 UTC 出現「Chrome isn't responding」。`dumpsys activity lastanr` 指向 CustomTabActivity 的 FocusEvent 等待 5001 ms 逾時。這是承載 App 的瀏覽器無回應，不能因 App 程序沒有 crash 就忽略；尚未證明是模擬器資源、Chrome 或網站負載哪一項造成，也未驗證冷啟動後訪客狀態保留。
- 模擬器載入的是正式網站現況，不是尚未部署的本機同步修正；兩者測試證據不可混為一談。

### 本機證據位置

檔案在 `D:\SearchBefore\private\`，不納入 Git：

- `release3-api36-emulator.log`：開機與硬體加速資訊。
- `release3-api36-system-events.log`：系統 ANR／當機事件。
- `release3-api36-launch-crash.log`：指定啟動時間後的 crash buffer。
- `release3-api36.png`：首次 System UI 無回應畫面。
- `release3-api36-loaded.png`：噴前查登入頁。
- `release3-api36-home.png`：訪客查詢首頁及底部導航。
- `release3-api36-account.png`：個人頁與雲端備份說明。
- `release3-api36-login.png`：官方 Google 登入頁，無私人帳號資料。
- `release3-api36-cold.png`／`release3-api36-lastanr.log`：冷啟動重測的 Chrome 無回應畫面與焦點事件逾時證據。
- `release3-tests-2026-09-08.log`：本日最後一次全套測試成功輸出。

## 仍需完成，不能宣稱已通過

1. 在可存取的真實測試帳號上驗證 Google 登入 → 明確開啟同步 → 新增有標記的測試資料 → 確認雲端寫入 → 另一裝置登入與還原 → 核對修改與刪除。避免先清除唯一副本。
2. 多裝置時鐘偏差、同筆資料同時更新、Firestore 部署規則及錯誤復原仍須驗證。現行增量游標依客戶端 `updatedAt`，本次修正沒有解決所有跨裝置衝突問題，不可宣稱雲端備份完全無誤。
3. 從 Play 測試版 v2 原地更新 v3，確認本機資料保留；本次是獨立模擬器新安裝，不能取代升級回歸。
4. 優先在較穩定模擬器或實機重測 Chrome 冷啟動焦點事件逾時，確認是否可重現及原因，再補鍵盤、旋轉、放大字級、長時間操作與系統列遮擋回歸。本次結果尚不足以發布 v3。
5. 網站修正需經審閱及另行部署；v3 上傳／推出前需確認發布範圍。本次沒有新增 Google/Firebase 權限、關閉安全限制或改寫正式紀錄。
6. 桌面瀏覽器操作工具尚不可用，Google Play Console／Threads 本日未重新查證。不能把 9/7 的測試天數或本機 v3 冒充今天的 Console 結果。

## 後續接手

工作目錄 `D:\SearchBefore\worktrees\android-release-3`；保留全部既有變更。優先補真實登入／跨裝置還原及 v2→v3 保留資料測試，再決定候選版發布。每日 09:00 既有監管排程保持 ACTIVE，已更新 D 槽恢復與仍未能查閱桌面瀏覽器的紀錄。
