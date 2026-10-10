package tw.searchbefore.nativeapp

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeReportScopeTest {
    private fun fixture(): JSONObject = Backup.empty()
        .put("fieldPlots", JSONArray().put(JSONObject().put("id", "p1")).put(JSONObject().put("id", "p2")))
        .put("records", JSONArray().put(record("r1", "p1", "2026-09-01"))
            .put(record("r2", "p1", "2026-09-30")).put(record("r3", "p2", "2026-09-10"))
            .put(record("r4", "", "2026-09-10")).put(record("r5", "p1", "2026-08-31")))
        .put("farmRecords", JSONArray().put(record("f1", "p1", "2026-09-01")).put(record("f2", "p2", "2026-09-30")))
    private fun record(id: String, plot: String, date: String) = JSONObject().put("id", id).put("plotId", plot).put("date", date)
    private fun ids(data: JSONObject, collection: String) = NativeSync.rows(data.getJSONArray(collection)).map { it.getString("id") }
    @Test fun inclusiveDateAndPlotFiltersNeverIncludeUnassignedOrOtherPlots() {
        val data = fixture()
        val selected = ReportScope("2026-09-01", "2026-09-30", "p1").select(data)
        assertEquals(listOf("r1", "r2"), ids(selected, "records"))
        assertEquals(listOf("f1"), ids(selected, "farmRecords"))
        assertEquals(5, data.getJSONArray("records").length())
    }
    @Test fun defaultIncludesAllAndSingleKindsDoNotLeakOtherRecords() {
        val data = fixture()
        assertTrue(NativeSync.same(data, ReportScope().select(data)))
        assertEquals(0, ReportScope(kind = "records").select(data).getJSONArray("farmRecords").length())
        assertEquals(0, ReportScope(kind = "farmRecords").select(data).getJSONArray("records").length())
    }
    @Test fun invalidScopeFailsInsteadOfExportingEverything() {
        for(scope in listOf(ReportScope("2026-02-30"), ReportScope("2026-10-02", "2026-10-01"),
            ReportScope(plotId = "deleted"), ReportScope(kind = "unknown"))) {
            assertTrue(scope.toString(), runCatching { scope.select(fixture()) }.isFailure)
        }
    }
    @Test fun openEndedDatesWorkAndUnknownDatesAreNotInvented() {
        val data = fixture()
        data.getJSONArray("records").put(record("bad", "p1", ""))
        assertEquals(listOf("r2"), ids(ReportScope(from = "2026-09-30").select(data), "records"))
        assertEquals(listOf("r1", "r5"), ids(ReportScope(to = "2026-09-01").select(data), "records"))
    }
    @Test fun reportingCopyCannotChangeBackupOrOriginalRecords() {
        val data = fixture(); val before = data.toString()
        val selected = ReportScope(plotId = "p1").select(data)
        selected.getJSONArray("records").getJSONObject(0).put("date", "TEST_ONLY")
        selected.getJSONArray("fieldPlots").getJSONObject(0).put("name", "TEST_ONLY")
        assertEquals(before, data.toString())
    }
    @Test fun previewCountsMatchExportWithoutSerializingBackup() {
        val source = fixture()
        val data = object : JSONObject() {
            override fun toString(): String = error("Preview must not serialize a backup")
        }
        source.keys().forEach { data.put(it, source.get(it)) }
        for(scope in listOf(ReportScope(), ReportScope(plotId = "p1"), ReportScope(kind = "farmRecords"),
            ReportScope("2026-09-01", "2026-09-30", "p1"))) {
            val selected = scope.select(source)
            assertEquals(selected.getJSONArray("records").length() to selected.getJSONArray("farmRecords").length(), scope.counts(data))
            scope.validate(data)
        }
        assertTrue(runCatching { ReportScope(plotId = "deleted").counts(data) }.isFailure)
    }
}
