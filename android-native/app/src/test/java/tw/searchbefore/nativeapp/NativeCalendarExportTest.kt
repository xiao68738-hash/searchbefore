package tw.searchbefore.nativeapp

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class NativeCalendarExportTest {
    private val now = Instant.parse("2026-10-05T00:00:00Z")
    private fun row(id: String, plot: String, date: String, phi: Any) = JSONObject()
        .put("id", id).put("plotId", plot).put("date", date).put("phi", phi).put("crop", "TEST_CROP")
        .put("operator", "PRIVATE_OPERATOR").put("notes", "PRIVATE_NOTES").put("agent", "PRIVATE_AGENT")
    private fun data() = Backup.empty().put("fieldPlots", JSONArray()
        .put(JSONObject().put("id", "a").put("crop", "TEST_CROP").put("tag", "TEST_A"))
        .put(JSONObject().put("id", "b").put("crop", "TEST_CROP").put("tag", "TEST_B")))
        .put("records", JSONArray().put(row("r1", "a", "2026-09-01", 3)).put(row("r2", "a", "2026-09-02", 7))
            .put(row("r3", "b", "2026-09-01", 1)).put(row("r4", "b", "2026-09-02", JSONObject.NULL)))
    private fun encode(data: JSONObject, plot: String = "") = CalendarExport.encode(data, plot, now).toString(Charsets.UTF_8).replace("\r\n ", "")

    @Test fun latestWholePlotDateAndUnknownGroupSuppressionDoNotMutateRecords() {
        val data = data(); val before = data.toString(); val result = encode(data)
        assertEquals(1, Regex("BEGIN:VEVENT").findAll(result).count())
        assertTrue(result.contains("DTSTART:20260909T230000Z\r\n"))
        assertTrue(result.contains("DTEND:20260909T233000Z\r\n"))
        assertTrue(result.contains("DTSTAMP:20261005T000000Z\r\n"))
        assertTrue(result.contains("2 筆紀錄")); assertTrue(result.contains("不代表殘留合格或准許採收"))
        assertTrue(result.contains("TRIGGER:-PT14H\r\n")); assertTrue(result.contains("TRIGGER:PT0S\r\n"))
        for(privateText in listOf("PRIVATE_OPERATOR", "PRIVATE_NOTES", "PRIVATE_AGENT", "TEST_B")) assertFalse(result.contains(privateText))
        assertEquals(before, data.toString())
    }
    @Test fun scopeIsExactAndMissingOrEntirelyUnknownPlotFailsClosed() {
        assertEquals(encode(data()), encode(data(), "a"))
        for(plot in listOf("b", "missing")) assertTrue(runCatching { encode(data(), plot) }.isFailure)
        assertTrue(runCatching { encode(Backup.empty()) }.isFailure)
    }
    @Test fun unassignedRecordsAreSeparateAndZeroWaitStillMeansNextDay() {
        val data = data().put("records", JSONArray().put(row("a", "", "2026-09-01", 0)).put(row("b", "", "2026-09-01", 3)))
        val result = encode(data)
        assertEquals(2, Regex("BEGIN:VEVENT").findAll(result).count())
        assertTrue(result.contains("DTSTART:20260901T230000Z"))
        assertTrue(result.contains("未指定田區，僅單筆參考"))
        val ids = result.lines().filter { it.startsWith("UID:") }
        assertEquals(2, ids.distinct().size)
    }
    @Test fun uidIsStableAcrossRecordOrderAndTextCannotInjectCalendarProperties() {
        val data = data()
        data.getJSONArray("fieldPlots").getJSONObject(0).put("tag", "X,;\\\r\nEND:VEVENT\r\nBEGIN:VEVENT")
        val first = encode(data)
        val reversed = NativeSync.rows(data.getJSONArray("records")).reversed()
        val second = encode(JSONObject(data.toString()).put("records", JSONArray(reversed)))
        assertEquals(first.lineSequence().single { it.startsWith("UID:") }, second.lineSequence().single { it.startsWith("UID:") })
        assertEquals(1, first.lineSequence().count { it == "BEGIN:VEVENT" })
        assertEquals(1, first.lineSequence().count { it == "END:VEVENT" })
        assertTrue(first.contains("X\\,\\;\\\\\\nEND:VEVENT\\nBEGIN:VEVENT"))
        assertEquals("a\\nb\\nc\\,\\;\\\\", CalendarExport.text("a\r\nb\rc,;\\\u0000\t"))
    }
    @Test fun utf8LineFoldingPreservesChineseAndSupplementaryCharacters() {
        val input = "SUMMARY:" + "蔥田𠮷".repeat(80)
        val folded = CalendarExport.fold(input)
        assertEquals(input, folded.replace("\r\n ", ""))
        assertTrue(folded.split("\r\n").all { it.toByteArray(Charsets.UTF_8).size <= 75 })
        val result = CalendarExport.encode(data(), "", now).toString(Charsets.UTF_8)
        assertTrue(result.endsWith("END:VCALENDAR\r\n"))
        assertTrue(result.split("\r\n").all { it.toByteArray(Charsets.UTF_8).size <= 75 })
        assertFalse(result.replace("\r\n", "").contains('\n'))
    }
    @Test fun excessiveEventsAndInvalidWaitValuesAreNotExported() {
        val huge = Backup.empty().put("records", JSONArray((0..2000).map { row("r$it", "", "2026-09-01", 0) }))
        assertTrue(runCatching { encode(huge) }.isFailure)
        for(phi in listOf(-1, 366, "invalid", JSONObject.NULL)) {
            assertTrue(runCatching { encode(data().put("records", JSONArray().put(row("r", "a", "2026-09-01", phi)))) }.isFailure)
        }
    }
}
