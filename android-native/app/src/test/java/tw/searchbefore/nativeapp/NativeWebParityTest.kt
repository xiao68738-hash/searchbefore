package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeWebParityTest {
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
