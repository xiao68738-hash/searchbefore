package tw.searchbefore.nativeapp

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeFieldSummaryTest {
    private fun data() = Backup.empty().put("fieldPlots", JSONArray()
        .put(JSONObject().put("id", "a").put("crop", "TEST_A").put("createdAt", "2026-01-01"))
        .put(JSONObject().put("id", "b").put("crop", "TEST_B").put("createdAt", "2026-02-01")))
    private fun use(id: String, plot: String, date: String, phi: Any = 3) = JSONObject()
        .put("id", id).put("plotId", plot).put("date", date).put("phi", phi).put("agent", "TEST_AGENT")

    @Test fun emptyAndNewestPlotFallbackNeverCreatesOrSelectsRecords() {
        assertNull(FieldSummaries.build(Backup.empty(), "2026-01-10"))
        val data = data(); val before = data.toString()
        val summary = requireNotNull(FieldSummaries.build(data, "2026-01-10"))
        assertEquals("b", summary.plot.getString("id")); assertNull(summary.latest)
        assertEquals("none", summary.safety.getString("status")); assertEquals("新增第一筆作業", summary.action)
        assertEquals(before, data.toString())
    }
    @Test fun explicitDefaultWinsAndUnassignedOrOtherPlotRecordsAreNotMerged() {
        val data = data().put("activePlotId", "a").put("records", JSONArray()
            .put(use("a1", "a", "2026-01-01")).put(use("b1", "b", "2026-01-05"))
            .put(use("none", "", "2026-01-09", JSONObject.NULL)))
        val before = data.toString(); val summary = requireNotNull(FieldSummaries.build(data, "2026-01-10"))
        assertEquals("a", summary.plot.getString("id")); assertEquals(1, summary.pesticideCount)
        assertEquals("a1", summary.latest?.record?.getString("id")); assertEquals("safe", summary.safety.getString("status"))
        assertEquals(before, data.toString())
    }
    @Test fun latestAssignedEventSelectsPlotAndInvalidDatesDoNotSortToTop() {
        val data = data().put("records", JSONArray().put(use("invalid", "a", "9999-99-99"))
            .put(use("valid", "b", "2026-01-03")).put(use("unassigned", "", "2026-01-04")))
        assertEquals("b", FieldSummaries.build(data, "2026-01-10")?.plot?.getString("id"))
    }
    @Test fun unknownAndInvalidOlderApplicationsStillBlockWholePlotSafety() {
        for(record in listOf(use("unknown", "a", "2026-01-01", JSONObject.NULL), use("invalid", "a", "bad-date"))) {
            val data = data().put("activePlotId", "a").put("records", JSONArray().put(record).put(use("known", "a", "2026-01-02")))
            val summary = requireNotNull(FieldSummaries.build(data, "2026-01-10"))
            assertTrue(summary.needsSafetyReview); assertEquals("unknown", summary.safety.getString("status"))
            assertEquals("先核對採收期", summary.action)
        }
    }
    @Test fun waitingUsesAllApplicationsAndPlusOneDayPolicy() {
        val data = data().put("activePlotId", "a").put("records", JSONArray().put(use("known", "a", "2026-01-02", 7)))
        val summary = requireNotNull(FieldSummaries.build(data, "2026-01-03"))
        assertEquals("2026-01-10", summary.safety.getString("safeDate")); assertEquals(7, summary.safety.getInt("daysRemaining"))
        assertEquals("查看安全採收倒數", summary.action); assertTrue(summary.needsSafetyReview)
    }
    @Test fun latestFarmEventAndCountsComeFromSamePlotOnly() {
        val data = data().put("activePlotId", "a").put("records", JSONArray().put(use("known", "a", "2026-01-01")))
            .put("farmRecords", JSONArray().put(JSONObject().put("id", "farm").put("plotId", "a").put("date", "2026-01-03")
                .put("type", "cultivation").put("details", JSONObject().put("activity", "TEST_ACTIVITY"))))
        val summary = requireNotNull(FieldSummaries.build(data, "2026-01-10"))
        assertEquals(1, summary.farmCount); assertEquals(1, summary.pesticideCount)
        assertEquals("farm", summary.latest?.record?.getString("id")); assertEquals("繼續記錄田間作業", summary.action)
        assertTrue(runCatching { FieldSummaries.build(data, "2026-02-30") }.isFailure)
    }
}
