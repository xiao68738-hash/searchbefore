# Android v3：Chrome／模擬器排查（2026-09-08）

## 狀態

本輪只操作隔離的 `SearchBefore_API36_Release3` 模擬器、測試腳本和證據；未發布 Play、未部署網站，也未修改正式 Firebase 規則。候選 APK 仍為 2026-09-07 的 versionCode 3／1.0.2.0／targetSdk 36。

**結論：尚未完全修復，Android v3 穩定性驗證未通過。** 已排除測試程序的連網限制並修正 SSD 副本漏檔；仍觀察到 System UI／多個 Android 系統服務 ANR。原始 Chrome FocusEvent ANR 的唯一根因尚未證實，不能宣稱只是硬碟、記憶體、Chrome 或 App 程式造成。

2026-09-08 約 15:55（台北）已停止本輪模擬器，確認無 emulator／qemu 程序；主機可用記憶體由最後一輪約 341 MB 恢復到約 4501 MB。沒有留下持續重試的模擬器，也沒有變更全域 SDK、顯示驅動或防火牆。相容舊版僅作隔離對照，未取代原版 SDK。

既有 33 個測試檔與新增診斷防護測試通過，不等同於 Android 端對端通過。下一步需要健康的 Android 16 實機／獨立測試環境確認冷啟動、返回、畫面相容性，再完成 v2 原地更新與登入還原。不可用目前這台主機上不健康的模擬器推斷正式 App 一定正常或一定有同樣錯誤。

停止模擬器後，最終完整重跑 33 個測試檔通過，包含缺 SIM／radio 的實際拒絕啟動測試。網站建置完成後，成品檢查通過（26 檔／6.46 MB），診斷程式及私有證據未被發布成品納入；`git diff --check` 通過。一次成品檢查在建置尚未完成時誤啟動而失敗，已等待建置 exit 0 後重新檢查通過，沒有修改允許清單或放寬檢查。

### 重要更正：SSD 副本的附屬資料已補齊

前段建立 SSD 副本時，代理只複製系統映像目錄的檔案，漏了 `data/` 子目錄。這是本次測試環境建立失誤，不是 App 的錯誤。官方 Emulator 程式會從 `data/misc/modem_simulator` 複製通訊設定；缺檔時出現 `Could not setup modem simulator config files, modem simulator disabled`。因此前段 SSD、繪圖與版本對照均受到「不完整系統映像目錄」干擾，不能用來單獨判斷硬碟、顯示驅動或版本造成 ANR。

已完整補入官方 `data/` 共 17 個檔案，逐檔 SHA-256 與 D 槽 SDK 相符；原版 Emulator 37.1.11 重啟後確認 modem 設定已產生，停用警告消失。啟動腳本新增必要的 SIM／radio 檔案檢查，缺檔就拒絕啟動。完整配置已重測，仍有系統 ANR，不把補檔當成原始問題全部修復。

## 已查明的事實

- 原始 Chrome `CustomTabActivity` 的 FocusEvent ANR，主執行緒卡在 `AssetManager.nativeOpenNonAsset` → drawable 載入，thread state D；同時有 CPU、記憶體和 I/O 壓力。這指向系統資源問題，不能據此斷言網站 JS 或 Chrome 是唯一原因。
- D 槽是 USB 外接 WD My Passport 機械硬碟；C 槽是 NVMe SSD。原測試的 Android 系統映像、使用者資料都在 D 槽。
- D 槽測試即使只開 Chrome `about:blank`，仍出現 System UI／其他系統服務 ANR；沒有載入噴前查也會發生。
- 已將隔離映像複製至 C 槽暫存目錄，保留 D 槽原始資料。`hardware-qemu.ini` 與 qcow2 backing chain 均確認系統及資料映像指向 C 槽，不回讀 D 槽。
- 複製後的 SSD 環境實際成為新建 Android 使用者資料狀態，Chrome 需首次設定且沒有 App，因此已重新安裝同一份候選 APK。不得將此視為 v2→v3 原地更新或原資料保留測試。
- 一般受限測試程序的主機 HTTPS 請求回傳 `EACCES`。經審核允許的連網程序可取得網站 HTTP 200；模擬器重新連接虛擬 `AndroidWifi` 後也能解析、連上網站。未更動電腦防火牆、系統 DNS 或憑證。
- Emulator 37.1.11／Google APIs x86_64 API 36 revision 7／Chrome 133.0.6943.137。本輪唯讀查詢 Google 官方系統映像套件清單仍為 revision 7；不能把這說成 Chrome 已更新到最新版本。

## 中間結果與限制

| 測試 | 結果 |
|---|---|
| D 槽／1080 畫面／host GPU | Chrome 空白頁仍有 System UI 等 ANR |
| D 槽／720 畫面／2048 MB／4 核 | 空白頁仍有系統服務 ANR，改善解析度不足以修復 |
| C 槽／720×1280／320 dpi／2048 MB／4 核 | Chrome 首次設定可操作；離線啟動約 2.2–2.5 秒，但後續畫面是通知提示／無網路，**不算網站通過** |
| C 槽／2048 MB／連網 | System UI 與電話服務 ANR 再現；CPU 和記憶體回收壓力明顯，**不通過** |
| C 槽／2560 MB／連網／host GPU | Android 冷開機 113 秒；Chrome 啟動約 5.8 秒，但 System UI／電話等服務 ANR，**不通過** |
| C 槽／2560 MB／軟體繪圖、停用 Vulkan | TWA 啟動約 14.4 秒，System UI、輸入法、Google 服務等多個 ANR，**不通過** |
| 系統、資料、Emulator／ADB 執行檔皆 C 槽／2560 MB／host GPU | 開機 113 秒，TWA 啟動 6.6 秒，但系統服務 ANR，**不通過** |
| Google 官方 Emulator 36.1.9 相容版本隔離對照 | 開機 77 秒，v3 外殼 3.2 秒；實際載入登入頁並點選訪客進入公告，仍有電話服務 ANR，**整體不通過**。存在 VulkanVirtualQueue 相容性提醒，不能當成新版全數通過；37.1.11 保留 |
| 完整 SSD 系統映像／Emulator 37.1.11／2560 MB | modem 停用警告消失，TWA 外殼 6.3 秒；System UI／Google／電話等服務 ANR，**不通過** |
| 完整 SSD 系統映像／Emulator 36.1.9／3072 MB | TWA 外殼 1.9 秒；本輪事件沒有新 ANR，但既有 System UI 無回應視窗仍遮住 App，**不通過**。主機可用記憶體降至 341 MB，已停止 |

SSD、首次資料狀態、顯示密度等同時有改變，並非單一變因實驗；不能將全部改善歸因於 SSD。

## 檢查工具

- `scripts/start-android-test-emulator.mjs`：固定 API 36 隔離 AVD／5556 埠，明確指定 SSD root、SDK、全新 log。檢查指標和系統映像在相同測試根目錄；僅設定子程序的 Android 環境變數。預設 2560 MB／4 核／720×1280／320 dpi／host GPU，不改使用者全域設定。
- `scripts/check-android-startup.mjs`：只允許指定隔離模擬器；TWA 模式要求 versionCode 3。記錄 Android／Chrome 版本、既有 ANR、每輪強制停止後冷啟動、20 秒觀察、新 ANR／crash、焦點、截圖與主機可用記憶體。
- 日誌擷取失敗會記錄錯誤並失敗退出；不把缺少證據當通過。事件日誌依本輪裝置時間限制範圍，保留原失敗紀錄。`lastanr` 之外也檢查 boot event ANR，避免系統服務失敗未出現在摘要而漏判。
- 線上啟動模式要求 Android 有有效預設網路；啟動必須回傳 Status ok。既有／新增 ANR、無回應視窗或工具錯誤都不能通過。新增測試以缺 SIM／radio 設定的臨時假環境實測：腳本在開啟 log 或啟動程序之前就拒絕執行。
- 即使工具 exit 0，仍須人工看截圖及做操作，排除 Chrome 首次設定、通知、無網路等畫面；這個工具不是完整端對端測試。

啟動範例（Windows；執行環境必須允許必要的對外連線）：

```powershell
node scripts/start-android-test-emulator.mjs --sdk=<SDK_DIR> --ssd-root=<SSD_ROOT> --log=<NEW_LOG>
node scripts/check-android-startup.mjs --adb=<SDK_DIR>\platform-tools\adb.exe --out=<NEW_EVIDENCE_DIR> --mode=twa --rounds=3
```

本機 SSD 暫存位置記在 `D:\SearchBefore\private\android-ssd-test-location.txt`。本輪保留映像、兩版執行環境、壓縮檔與測試 AVD 備份，檔案邏輯大小共約 15.87 GiB（未量測實際配置空間）。暫存資料可被作業系統清理，啟動前須確認仍存在；不要覆寫或清除 D 槽原 AVD 來解決路徑問題。這些都是隔離測試副本，沒有登入真人帳號；原 SDK／AVD 完整保留。

證據位於 `D:\SearchBefore\private\anr-*20260908`、`release3-api36-*-retest.log`、`compact-system-anr-traces.txt`、`ssd-online-system-anr.txt`。未加入 Git／發布檔案。

## 安全與尚未涵蓋

沒有停用 ANR 偵測、提高 timeout、停用 Android 系統服務、關閉使用者其他 App 或繞過 HTTPS／網站驗證。Chrome 使用無帳號模式並關閉使用／當機資料回報。本輪不登入 Google、不產生真實農務或雲端紀錄。

即使啟動重測通過，仍不等於已完成實機、較新 Chrome、Play v2 原地更新、全新裝置登入還原或完整資安稽核。

## 官方參考

- [Android ANR 診斷：區分系統負載與 App 問題](https://developer.android.com/topic/performance/anrs/diagnose-and-fix-anrs)
- [Emulator 硬體加速](https://developer.android.com/studio/run/emulator-acceleration)
- [Emulator 已知問題與 Windows 記憶體](https://developer.android.com/studio/run/emulator-troubleshooting)
- [Emulator 官方版本紀錄](https://developer.android.com/studio/releases/emulator)
- [Google APIs 系統映像套件清單](https://dl.google.com/android/repository/sys-img/google_apis/sys-img2-4.xml)
- [官方 Emulator 通訊設定檔載入程式](https://android.googlesource.com/platform/external/qemu/+/emu-master-dev/android-qemu2-glue/main.cpp)
- [官方 Emulator 封存下載](https://developer.android.com/studio/emulator_archive)：36.1.9 Windows 檔 440857308 bytes，SHA-256 `edcba6087056d6c180ee7389ec6bc7518026bab673fbf9c57dd5ee341de3c55f`，下載後驗證相符；僅隔離診斷，未取代原 SDK。
