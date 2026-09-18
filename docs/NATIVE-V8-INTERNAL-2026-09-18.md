# v8 Play 內部發布與升級驗收

## 已發布範圍

2026-09-18 23:45（台北時間），Play Console 已確認 `1.1.3-internal (8) 橫向版面與登入同步驗收`「提供給內部測試人員」。僅既有內部測試軌道，未新增測試者、未變更 Alpha／正式軌道、Firebase 規則或價格。

- Console：`tracks/4701325807268914734/releases/4/details`。
- AAB：`D:/SearchBefore/releases/native-internal-v8-20260918/searchbefore-native-v8-internal.aab`。
- SHA256上傳前再次核對：`a02b81a6f90d1c7facfd481f86b294f608af6c2970c3f65ddd2d16fe95742935`。
- 來源c4f1115；f4450a5僅追加驗收文件，Review35362150852／Native35362150835均SUCCESS。
- Play讀取versionCode8、min24、target36。各類裝置相對v7增減均0；手機12,349、平板6,727。

## Play 警告與尚缺證據

沒有阻擋發布的錯誤；兩項警告保留：

1. 沒有去混淆檔。此版`minifyEnabled false`，未產生R8 mapping；不為消除警告而上傳不相符檔案。
2. 沒有原生偵錯符號。包含AndroidX `libandroidx.graphics.path.so`和`libdatastore_shared_counter.so`，四ABI合併前輸入的二進位字串檢查均未找到`.debug_info`／`.symtab`。這是現有依賴的診斷限制，不代表没有原生程式碼或保證無當機；後續若取得對應版本的正式符號才可上傳。

本輪Play預先發布報告仍顯示「上傳構件即可產生正式發布前測試報告」，沒有可讀結果；不能當成通過或零問題。

## 新發現：正式送審的存取聲明不符現況

Play「登入詳細資料」（`app-content/testing-credentials`）目前保存「否：沒有任何部分受限」，編輯日期仍為7月20日。但原生雲端同步需要Google登入，不能以本機功能免費／免登入推論所有功能均無限制。

已查看新增說明視窗：要求英文、名稱60字元、額外說明500字元，以及能完整存取所有功能的確認。頁面明示審查人員不能使用自己的帳號或建立新帳號；因此「使用任何Google帳號」並不足以完成這項聲明。沒有輸入私人帳號或密碼、沒有勾選不實的完整存取保證；查看後已捨棄未儲存的編輯，原設定尚未修正。

正式送審前須準備無私人資料、可讓審查人員存取同步的專用帳號，並在Console安全填入可用憑證／存取方式。不要在交接、Git或聊天中記錄密碼，不停用原使用者的雙重驗證，也不放寬Firestore Rules。建立帳號或接受新條款由使用者處理。以下為尚待搭配已驗證憑證的英文操作草稿，不能獨立當成完整登入資訊：

> Native app: search, calculations, local records and JSON backup work without login. Cloud sync requires Google sign-in. Use the supplied review account via Personal > Google sign-in. Enable cloud sync, accept the scope notice, then tap Sync now to upload/restore that account's records. Sign-in alone does not upload data. Use synthetic test records only. Recipes and display preferences are not cloud-synced. Do not switch accounts on a device containing another account's records.

本項列為正式發布阻擋項，而非宣稱已處理完成。

## 實機升級狀態

發布前SUGAR C60為Play v7，firstInstallTime為2026-09-17 07:45:22、lastUpdateTime為2026-09-18 19:50:26。本輪既有完整備份基準是`private/native-release-acceptance-20260918/after-account-switch.json`，不放Git。

23:49手機Play仍顯示「開啟」且版本資訊為v7舊說明，更新尚未送達；沒有卸載、清除或側載替代。後續必須確認installer=com.android.vending、versionCode8、firstInstallTime不變，再核對登入／同步、完整JSON及重啟保留；未完成前不宣稱v8實機驗收通過。

商店截圖仍待最終正式畫面；私人帳號／紀錄頁不作商店圖片，內部版徽章不抹除偽裝正式版。
