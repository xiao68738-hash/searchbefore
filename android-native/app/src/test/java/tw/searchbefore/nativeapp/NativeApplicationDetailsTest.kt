package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeApplicationDetailsTest {
    private fun row() = UsageRow(JSONObject().put("id", "seed_1").put("crop", "豌豆").put("pest", "種子處理").put("name", "測試用資材")
        .put("phi", JSONObject.NULL).put("usage", JSONObject().put("canCalculateDilution", false)))
    @Test fun missingIsNotZeroAndSpecialUseNeverInventsDilution() {
        val d = Backup.appendRecord(Backup.empty(), row(), "2026-01-01", "")
        val r = d.getJSONArray("records").getJSONObject(0)
        assertFalse(r.getBoolean("waterRecorded")); assertEquals(0.0, r.getDouble("dil"), 0.0)
        assertTrue(ApplicationDetails.summary(r).contains("未記錄"))
    }
    @Test fun actualAmountsRoundTripAndPreserveUnknownFields() {
        val details = ApplicationDetails("2.5", "0.125", "g", " 測試者 ", "種子處理，不是推薦用法", "5")
        val d = Backup.appendRecord(Backup.empty(), row(), "2026-01-01", "", details)
        val r = d.getJSONArray("records").getJSONObject(0); r.put("legacy", "保留")
        val edited = Backup.updateRecord(d, r.getString("id"), r.getString("updatedAt"), "2026-01-02", "", "乙", details.copy(amount = "1.25"))
        val result = Backup.parse(Backup.encode(edited)).getJSONArray("records").getJSONObject(0)
        assertEquals("1.25", result.getString("actualAmount")); assertEquals("g", result.getString("actualAmountUnit"))
        assertEquals("乙", result.getString("operator")); assertEquals("保留", result.getString("legacy"))
        assertEquals(5.0, result.getDouble("totalWater"), 0.0); assertEquals("種子處理，不是推薦用法", result.getString("notes"))
        assertEquals(0.0, result.getDouble("dil"), 0.0); assertEquals("0.125", r.getString("actualAmount"))
    }
    @Test fun rejectsInvalidNumericUnitsAndOversizeInput() {
        for(raw in listOf("-1", "NaN", "Infinity", "1e3", "1,000", "1.0000001", "10000001", ".5")) assertTrue(runCatching { ApplicationDetails(water = raw).validate() }.isFailure)
        for(d in listOf(ApplicationDetails(amount = "1"), ApplicationDetails(unit = "g"), ApplicationDetails(amount = "1", unit = "倍"), ApplicationDetails(notes = "字".repeat(2001)), ApplicationDetails(operator = "字".repeat(121)))) assertTrue(runCatching { d.validate() }.isFailure)
    }
    @Test fun explicitZeroAndClearingStayDistinct() {
        val r = ApplicationDetails("0", "0", "mL").applyTo(JSONObject())
        assertTrue(r.getBoolean("waterRecorded")); assertEquals("0", r.getString("actualAmount"))
        ApplicationDetails().applyTo(r)
        assertFalse(r.getBoolean("waterRecorded")); assertEquals("", r.getString("actualAmount"))
        val tiny=Backup.appendRecord(Backup.empty(),row(),"2026-01-01","",ApplicationDetails(water="0.000001",totalWater="0.000001"))
        assertEquals("0.000001",ApplicationDetails.from(tiny.getJSONArray("records").getJSONObject(0)).water)
    }
    @Test fun staleEditIsRejectedEvenWhenOnlyAmountChanged() {
        val d=Backup.appendRecord(Backup.empty(), row(), "2026-01-01", "")
        val r=d.getJSONArray("records").getJSONObject(0)
        val next=Backup.updateRecord(d,r.getString("id"),r.getString("updatedAt"),"2026-01-01","","",ApplicationDetails(amount="1",unit="g"))
        assertTrue(runCatching { Backup.updateRecord(next,r.getString("id"),r.getString("updatedAt"),"2026-01-01","","",ApplicationDetails(amount="2",unit="g")) }.isFailure)
        assertTrue(Farm.table(next)[1][4].contains("1 g"))
    }
}
