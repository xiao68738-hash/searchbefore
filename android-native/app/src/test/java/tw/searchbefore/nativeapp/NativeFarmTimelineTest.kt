package tw.searchbefore.nativeapp

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeFarmTimelineTest {
    private fun data(): JSONObject = Backup.empty()
        .put("fieldPlots", JSONArray().put(JSONObject().put("id", "a").put("crop", "TEST_CROP").put("tag", "TEST_A"))
            .put(JSONObject().put("id", "b").put("crop", "TEST_CROP").put("tag", "TEST_B")))
        .put("records", JSONArray().put(JSONObject().put("id", "same").put("plotId", "a").put("date", "2026-01-01")
            .put("crop", "TEST_CROP").put("agent", "TEST_AGENT").put("pest", "TEST_PEST").put("phi", JSONObject.NULL)))
        .put("farmRecords", JSONArray().put(JSONObject().put("id", "same").put("plotId", "a").put("date", "2026-01-02")
            .put("type", "fertilizer").put("operator", "TEST_OPERATOR").put("details", JSONObject().put("materialName", "TEST_MATERIAL").put("quantity", "2").put("unit", "kg")))
            .put(JSONObject().put("id", "other").put("plotId", "b").put("date", "2026-01-03").put("type", "harvest").put("details", JSONObject().put("quantity", "3").put("unit", "kg")))
            .put(JSONObject().put("id", "unassigned").put("plotId", "").put("date", "2026-01-04").put("type", "equipmentMaintenance").put("details", JSONObject().put("equipment", JSONArray().put("TEST_MACHINE")).put("actions", JSONArray().put("TEST_ACTION")))))
    @Test fun mergedTimelineKeepsCollectionIdentityAndOriginalData() {
        val data = data(); val before = data.toString()
        val events = FarmTimeline.events(data)
        assertEquals(4, events.size); assertEquals(4, events.map { it.key }.distinct().size)
        assertEquals(listOf("2026-01-04", "2026-01-03", "2026-01-02", "2026-01-01"), events.map { it.record.getString("date") })
        assertEquals(before, data.toString())
    }
    @Test fun exactPlotDateAndTypeFiltersDoNotAttachUnassignedRecords() {
        assertEquals(2, FarmTimeline.events(data(), RecordFilter(plotId = "a")).size)
        assertEquals(1, FarmTimeline.events(data(), RecordFilter(plotId = "a", from = "2026-01-02", to = "2026-01-02", type = "fertilizer")).size)
        assertEquals(1, FarmTimeline.events(data(), RecordFilter(type = "records")).size)
        assertEquals(3, FarmTimeline.events(data(), RecordFilter(type = "farmRecords")).size)
        assertTrue(FarmTimeline.events(data(), RecordFilter(plotId = "a", type = "harvest")).isEmpty())
    }
    @Test fun searchIncludesDetailsOperatorNotesAndPlotLabelWithoutMutating() {
        for(term in listOf("TEST_MATERIAL", "TEST_OPERATOR", "施肥")) {
            assertEquals("farmRecords:same", FarmTimeline.events(data(), RecordFilter(query = term)).single().key)
        }
        assertEquals(2, FarmTimeline.events(data(), RecordFilter(query = "TEST_A")).count { it.record.optString("plotId") == "a" })
        assertEquals("unassigned", FarmTimeline.events(data(), RecordFilter(query = "TEST_MACHINE")).single().record.getString("id"))
    }
    @Test fun invalidDatesMissingPlotAndUnknownTypeFailClosed() {
        for(filter in listOf(RecordFilter(from = "2026-02-30"), RecordFilter(from = "2026-02-01", to = "2026-01-01"), RecordFilter(plotId = "deleted"), RecordFilter(type = "other")))
            assertTrue(runCatching { FarmTimeline.events(data(), filter) }.isFailure)
    }
    @Test fun filteringTimelineDoesNotClearUnknownWholePlotSafety() {
        val data = data()
        assertEquals(1, FarmTimeline.events(data, RecordFilter(plotId = "a", from = "2026-01-02")).size)
        assertEquals("unknown", Farm.safety(data, "a", "2026-01-03").getString("status"))
    }
}
