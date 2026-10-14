package tw.searchbefore.nativeapp

import org.json.JSONObject
import java.security.MessageDigest

/** Local-only receipt. No records, account identifiers or hash are sent to analytics. */
object SyncStatus {
    data class Presentation(val title: String, val detail: String)
    fun fingerprint(document: JSONObject): String {
        val content = JSONObject()
        for (key in NativeSync.collections) {
            val rows = NativeSync.localRows(document, key).sortedBy { it.getString("id") }
            content.put(key, org.json.JSONArray(rows))
        }
        return MessageDigest.getInstance("SHA-256").digest(NativeSync.canonical(content).toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it.toInt() and 255) }
    }
    fun receipt(document: JSONObject): JSONObject = JSONObject(document.toString())
        .put("lastSyncedFingerprint", fingerprint(document))
    fun present(document: JSONObject?, signedIn: Boolean, ownerConflict: Boolean, enabled: Boolean, running: Boolean, failed: Boolean): Presentation = when {
        document == null -> Presentation("正在讀取本機資料", "尚未判定雲端狀態。")
        ownerConflict -> Presentation("帳號不同，已阻擋同步", "本機資料保留；請登入原帳號，不要清除資料來繞過保護。")
        running -> Presentation("正在與雲端同步", "請等待完成；進行中不代表所有資料已備份。")
        !signedIn -> Presentation("本機保存", "未登入；目前沒有進行雲端同步。配方請另外匯出 JSON 備份。")
        !enabled -> Presentation("雲端同步已關閉", "登入不等於備份。請閱讀範圍並同意，再按立即同步。")
        failed -> Presentation("上次同步未完成", "本機資料保留；部分上傳可能已完成，請確認網路後重試。")
        document.optString("lastSyncedFingerprint").isEmpty() || document.optString("lastSyncAt").isEmpty() ->
            Presentation("待確認雲端備份", "請按立即同步確認目前內容；舊的同步時間不能證明之後的修改已上傳。")
        document.optString("lastSyncedFingerprint") != fingerprint(document) ->
            Presentation("有本機變更待同步", "本機紀錄或刪除標記已變更。請按立即同步；不會自動上傳。")
        else -> Presentation("本機紀錄與上次同步完成時一致", "這不是即時雲端查詢；另一台裝置有修改時，請再同步。範圍為田區、用藥、農務及刪除標記，不含配方與顯示偏好。")
    }
}
