package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate

class NativeFarmTest {
    private fun data() = Backup.empty().apply { getJSONArray("fieldPlots").put(JSONObject().put("id", "plot1").put("crop", "蔥").put("name", "蔥")) }
    private fun input(type: String) = Farm.fields.getValue(type).associate { it.key to if(it.numeric) "1.50" else "測試" }
    @Test fun sixTypesCanCreateEditAndRoundTripWithoutDroppingMetadata() {
        for(type in Farm.types.keys) {
            val original = data()
            val added = Farm.save(original, null, "", type, "2026-01-01", "plot1", "甲", "備註", input(type), true)
            val row = Farm.records(added).single().put("unknownField", "keep")
            row.getJSONObject("details").put("unknownDetail", "keep")
            val edited = Farm.save(added, row.getString("id"), row.getString("updatedAt"), type, "2026-01-02", "plot1", "乙", "修改", input(type), true)
            val reread = Farm.records(Backup.parse(Backup.encode(edited))).single()
            assertEquals("keep", reread.getString("unknownField"))
            assertEquals("keep", reread.getJSONObject("details").getString("unknownDetail"))
            assertEquals("乙", reread.getString("operator"))
            assertEquals(0, Farm.records(original).size)
            assertTrue(runCatching { Farm.save(edited, row.getString("id"), row.getString("updatedAt"), type, "2026-01-02", "plot1", "", "", input(type)) }.isFailure)
        }
    }
    @Test fun invalidRequiredQuantityDateAndPlotAreRejected() {
        val source = data()
        for(value in listOf("", "-1", "NaN", "Infinity", "1e900", "=1+1")) {
            assertTrue(runCatching { Farm.save(source, null, "", "harvest", "2026-01-01", "plot1", "", "", input("harvest") + ("quantity" to value), true) }.isFailure)
        }
        for(date in listOf("2026-02-30", LocalDate.now().plusDays(1).toString())) {
            assertTrue(runCatching { Farm.save(source, null, "", "cultivation", date, "plot1", "", "", input("cultivation")) }.isFailure)
        }
        assertTrue(runCatching { Farm.save(source, null, "", "cultivation", "2026-01-01", "", "", "", input("cultivation")) }.isFailure)
        assertTrue(runCatching { Farm.save(source, null, "", "equipmentMaintenance", "2026-01-01", "", "", "", input("equipmentMaintenance")) }.isSuccess)
    }
    @Test fun safetyNeverTreatsMissingRecordsOrUnknownPhiAsSafe() {
        val source = data()
        assertEquals("none", Farm.safety(source, "plot1", "2026-01-02").getString("status"))
        source.getJSONArray("records").put(JSONObject().put("id", "r1").put("crop", "蔥").put("agent", "測試").put("date", "2026-01-01").put("plotId", "plot1").put("phi", 7))
        assertEquals("waiting", Farm.safety(source, "plot1", "2026-01-02").getString("status"))
        assertEquals("waiting", Farm.safety(source, "plot1", "2026-01-08").getString("status"))
        assertEquals("safe", Farm.safety(source, "plot1", "2026-01-09").getString("status"))
        source.getJSONArray("records").put(JSONObject().put("id", "r2").put("date", "2026-01-01").put("plotId", "plot1").put("phi", JSONObject.NULL))
        assertEquals("unknown", Farm.safety(source, "plot1", "2026-01-08").getString("status"))
        assertTrue(Farm.safety(source, "plot1", "2026-01-02").getBoolean("hasUnknown"))
    }
    @Test fun linkedPlotCannotBeDeletedAndStaleDeleteIsRejected() {
        val source = Farm.save(data(), null, "", "cultivation", "2026-01-01", "plot1", "", "", input("cultivation"))
        assertTrue(runCatching { Farm.delete(source, "fieldPlots", "plot1", "") }.isFailure)
        val row = Farm.records(source).single()
        assertTrue(runCatching { Farm.delete(source, "farmRecords", row.getString("id"), "old") }.isFailure)
        val deleted = Farm.delete(source, "farmRecords", row.getString("id"), row.getString("updatedAt"))
        assertEquals(0, Farm.records(deleted).size)
        assertEquals(1, Farm.records(source).size)
    }
    @Test fun csvNeutralizesFormulasAndQuotesAllCells() {
        for(value in listOf("=HYPERLINK(\"bad\")", " +1", "-2", "@SUM(1)", "\t=1")) assertTrue(Farm.csvCell(value).startsWith("\"'"))
        assertEquals("\"甲,\"\"乙\"\"\n丙\"", Farm.csvCell("甲,\"乙\"\n丙"))
        val text = Farm.csv(data()).toString(Charsets.UTF_8)
        assertTrue(text.startsWith("\uFEFF"))
    }
}
