package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeWebParityTest {
    @Test fun webBackupSurvivesNativeImportAndExport() {
        val fixture = fixtures().getJSONObject("migration")
        val data = Backup.parse(fixture.getJSONObject("input").toString().toByteArray(Charsets.UTF_8))
        val imported = NativeDocument.replaceData(NativeDocument.empty(), data, importing = true)
        val actual = imported.getJSONObject("data")
        val expected = fixture.getJSONObject("expected")
        val normalized = JSONObject(actual.toString())
        // Import is a local edit: its sync timestamps must advance, not be silently preserved.
        for(key in NativeSync.collections) {
            val before = expected.getJSONArray(key)
            val after = normalized.getJSONArray(key)
            assertEquals(before.length(), after.length())
            for(i in 0 until before.length()) {
                val oldStamp = before.getJSONObject(i).getString("updatedAt")
                val newStamp = after.getJSONObject(i).getString("updatedAt")
                assertTrue(java.time.Instant.parse(newStamp).isAfter(java.time.Instant.parse(oldStamp)))
                after.getJSONObject(i).put("updatedAt", oldStamp)
            }
        }
        assertTrue(NativeSync.same(expected, normalized))
        assertEquals(6, actual.getJSONArray("farmRecords").length())
        assertFalse(imported.getBoolean("syncEnabled"))
        val output = java.io.File("build/native-validation/web-roundtrip.json")
        requireNotNull(output.parentFile).mkdirs()
        output.writeBytes(Backup.encode(actual))
    }
    private fun fixtures() = JSONObject(requireNotNull(javaClass.classLoader?.getResourceAsStream("web-native-golden.json")) {
        "Run scripts/export-native-catalog.cjs before native tests"
    }.bufferedReader().use { it.readText() })
    @Test fun allSupportedIntegerHarvestIntervalsMatchExistingWebPolicy() {
        val cases = fixtures().getJSONArray("harvest")
        assertEquals(1464, cases.length())
        for (case in NativeSync.rows(cases)) assertEquals(case.toString(), case.getString("expected"), Backup.harvestDate(case))
    }
    @Test fun conflictAndDeletionSemanticsMatchExistingWebCore() {
        val cases = fixtures().getJSONArray("sync")
        assertEquals(13, cases.length())
        for (case in NativeSync.rows(cases)) {
            val actual = NativeSync.merged(NativeSync.rows(case.getJSONArray("local")), NativeSync.rows(case.getJSONArray("remote")))
                .filterNot { it.optBoolean("_deleted") }.sortedBy { it.getString("id") }.map(NativeSync::canonical)
            val expected = NativeSync.rows(case.getJSONArray("expected")).sortedBy { it.getString("id") }.map(NativeSync::canonical)
            assertEquals(case.toString(), expected, actual)
        }
    }
    @Test fun batchSafetyMatchesWebIncludingUnknownAndLaterApplications() {
        val cases = fixtures().getJSONArray("batchSafety")
        assertEquals(37, cases.length())
        for (case in NativeSync.rows(cases)) {
            val actual = Farm.safety(Backup.empty().put("records", case.getJSONArray("records")), case.getString("plotId"), case.getString("date"))
            val expected = case.getJSONObject("expected")
            for(key in listOf("status", "safeDate", "daysRemaining", "recordCount")) {
                assertEquals("$key: $case", expected.get(key).toString(), actual.get(key).toString())
            }
        }
    }
}
