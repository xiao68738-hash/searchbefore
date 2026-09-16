package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test

class NativeCoreTest {
    @Test fun importedHarvestDaysNeverRoundDownOrAssumeUnknownIsZero() {
        val r = JSONObject().put("date", "2026-01-01").put("phi", JSONObject.NULL)
        assertNull(Backup.harvestDate(r))
        assertEquals("2026-01-01", Backup.harvestDate(r.put("phi", 0)))
        assertEquals("2026-01-03", Backup.harvestDate(r.put("phi", 1.5)))
        assertNull(Backup.harvestDate(r.put("phi", -1)))
        assertNull(Backup.harvestDate(r.put("phi", 7).put("date", "2026-02-30")))
    }
    private fun sampleRow() = UsageRow(JSONObject().put("id", "usage_1").put("crop", "蔥")
        .put("pest", "夜蛾類").put("name", "測試藥劑").put("phi", JSONObject.NULL)
        .put("usage", JSONObject().put("label", "特殊用途").put("value", "依標示")))
    @Test fun nativePlotAndRecordRoundTripKeepsWebSchema() {
        val original = Backup.empty()
        val withPlot = Backup.addPlot(original, "蔥", "後院", "", listOf("蔥", "豌豆"))
        assertEquals(0, original.getJSONArray("fieldPlots").length())
        val plot = Backup.plots(withPlot).single()
        assertEquals("蔥", plot.getString("name"))
        assertEquals("後院", plot.getString("tag"))
        assertEquals("", plot.getString("plantDate")) // Do not invent a planting date.
        assertEquals("蔥 / 後院", Backup.plotLabel(plot))
        val saved = Backup.appendRecord(withPlot, sampleRow(), "2026-01-01", plot.getString("id"))
        assertEquals(0, withPlot.getJSONArray("records").length())
        val record = Backup.parse(Backup.encode(saved)).getJSONArray("records").getJSONObject(0)
        assertEquals(plot.getString("id"), record.getString("plotId"))
        assertTrue(record.isNull("phi"))
        assertTrue(Regex(".*\\.\\d{3}Z").matches(record.getString("updatedAt")))
    }
    @Test fun nativeCannotAttachRecordToAnotherCropOrMissingPlot() {
        val withPlot = Backup.addPlot(Backup.empty(), "豌豆", "一區", "", listOf("豌豆"))
        for (id in listOf("missing", Backup.plots(withPlot).single().getString("id"))) {
            assertTrue(runCatching { Backup.appendRecord(withPlot, sampleRow(), "2026-01-01", id) }.isFailure)
        }
        val unassigned = Backup.appendRecord(withPlot, sampleRow(), "2026-01-01", "")
        assertEquals("", unassigned.getJSONArray("records").getJSONObject(0).getString("plotId"))
        assertEquals(0, withPlot.getJSONArray("records").length())
    }
    @Test fun nativeRejectsInvalidPlotInputsWithoutChangingData() {
        val original = Backup.empty()
        for ((crop, tag, date) in listOf(Triple("洋蔥", "一區", ""), Triple("蔥", " ", ""),
            Triple("蔥", "長".repeat(121), ""), Triple("蔥", "一區", "2026-02-30"),
            Triple("蔥", "一區", java.time.LocalDate.now().plusDays(1).toString()))) {
            assertTrue(runCatching { Backup.addPlot(original, crop, tag, date, listOf("蔥")) }.isFailure)
        }
        assertEquals(0, original.getJSONArray("fieldPlots").length())
    }
    @Test fun dilutionUsesRegisteredMultiple() {
        assertEquals("1", Dilution.amount("1", "1,000"))
        assertEquals("20", Dilution.amount("20", "1000"))
        assertEquals("0.5", Dilution.amount("1", "2000"))
        for (bad in listOf("", "NaN", "-1", "0", "Infinity", "1e100")) assertNull(Dilution.amount(bad, "1000"))
        for (bad in listOf("--", "原液", "種子處理", "1000-2000", "0")) assertNull(Dilution.amount("1", bad))
        assertNull(Dilution.amount("0.00000001", "10000"))
    }
    @Test fun originalPestRegistrationsStaySeparate() {
        val root=JSONObject().put("dataVersion","2026-07-21")
        val rows=JSONArray()
        for ((id,pest) in listOf("a" to "夜蛾類","b" to "甜菜夜蛾")) rows.put(JSONObject().put("id",id).put("crop","蔥").put("pest",pest).put("name",id))
        root.put("rows",rows).put("related",JSONObject().put("蔥",JSONObject().put("甜菜夜蛾",JSONArray().put("夜蛾類")).put("夜蛾類",JSONArray().put("甜菜夜蛾"))))
        val c=Catalog(root.toString())
        assertEquals(listOf("b"), c.exact("蔥","甜菜夜蛾").map { it.name })
        assertEquals(listOf("夜蛾類"), c.related("蔥","甜菜夜蛾"))
        assertTrue(c.exact("洋蔥","甜菜夜蛾").isEmpty())
    }
    @Test fun backupRoundTripDropsAccountState() {
        val data=Backup.empty().put("syncEnabled",true).put("syncOwnerUid","should-not-import").put("token","should-not-import")
        val restored=Backup.parse(Backup.encode(data))
        assertFalse(restored.has("syncEnabled")); assertFalse(restored.has("syncOwnerUid")); assertFalse(restored.has("token"))
        assertEquals(0,restored.getJSONArray("records").length())
    }
    @Test fun backupKeepsOtherCollectionsWithoutPretendingToEditThem() {
        val data=Backup.empty()
        data.getJSONArray("fieldPlots").put(JSONObject().put("id","plot_a").put("name","田區一").put("crop","蔥"))
        data.getJSONArray("farmRecords").put(JSONObject().put("id","farm_a").put("plotId","plot_a").put("type","irrigation").put("details",JSONObject().put("water",10)))
        val result=Backup.parse(Backup.encode(data))
        assertEquals(10,result.getJSONArray("farmRecords").getJSONObject(0).getJSONObject("details").getInt("water"))
    }
    @Test fun malformedBackupCannotReplaceLocalData() {
        val data=Backup.empty()
        val record=JSONObject().put("id","r1").put("crop","蔥").put("agent","藥劑").put("date","2026-02-30").put("phi",JSONObject.NULL)
        data.getJSONArray("records").put(record)
        assertTrue(runCatching { Backup.parse(Backup.encode(data)) }.isFailure)
        record.put("date","2026-09-16").put("plotId","missing")
        assertTrue(runCatching { Backup.parse(Backup.encode(data)) }.isFailure)
        record.put("plotId","")
        data.getJSONArray("records").put(JSONObject(record.toString()))
        assertTrue(runCatching { Backup.parse(Backup.encode(data)) }.isFailure)
        assertTrue(runCatching { Backup.parse(ByteArray(Backup.MAX_BYTES+1)) }.isFailure)
        assertTrue(runCatching { Backup.parse(("[".repeat(10000)+"]".repeat(10000)).toByteArray()) }.isFailure)
    }
}
