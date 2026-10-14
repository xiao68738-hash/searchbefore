package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SyncStatusTest {
    private fun status(d: JSONObject, failed: Boolean = false) = SyncStatus.present(d, true, false, true, false, failed).title
    private fun synced() = SyncStatus.receipt(NativeDocument.empty().put("ownerUid", "test-owner").put("lastSyncAt", "2026-10-14T00:00:00Z"))
    @Test fun oldInstallationsAreNotAssumedSynced() {
        assertEquals("待確認雲端備份", status(NativeDocument.empty().put("lastSyncAt", "2026-10-14T00:00:00Z")))
    }
    @Test fun receiptSurvivesRestartButNeverBackupExport() {
        val d = NativeDocument.parse(NativeDocument.encode(synced()))
        assertEquals("本機紀錄與上次同步完成時一致", status(d))
        assertFalse(Backup.encode(d.getJSONObject("data")).toString(Charsets.UTF_8).contains("lastSyncedFingerprint"))
    }
    @Test fun localOnlyEditsDoNotClaimRecipeBackup() {
        val d = synced()
        d.getJSONObject("data").getJSONArray("recipes").put(JSONObject().put("name", "合成測試"))
        d.put("displayPrefs", JSONObject())
        assertEquals("本機紀錄與上次同步完成時一致", status(d))
        assertTrue(SyncStatus.present(d, true, false, true, false, false).detail.contains("不含配方"))
    }
    @Test fun additionsAndDeletionsArePendingEvenWithOldTimestamps() {
        val d = synced()
        d.getJSONObject("data").getJSONArray("farmRecords").put(JSONObject().put("id", "test-row").put("updatedAt", "2000-01-01T00:00:00Z"))
        assertEquals("有本機變更待同步", status(d))
        val deleted = synced()
        deleted.getJSONObject("tombstones").put("records", org.json.JSONArray().put(JSONObject().put("id", "deleted").put("_deleted", true)))
        assertEquals("有本機變更待同步", status(deleted))
    }
    @Test fun failureAndAccountGuardsOverrideLastSuccess() {
        val d = synced()
        assertEquals("上次同步未完成", status(d, true))
        assertEquals("帳號不同，已阻擋同步", SyncStatus.present(d, true, true, true, true, false).title)
        assertEquals("雲端同步已關閉", SyncStatus.present(d, true, false, false, false, false).title)
        assertEquals("正在與雲端同步", SyncStatus.present(d, true, false, true, true, false).title)
    }
    @Test fun importClearsReceiptWithoutAdoptingAccount() {
        val d = NativeDocument.replaceData(synced(), Backup.empty(), true)
        assertFalse(d.has("lastSyncedFingerprint"))
        assertEquals("test-owner", d.getString("ownerUid"))
    }
}
