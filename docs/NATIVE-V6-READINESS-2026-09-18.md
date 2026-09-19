# 原生 v6 內部候選驗收

## 授權界線

使用者要求持續完成可上架原生版，已授權內部測試及本人帳號測試。此次不發布 Alpha／正式群組、不新增測試者、不變更計費與 Firestore 權限。

## 已完成

- Web #147 同步／底部導引、#149 原生備份欄位相容皆合併部署成功；公開網站程式與快取版本已核對。
- v5 真實 Play 簽章登入、既有雲端下載、登出重登及程序重開已驗證。
- 9/18 新增 TEST_ONLY 設備測試由 Play v5 上傳，同手機的獨立預覽套件成功下載；重複同步不重複，2 田區／1 用藥／5 農務，原資料不刪除。接收端不是全新空白装置。
- 既有手機 JSON 副本經編譯後原生與網站解析器往返一致；合成測試補用量、單位、備註、登記編號與收穫型態。私人副本無配方，不聲稱真實配方已全驗。
- 新介面 55 JVM、Android16 11 UI、Lint 無問題；Android11 手機首頁及同步操作可用。預覽版更新保留資料，鍵盤恢復注音，預覽同步恢復關閉。Play 正式套件仍 v5。
- 原生 #148 合併最新 main 後 Node 全套通過；提交 1306226 的 GitHub Review／Native Android preview checks 均成功。

## Play Console 9/18 凌晨唯讀查核

- 內部 v5 全面推出；Alpha 仍 v4／1.0.3.0。版本列表最高 5，準備 v6／1.1.1-internal。
- 正式發布前報告總覽沒有可讀測試結果，只顯示上傳套件以產生報告的說明；狀態為「未取得」，不能說零問題。
- Android vitals 當機／ANR 無相關資料；不能當成零當機率。
- 發布頁的淘汰 edge-to-edge API 提醒對應 v4／1.0.3.0，不據此推定原生 v6 有相同問題或已解除。
- 既有 APP 已免費提供，定價頁明確禁止改付費下載。商家帳戶尚待設定；沒有變更收費或建立 Billing。日後可另規劃免費下載＋應用程式內付費，或另建付費套件。

## 仍需保留的發布閘門

### 本輪建置與內部發布

v6／1.1.1-internal AAB 已完成（4m21s）；release 55 JVM 全通過、Lint `No issues found.`。300 筆 payload 簽章、既有 upload 憑證、4 個 64-bit library 的 16KB LOAD／RELRO 靜態驗證及 bundletool validate 通過；manifest versionCode=6。

檔案：`D:/SearchBefore/releases/native-internal-v6-20260918/searchbefore-native-v6-internal.aab`，14,150,416 bytes，SHA256 `1a9cda7e8c95063d47569a17fbeceacf3add5ba0372c91df083db6ca723f90c1`。

前次工具審查容量阻擋已解除。9/18 00:34，Console 確認 v6「提供給內部測試人員」，版本名稱為「1.1.1-internal (6) 原生介面與備份驗收」。沒有操作 Alpha／正式版或測試者清單。支援裝置數不變；缺去模糊化檔與原生偵錯符號兩項非阻擋警告仍存在。

v6 提交 c9099a33c93936263e0e2e572ac593ca73a94f74 已推 #148，Review checks 與 Native Android build/test/lint 均成功。#148 維持草稿，未合併原生正式版。

1. 已完成 v6 本機驗證、內部發布及真實 Play 派送。手機 installer=com.android.vending、versionCode=6；firstInstallTime 保持 9/17 07:45:22，lastUpdateTime=9/18 00:36:12。未卸載或清除資料。
2. 已驗證登入／同步同意保留、完整 JSON data 升級前後一致（2 田區／1 用藥／5 農務／0 配方）。v6 手動同步於 16:39:01.334Z 成功，force-stop 重開後登入與設定保留；再次匯出並 deepEqual 比對通過，僅 JSON 物件鍵順序不同。未把登入保留當成重新選帳號驗收。完整證據見 NATIVE-PLAY-V6-2026-09-18.md。
3. 全新空白裝置完整還原、真實配方／偏好及完整 JSON UI 匯入；不得清除使用者手機資料來偽造空白環境。
4. 全頁無障礙、離線／跨帳號／通知完整候選回歸；長期可靠性需要使用資料，不能用單輪自動化保證。
5. 正式發布前更新商店原生截圖／說明、資料安全與隱私政策一致性；原生版仍鎖定正式發布。

本文件與本輪品牌證據互相補充，不取代 Google 實際審查結果。
