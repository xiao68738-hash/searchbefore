package tw.searchbefore.nativeapp

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeSyncTest {
    private fun record(id: String = "r1", stamp: String = "2026-01-01T00:00:00.000Z") = JSONObject()
        .put("id", id).put("crop", "蔥").put("agent", "測試").put("date", "2026-01-01")
        .put("phi", 7).put("updatedAt", stamp).put("plotId", "")
    private fun server(records: List<JSONObject> = emptyList()) = mapOf("records" to records, "fieldPlots" to emptyList<JSONObject>(), "farmRecords" to emptyList())
    @Test fun deletionWinsTieAndRemoteWinsOtherTie() {
        val local = record().put("operator", "local")
        val remote = record().put("operator", "remote")
        assertEquals("remote", NativeSync.winner(local, remote)!!.getString("operator"))
        val tomb = JSONObject().put("id", "r1").put("_deleted", true).put("updatedAt", local.getString("updatedAt"))
        assertTrue(NativeSync.winner(tomb, remote)!!.getBoolean("_deleted"))
        assertTrue(NativeSync.winner(local, tomb)!!.getBoolean("_deleted"))
    }
    @Test fun fullMergeIncludesLateOfflineChangesRegardlessOfCheckpoint() {
        val local = NativeDocument.empty().put("lastSyncAt", "2099-01-01T00:00:00.000Z")
        local.getJSONObject("data").getJSONArray("records").put(record())
        val remote = record("late", "2025-01-01T00:00:00.000Z")
        val merged = NativeSync.applyRemote(local, server(listOf(remote)))
        assertEquals(2, merged.getJSONObject("data").getJSONArray("records").length())
        assertEquals(1, local.getJSONObject("data").getJSONArray("records").length())
    }
    @Test fun deleteJournalSurvivesRestartAndCannotReviveOldRecord() {
        val before = NativeDocument.empty()
        before.getJSONObject("data").getJSONArray("records").put(record())
        val after = NativeDocument.replaceData(before, Backup.empty())
        val reopened = NativeDocument.parse(NativeDocument.encode(after))
        val merged = NativeSync.applyRemote(reopened, server(listOf(record())))
        assertEquals(0, merged.getJSONObject("data").getJSONArray("records").length())
        assertEquals(1, merged.getJSONObject("tombstones").getJSONArray("records").length())
    }
    @Test fun restoringDeletedRecordGetsNewerStampThanTombstone() {
        val before = NativeDocument.empty()
        before.getJSONObject("data").getJSONArray("records").put(record(stamp = "2099-01-01T00:00:00.000Z"))
        val deleted = NativeDocument.replaceData(before, Backup.empty())
        val restored = NativeDocument.replaceData(deleted, before.getJSONObject("data"), importing = true)
        val row = restored.getJSONObject("data").getJSONArray("records").getJSONObject(0)
        val tomb = deleted.getJSONObject("tombstones").getJSONArray("records").getJSONObject(0)
        assertEquals(row.toString(), NativeSync.winner(row, tomb).toString())
        assertEquals(0, restored.getJSONObject("tombstones").getJSONArray("records").length())
    }
    @Test fun importPreservesOwnerButDisablesSyncAndExportHasNoIdentity() {
        val document = NativeDocument.empty().put("ownerUid", "test_uid").put("syncEnabled", true)
        val imported = NativeDocument.replaceData(document, Backup.empty(), true)
        assertFalse(imported.getBoolean("syncEnabled"))
        assertEquals("test_uid", imported.getString("ownerUid"))
        val exported = Backup.encode(imported.getJSONObject("data")).toString(Charsets.UTF_8)
        for (privateKey in listOf("test_uid", "ownerUid", "syncEnabled", "tombstones")) assertFalse(exported.contains(privateKey))
    }
    @Test fun corruptAndIncompleteCloudDataIsRejectedWithoutMutation() {
        val before = NativeDocument.empty(); val original = before.toString()
        assertTrue(runCatching { NativeSync.applyRemote(before, mapOf("records" to listOf(record()))) }.isFailure)
        assertTrue(runCatching { NativeSync.applyRemote(before, server(listOf(record().put("plotId", "missing")))) }.isFailure)
        assertTrue(runCatching { NativeSync.applyRemote(before, server(listOf(record().put("id", "../other")))) }.isFailure)
        assertTrue(runCatching { NativeSync.applyRemote(before, server(listOf(record().put("updatedAt", "broken")))) }.isFailure)
        assertEquals(original, before.toString())
    }
    @Test fun jsonComparisonIgnoresObjectKeyOrderNotArrayOrder() {
        assertTrue(NativeSync.same(JSONObject("{\"a\":1,\"b\":2}"), JSONObject("{\"b\":2,\"a\":1}")))
        assertFalse(NativeSync.same(JSONObject().put("a", JSONArray(listOf(1, 2))), JSONObject().put("a", JSONArray(listOf(2, 1)))))
    }
    @Test fun cloudDoesNotModifyLocalOnlyCollections() {
        val before = NativeDocument.empty()
        before.getJSONObject("data").getJSONArray("recipes").put(JSONObject().put("name", "本機配方").put("private", "保持原狀"))
        val after = NativeSync.applyRemote(before, server(listOf(record())))
        assertEquals(before.getJSONObject("data").getJSONArray("recipes").toString(), after.getJSONObject("data").getJSONArray("recipes").toString())
        assertFalse(NativeSync.collections.contains("recipes"))
    }
}
