# Play 原生內部版：手機驗收紀錄

## 2026-09-17 晚間重試：Play v5 升級與登入／還原通過（最新）

本節優先於下方歷史阻擋。使用者重新接上 SUGAR C60（Android 11／API 30）要求重試；官方邀請頁顯示 You’re a tester，由 Download test app 進入 Play 後已出現「更新」。這次透過商店完成原地更新，沒有解除安裝、清除資料或旁載。

| 檢查 | 實測結果 |
|---|---|
| Play 安裝／原地升級 | `tw.searchbefore.app` 從 v4 升至 versionCode 5／`1.1.0-internal`，min24／target36；installer 為 `com.android.vending`。firstInstallTime 保持 2026-09-17 07:45:22，lastUpdateTime 2026-09-17 19:43:37。 |
| 真正 Play 簽章 | 從裝置唯讀複製 base.apk 後 apksigner 通過；SHA256 `e53b7199dfcff2bd812346daa9f8528141cbc9a8340d8d42b850b7e0a300473f`，SHA1 `9099bff03db174c03b5111d01128e3a439590ae9`，與 Play app-signing 一致。 |
| 原生啟動 | 原生五分頁可開啟；非舊 TWA 網頁。此候選仍顯示內部測試標記。 |
| 真實 Google 登入 | 透過手機 Google 帳號選擇器選本人既有 xiao 帳號成功；Play 下載帳號是受邀尾碼 82，兩者用途不同。登入本身不啟用同步。 |
| 空白原生本機 → 既有雲端匯入 | 匯入前 0 用藥／0 田區／0 農務／0 配方。明確開啟同步並按立即同步後，APP 回報伺服器同步成功，時間 `2026-09-17T11:48:57.465Z`；畫面為 1 用藥／2 田區／4 農務／0 配方。 |
| 登出 | 顯示同步與本機提醒已關閉，本機紀錄仍保留；數量不變。 |
| 重登與再次同步 | 同一帳號重新登入後同步維持關閉；重新同意、按立即同步成功，時間 `2026-09-17T11:55:26.362Z`。數量仍 1／2／4／0，沒有數量增加。 |
| 程序重啟保留 | 僅 force-stop 正式套件，再啟動實際解析出的 MainActivity；本機數量、登入、同步同意及上次同步時間仍保留。 |

最後保留本人登入與同步同意，APP 目前為手動按「立即同步」合併，不能描述為持續自動備份。本輪未新增、編輯或刪除田間紀錄，未清 Chrome／預覽版資料；沒有改動 Alpha、正式版、測試名單或 Firebase 規則。APK 證據只放本機 `D:/SearchBefore/audits/phone-play-v5-20260917.apk`，不提交二進位或私人紀錄。

### 不能由本輪結果推論的項目

- Play v4 → v5 套件原地升級已通過，但不代表 Chrome/TWA 私有儲存會自動搬移；原生初始為空，這次透過既有雲端恢復。
- 數量與畫面一致不等於所有欄位／刪除日誌逐項雜湊一致；正式 v5 新增紀錄上傳、隔離裝置再還原仍未在本輪測試。
- 真實完整 JSON 雙向移轉（含配方／偏好）、離線／跨帳號及通知等完整 v5 回歸仍待完成。9/16 preview 的測試不能冒充此次 Play v5 實測。
- 本機為 API30，不等於 Play v5 的 Android16 實機驗收。本輪未發布新版本，不能宣稱已可完整取代現有 APP。

以下為歷史紀錄，不應再以「v5 無法取得」或「簽章不符」阻擋接續驗收。

## 使用者重新安裝後（早晨歷史）

使用者回報已解除安裝後重装，本輪唯讀核對已證實為 **Play v4，而非 v5**：versionCode 4／1.0.3.0，firstInstallTime 與 lastUpdateTime 均 2026-09-17 07:45:22，installerPackageName=com.android.vending。從裝置複製 base.apk（不含私人紀錄），apksigner 通過；SHA256 e53b7199dfcff2bd812346daa9f8528141cbc9a8340d8d42b850b7e0a300473f、SHA1 9099bff03db174c03b5111d01128e3a439590ae9，與 Play app signing 一致。舊旁載簽章障礙已解除，不可再要求解除安裝。

手機官方內部邀請頁已顯示 You’re a tester；Play 主畫面的帳號提示確認是尾碼 82。從 Download test app 進入商店仍只有解除安裝／開啟，說明日期 9/9。只 force-stop 並重新開啟 Play 商店後結果相同；沒有清除商店或 APP 資料，沒有更改帳號、雲端內容或手機安裝。尚未查明為何未派送 v5，不直接判定純快取／傳播延遲。保留已驗證 Play v4 作原地升級基準，待 v5 可更新後核對新版本／簽章及原生登入。前段舊「installer=null」「邀請未接受」狀態已過期。

## 後續重試（優先於下方前次狀態）

使用者要求另加尾碼 82 的 SearchBefore 帳號，並明確同意將新帳號加入帳戶層級名單，仍限本 APP 內部測試。已保存至原名單；Console 顯示 2 人且勾選，原有 26 人清單未勾選。沒有新增其他 APP／軌道權限。

桌面原 xiao 帳號的官方商店連結重載仍 Not Found。手機 Play 已可開噴前查頁，但說明仍是 9/9 舊版，沒有出現更新鈕；本機仍 v4／installer=null，未卸載或安裝。手機 Chrome 的 Google 帳號選單確認目前是新加入的尾碼 82 帳號，內部加入頁現在顯示邀請（不再顯示 App not available）；已關閉帳號選單並停在 Accept invite。新帳號的邀請分享同意尚未接受，需使用者在手機按下或另行同意代按，不能沿用 xiao 帳號的同意。v5 Play 安裝／登入仍未驗收。

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
