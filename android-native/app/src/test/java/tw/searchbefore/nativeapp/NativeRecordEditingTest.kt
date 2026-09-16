package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import java.time.LocalDate

class NativeRecordEditingTest {
    private fun fixture(): JSONObject = Backup.empty().apply {
        getJSONArray("fieldPlots").put(JSONObject().put("id", "plot_a").put("name", "蔥").put("crop", "蔥")
            .put("tag", "一區").put("variety", "測試品種").put("plantDate", "2026-01-01").put("updatedAt", "2099-01-01T00:00:00.000Z")
            .put("extra", JSONObject().put("preserve", true)))
        getJSONArray("fieldPlots").put(JSONObject().put("id", "plot_b").put("crop", "豌豆"))
        getJSONArray("records").put(JSONObject().put("id", "rec_a").put("crop", "蔥").put("agent", "測試藥劑")
            .put("pest", "夜蛾類").put("date", "2026-01-01").put("phi", 7).put("water", 20).put("dil", 1000)
            .put("plotId", "").put("operator", "").put("updatedAt", "2099-01-01T00:00:00.000Z")
            .put("privateNotes", JSONObject().put("text", "原有欄位不應消失")))
        getJSONArray("farmRecords").put(JSONObject().put("id", "farm_a").put("plotId", "plot_a").put("details", "原始農務"))
    }
    private val stamp = "2099-01-01T00:00:00.000Z"

    @Test fun editPreservesUsageUnknownFieldsAndOtherCollections() {
        val before = fixture()
        val original = before.toString()
        val after = Backup.updateRecord(before, "rec_a", stamp, "2026-01-02", "plot_a", " 測試者 ")
        assertEquals(original, before.toString())
        val record = Backup.parse(Backup.encode(after)).getJSONArray("records").getJSONObject(0)
        assertEquals("plot_a", record.getString("plotId"))
        assertEquals("測試者", record.getString("operator"))
        assertEquals("2026-01-09", Backup.harvestDate(record))
        for (key in listOf("id", "crop", "agent", "pest", "phi", "water", "dil", "privateNotes")) {
            assertEquals(before.getJSONArray("records").getJSONObject(0).get(key).toString(), record.get(key).toString())
        }
        for (key in listOf("fieldPlots", "farmRecords", "recipes")) assertEquals(before.getJSONArray(key).toString(), after.getJSONArray(key).toString())
        assertTrue(Instant.parse(record.getString("updatedAt")).isAfter(Instant.parse(stamp)))
        assertTrue(Regex(".*\\.\\d{3}Z").matches(record.getString("updatedAt")))
    }
    @Test fun editRejectsMissingForeignAndStaleReferences() {
        val before = fixture()
        for (plot in listOf("plot_b", "missing")) {
            assertTrue(runCatching { Backup.updateRecord(before, "rec_a", stamp, "2026-01-02", plot, "") }.isFailure)
        }
        assertTrue(runCatching { Backup.updateRecord(before, "missing", stamp, "2026-01-02", "", "") }.isFailure)
        val after = Backup.updateRecord(before, "rec_a", stamp, "2026-01-02", "plot_a", "")
        assertTrue(runCatching { Backup.updateRecord(after, "rec_a", stamp, "2026-01-03", "", "") }.isFailure)
        val latest = after.getJSONArray("records").getJSONObject(0).getString("updatedAt")
        val cleared = Backup.updateRecord(after, "rec_a", latest, "2026-01-02", "", "")
        assertEquals("", cleared.getJSONArray("records").getJSONObject(0).getString("plotId"))
        assertEquals("plot_a", after.getJSONArray("records").getJSONObject(0).getString("plotId"))
    }
    @Test fun editDatesAndOperatorsAreValidatedWithoutMutatingOriginal() {
        val before = fixture(); val original = before.toString()
        for (date in listOf("", "2026-02-30", LocalDate.now().plusDays(1).toString())) {
            assertTrue(runCatching { Backup.updateRecord(before, "rec_a", stamp, date, "", "") }.isFailure)
        }
        assertTrue(runCatching { Backup.updateRecord(before, "rec_a", stamp, "2026-01-01", "", "字".repeat(121)) }.isFailure)
        assertEquals(original, before.toString())
    }
    @Test fun plotEditKeepsCropAndLinkedDataIntact() {
        val before = fixture(); val original = before.toString()
        val after = Backup.updatePlot(before, "plot_a", stamp, " 後院 ", "")
        val plot = Backup.plots(after).first()
        assertEquals("後院", plot.getString("tag"))
        assertEquals("", plot.getString("plantDate"))
        for (key in listOf("id", "name", "crop", "variety", "extra")) {
            assertEquals(Backup.plots(before).first().get(key).toString(), plot.get(key).toString())
        }
        assertEquals(before.getJSONArray("farmRecords").toString(), after.getJSONArray("farmRecords").toString())
        assertEquals(original, before.toString())
        assertTrue(Instant.parse(plot.getString("updatedAt")).isAfter(Instant.parse(stamp)))
        assertTrue(runCatching { Backup.updatePlot(after, "plot_a", stamp, "舊視窗修改", "") }.isFailure)
    }
    @Test fun plotEditRejectsBadInputAndDoesNotDeleteRecords() {
        val before = fixture(); val original = before.toString()
        for (tag in listOf(" ", "字".repeat(121))) assertTrue(runCatching { Backup.updatePlot(before, "plot_a", stamp, tag, "") }.isFailure)
        for (date in listOf("2026-02-30", LocalDate.now().plusDays(1).toString())) {
            assertTrue(runCatching { Backup.updatePlot(before, "plot_a", stamp, "一區", date) }.isFailure)
        }
        assertTrue(runCatching { Backup.updatePlot(before, "missing", stamp, "一區", "") }.isFailure)
        assertEquals(original, before.toString())
    }
}
