package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.util.zip.ZipInputStream
import javax.xml.parsers.DocumentBuilderFactory

class NativeReportLayoutTest {
    private fun data() = Backup.empty().apply {
        getJSONArray("records").put(JSONObject().put("id", "r").put("crop", "蔥").put("pest", "TEST_PEST").put("agent", "TEST_AGENT")
            .put("date", "2026-01-01").put("dil", 0).put("water", 20).put("phi", JSONObject.NULL))
    }
    @Test fun tapDoesNotConfusePerTankWithTotalWaterAndKeepsUnknowns() {
        val data = data(); val row = data.getJSONArray("records").getJSONObject(0)
        assertEquals("每桶20L（非總量，待補）", ReportTables.build(data, ReportLayout.TAP).rows[1][5])
        row.put("totalWater", 60)
        assertEquals("60", ReportTables.build(data, ReportLayout.TAP).rows[1][5])
        row.remove("totalWater"); row.put("waterRecorded", false)
        val values = ReportTables.build(data, ReportLayout.TAP).rows[1]
        assertEquals("總水量未記錄", values[5]); assertEquals("需查標示", values[7])
        assertEquals("未填數字倍數；核對原用途", values[4])
    }
    @Test fun autonomousLayoutKeepsColumnsAndZeroOrFractionalPhiWithoutChangingData() {
        val data = data(); val row = data.getJSONArray("records").getJSONObject(0).put("phi", 0).put("dil", 1000)
        val before = data.toString(); val table = ReportTables.build(data, ReportLayout.USE)
        assertEquals(11, table.rows[0].size); assertEquals("1000", table.rows[1][5]); assertEquals("20", table.rows[1][6])
        assertEquals("0", table.rows[1][7]); assertEquals("2026-01-02", table.rows[1][8]); assertEquals(before, data.toString())
        row.put("phi", 1.5)
        assertEquals("2026-01-04", ReportTables.build(data, ReportLayout.USE).rows[1][8])
    }
    @Test fun specializedFormatRejectsFarmOrCombinedScopeInsteadOfSilentlyOmittingIt() {
        for(layout in listOf(ReportLayout.USE, ReportLayout.TAP)) {
            assertTrue(runCatching { layout.validate(ReportScope(kind = "all")) }.isFailure)
            assertTrue(runCatching { layout.validate(ReportScope(kind = "farmRecords")) }.isFailure)
            layout.validate(ReportScope(kind = "records"))
        }
        assertTrue(runCatching { ReportLayout.parse("missing") }.isFailure)
    }
    @Test fun malformedNumericValuesNeverTurnIntoNumbersOrSafeDates() {
        for(value in listOf("-1", "NaN", "Infinity", "1e99", "--")) {
            val data = data(); data.getJSONArray("records").getJSONObject(0).put("dil", value).put("water", value).put("totalWater", value).put("phi", value)
            val values = ReportTables.build(data, ReportLayout.TAP).rows[1]
            assertEquals("總水量未記錄", values[5]); assertEquals("需查標示", values[7]); assertTrue(values[4].contains("核對原用途"))
        }
    }
    @Test fun datePlotScopeAndUnassignedRecordsRemainSeparate() {
        val data = data(); data.getJSONArray("fieldPlots").put(JSONObject().put("id", "p").put("crop", "蔥"))
        val assigned = JSONObject(data.getJSONArray("records").getJSONObject(0).toString()).put("id", "assigned").put("plotId", "p").put("date", "2026-01-02")
        data.getJSONArray("records").put(assigned)
        val before = data.toString()
        val scope = ReportScope(from = "2026-01-02", plotId = "p", kind = "records")
        val report = ReportTables.build(scope.select(data), ReportLayout.USE)
        assertEquals(2, report.rows.size); assertEquals("蔥", report.rows[1][0]); assertEquals(before, data.toString())
    }
    @Test fun everyFormatEscapesFormulaCellsAndUsesCorrectColumnBoundary() {
        val data = data(); data.getJSONArray("records").getJSONObject(0).put("agent", "=HYPERLINK(\"TEST\")")
        for(layout in ReportLayout.entries) {
            val csv = ReportTables.csv(data, layout).toString(Charsets.UTF_8)
            // Integrated puts crop/pest before the agent; specialized cells start with the untrusted name.
            if(layout != ReportLayout.INTEGRATED) assertTrue(csv.contains("\"'=HYPERLINK"))
            val entries = mutableMapOf<String, String>()
            ZipInputStream(ByteArrayInputStream(NativeReports.xlsx(data, layout))).use { zip ->
                while(true) { val entry = zip.nextEntry ?: break; entries[entry.name] = zip.readBytes().toString(Charsets.UTF_8) }
            }
            val factory = DocumentBuilderFactory.newInstance().apply { setFeature("http://apache.org/xml/features/disallow-doctype-decl", true) }
            entries.values.forEach { factory.newDocumentBuilder().parse(ByteArrayInputStream(it.toByteArray())) }
            assertFalse(entries.values.any { it.contains("<f>") || it.contains("TargetMode=\"External\"") })
            val lastColumn = when(layout) { ReportLayout.INTEGRATED -> 'H'; ReportLayout.USE -> 'K'; ReportLayout.TAP -> 'J' }
            assertTrue(entries.getValue("xl/worksheets/sheet1.xml").contains("autoFilter ref=\"A1:${lastColumn}2\""))
            if(layout != ReportLayout.INTEGRATED) assertTrue(entries.getValue("xl/worksheets/sheet1.xml").contains(ReportTables.build(data, layout).note))
        }
    }
}
