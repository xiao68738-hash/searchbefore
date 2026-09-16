# 同步修復、相關分類導引與原生預覽

整合紀錄：`agent/sync-native-related-navigation-20260916`。Web 修復已獨立推送 [PR #147](https://github.com/xiao68738-hash/searchbefore/pull/147)，尚未合併／部署；原生預覽使用另一個以 main 為基底的分支 `agent/native-preview-20260916`。兩份 PR 不互相包含程式改動。Web 候選 v0.3.10.0，TWA v4 原專案未改。下列第 1、2 節是 Web PR 的交付背景，不代表原生已完成雲端同步。

## 1. Web 雲端同步修復

- 移除以用戶端 `updatedAt > syncLastAt` 作為讀取及寫入過濾條件；K_LAST 僅顯示同步時間。
- 每輪 `getDocsFromServer` 完整核對三個既有集合，伺服器不可達時顯示錯誤，不以快取當上傳成功。
- 待上傳資料在 Firestore transaction 內重讀最新版，避免另一台在集合讀取後更新卻被舊快照覆蓋。
- 交易返回後與當下本機資料／刪除標記再合併，保留等待上傳期間的本機編輯。
- 修改與刪除時間戳會大於已知舊紀錄，避免重新啟動／校時後新編輯輸給舊值。
- 不改集合結構、Rules 或使用者雲端資料；相容現有資料。

取捨：每輪增加讀取量，但不重寫未變資料；既有 debounce 保留。後續可設計具伺服器提交游標的協定，再做成本優化，不能恢復有漏讀的舊過濾方式。不同裝置的真正同時編輯仍採原有 updatedAt／刪除優先規則，不宣稱已解決所有時鐘偏差下的語意衝突。

回歸：延遲上傳／刪除、舊本機待上傳、偏斜 checkpoint、交易期間遠端更新、伺服器失敗、相同資料不重寫、帳號取消與 SDK 重試。這是 Fake Firebase SDK 測試，真實兩裝置端到端還原仍待做。

## 2. 相關防治對象

移除原清單上方的「同作物相關分類用藥總覽」與展開藥名／筆數。原始防治對象與用藥資料不合併。

改成清單底部導引，例如：**也要看看蔥 × 夜蛾類用藥嗎？** 點擊進入該對象的獨立頁面，重新套用該頁原登記與篩選狀態。簡短保留「分開顯示、不代表藥劑可互用」說明。

已實際操作本機預覽：

- 蔥 × 甜菜夜蛾：1 筆，底部導引至夜蛾類／鱗翅目害蟲。
- 點夜蛾類：20 筆，不混入甜菜夜蛾的藥劑。
- 導引為清單最後子元素、正常 static 排版；不使用會套到固定底部工具列 CSS 的 nav 標籤。
- 已實測舊快取「立即更新」至 v0.3.10.0，未清除資料。
- 全庫 DATA SHA-256 仍為 `b986f7b0c0dce60738a6850601cee670104a6dd7264b605ef4d59fbe3196950e`。

## 3. 原生改寫進度

新增同專案 `android-native` Kotlin／Compose 模組，已可建置獨立 debug APK。最新續作共 14 項 JUnit 測試通過（核心 9、紀錄編輯 5）。新增資料全量對照測試，確認 17,333 筆與相關導引分離。沒有 WebView／Chrome 容器。

本輪續作：新增田區／種植批次、相同原登記作物的用藥歸屬、田區篩選；未指定紀錄不自動歸屬。新田區沿用網站 `name/crop/tag/plantDate` 格式，未填日期保持空白，拒絕非法／未來日期與跨作物歸屬，修改失敗不改原資料。備份中小數採收天數向上取整，不截短等待日數；未知值不當作零。Kotlin 使用 in-process 編譯，避免受限環境的 daemon 目錄權限錯誤。

**只是原生第一階段，完整 APP 移轉未完成。** 登入／同步、完整農務／田區／配方編輯、多格式匯出與實機驗收仍待進行。詳見 [原生 README](../android-native/README.md)。原生 release build 主動鎖定；未安裝、上架或修改正式簽署。

## 驗收指令

```powershell
rtk proxy node tests/run-all.js
rtk proxy node scripts/build-release.mjs
rtk proxy node scripts/check-release.mjs
rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android-native.ps1
```

截至本輪：42 個不同 Node 測試檔（runner 另重跑 2 次分類測試）、14 個原生測試；前輪 Web 成品 36 檔、6.53 MB。最新原生紀錄／田區編輯及待驗收步驟見 [紀錄編輯續作](NATIVE-RECORD-EDITING-2026-09-16.md)。最終命令輸出與原生 XML 報告才是執行證據，不把本文件當自動通過標記。既有 GitHub CI 只跑 Node 回歸；原生 Gradle 測試及 APK 是本機結果。無連接手機，不宣稱原生 UI 或真實雲端驗收通過。

下一步：Web PR 審查後再部署與真實還原驗收；原生以草稿 PR 持續移轉。保持兩份獨立交付，不為發布同步修復而更換成未完成的原生版。本輪不合併、不發布 Play。
