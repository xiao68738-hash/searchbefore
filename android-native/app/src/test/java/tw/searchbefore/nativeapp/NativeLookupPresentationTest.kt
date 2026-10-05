package tw.searchbefore.nativeapp

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate

class NativeLookupPresentationTest {
    private fun row(id: String, crop: String = "蔥", name: String = "TEST_ONLY") = UsageRow(JSONObject().put("id", id).put("crop", crop)
        .put("pest", "TEST_PEST").put("name", name).put("moa", "IRAC 3A"))
    @Test fun groupingKeepsEveryOriginalRowAndDrugScope() {
        val rows = listOf(row("a"), row("b"), row("c", crop = "洋蔥"), row("d", name = "OTHER"))
        val groups = agentCropGroups(rows)
        assertEquals(3, groups.size)
        assertEquals(rows.map { it.id }.sorted(), groups.flatMap { it.rows }.map { it.id }.sorted())
        groups.forEach { group -> assertTrue(group.rows.all { it.crop == group.crop && it.name == group.name }) }
        assertEquals(1, agentCropGroups(rows, "洋蔥").size)
        assertTrue(agentCropGroups(rows, "無登記").isEmpty())
        assertEquals(groups.size, groups.map { it.key }.distinct().size)
    }
    @Test fun overviewRetainsReviewedPendingAndFormSpecificEvidenceWithoutInventingLowRisk() {
        val original = row("a").also { it.json.put("mrl", JSONObject().put("status", "reviewed-no-detect")) }
        val pending = row("b").also { it.json.put("mrl", JSONObject().put("status", "pending")) }
        val form = row("c").also { it.json.put("cropForms", JSONObject().put("leaf", JSONObject()
            .put("category", "matched").put("mrl", JSONObject().put("status", "reviewed-no-detect").put("scopeNote", "TEST_SCOPE")))) }
        assertEquals(2, overviewResidueNotices(listOf(original, original, pending), "").size)
        assertTrue(overviewResidueNotices(listOf(row("unknown")), "").isEmpty())
        assertTrue(overviewResidueNotices(listOf(form), "leaf").single().contains("TEST_SCOPE"))
        assertTrue(overviewResidueNotices(listOf(form), "").isEmpty())
        assertFalse(form.json.has("selectedHarvestForm"))
    }
    private val today = LocalDate.of(2026, 10, 5)
    private fun record(id: String, days: Long = 0, crop: String = "蔥", code: String = "IRAC 3A", plot: String = "a") = JSONObject()
        .put("id", id).put("date", today.minusDays(days).toString()).put("crop", crop).put("moa", code).put("plotId", plot).put("agent", "TEST_ONLY")
    @Test fun rotationUsesLatestValidExactCropCodeAndThirtyDayWindow() {
        val data = JSONObject().put("records", JSONArray(listOf(record("old", 31), record("boundary", 30), record("latest", 1),
            record("future", -1), record("other-crop", crop = "洋蔥"), record("other-code", code = "IRAC 3"), record("other-family", code = "FRAC 3A"),
            record("invalid").put("date", "bad"))))
        assertEquals("latest", RotationHistory.latest(data, row("r"), today)!!.getString("id"))
        assertEquals("boundary", RotationHistory.latest(JSONObject().put("records", JSONArray().put(record("boundary", 30))), row("r"), today)!!.getString("id"))
    }
    @Test fun rotationCanScopePlotsAndMissingCodeNeverMeansSafe() {
        val data = JSONObject().put("records", JSONArray(listOf(record("a", 2), record("b", 1, plot = "b"), record("unassigned", 3, plot = ""))))
        assertEquals("b", RotationHistory.latest(data, row("r"), today)!!.getString("id"))
        assertEquals("a", RotationHistory.latest(data, row("r"), today, "a")!!.getString("id"))
        assertEquals("unassigned", RotationHistory.latest(data, row("r"), today, "")!!.getString("id"))
        assertNull(RotationHistory.latest(data, row("r"), today, "deleted"))
        for(code in listOf("", "-", "unknown", "3A")) assertNull(RotationHistory.latest(data, row("r").also { it.json.put("moa", code) }, today))
    }
}
