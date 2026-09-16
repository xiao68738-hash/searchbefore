# Play 原生內部版：手機驗收前檢查

2026-09-17（Asia/Taipei），使用者重新接上 SUGAR C60／Android 11，要求繼續內部測試。未執行安裝、解除安裝、清資料、登入或同步；不得將本頁當成 v5 驗收通過。

## 已確認

- `tw.searchbefore.app` 為 versionCode 4／1.0.3.0，min23／target36。Package Manager 安裝來源為 null。
- 從裝置唯讀複製其 base.apk（不含 APP 私人資料），使用 Android SDK apksigner 驗證簽章成功。
- v4 SHA-256：`d749133d6c22aabb0e48654a424652f45dbf9220c2c586813a9347cda7bf2fbe`，與專案既有 upload key 相同；不同於已登記的 Play app-signing SHA-256 `e53b7199dfcff2bd812346daa9f8528141cbc9a8340d8d42b850b7e0a300473f`。不能視為 Play 簽署舊版，也不能直接驗收正常 Play 原地更新。
- 原生 debug 預覽版仍在；既有唯讀摘要腳本回報 2 田區／1 用藥／4 農務／0 配方，1 筆用藥刪除標記；同步與提醒關閉。這只代表本機現況，不證明現時雲端備份。
- Play Console 總覽仍為內部 v5 與 Alpha v4，未修改發布軌道。

## 後續限制

1. 使用者已選定本人 xiao 帳號，另明確同意建立帳戶層級單人名單。已建立「原生內部驗收－本人」（1 人）、僅勾選噴前查內部測試；原有 26 人名單未勾選。Console 儲存後軌道顯示「有效」。私人 Email 不放入此 Git 文件。
2. 使用者本次明確指示不用備份，可移除本機 v4 改裝 Play 版；不再以備份／同一解除安裝同意阻擋。Chrome 與原生預覽版不可移除或清資料。
3. 使用者已另同意加入頁的 Email／APP 使用資訊分享提示；已按 Accept invite，Google 回報 You’re a tester。手機 Play 帳號 UI 確認與受邀本人相同。但官方 Download test app 連結目前電腦 Not Found、手機「找不到項目」；可能尚待傳播，未證明原因。為避免失去可用版本，下載可用前尚未解除安裝 v4，沒有用旁載替代驗收。
4. 真正 TWA → 原生升級應先具備 Play 簽署 v4 基準，再升級 v5；若只能全新安裝 v5，須標示為新安裝＋移轉驗收，不能宣稱原地升級通過。
5. 不在手機執行 Gradle connected suite，不以旁載 upload-key APK 代替 Play 簽章登入驗收。

## 本輪停留點

加入邀請後重新載入官方商店下載頁仍 Not Found；手機 Play 同帳號仍「找不到項目」。發布總覽未看到待送審或待發布項目，不更改控管型發布或 Alpha／正式版。Google [測試設定官方說明](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en-GB) 表示首次測試連結可能數小時後才可用；本輪未證明錯誤確切原因，不將延遲推論當定論。沒有卸載、安裝、清除資料或執行雲端寫入。後續先重新開官方測試下載頁，可取得套件後再依已取得授權移除旁載 v4，安裝 Play 版並核對簽章／版本。沒有建立背景監控。
