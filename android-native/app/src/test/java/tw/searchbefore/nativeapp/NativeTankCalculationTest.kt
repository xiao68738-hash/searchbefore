package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeTankCalculationTest {
    private fun row() = UsageRow(JSONObject().put("formKind", "液").put("dilution", "1000")
        .put("usage", JSONObject().put("canCalculateDilution", true)))

    @Test fun scalesWaterAndAgentWithoutMutatingRegistration() {
        val row = row()
        val before = row.json.toString()
        assertEquals(TankAmounts("20", "60", "60"), tankAmounts(row, "20", "3"))
        assertEquals(TankAmounts("0.5", "1", "1"), tankAmounts(row, "0.5", "2"))
        assertEquals(before, row.json.toString())
    }

    @Test fun rejectsInvalidCountsWaterOverflowAndNonCalculableUses() {
        listOf("", "0", "-1", "1.5", "10001", "NaN", "1e3").forEach { assertNull(tankAmounts(row(), "20", it)) }
        listOf("0", "-1", "NaN", "1e999999", "1000001", "0.0000001").forEach { assertNull(tankAmounts(row(), it, "1")) }
        assertNull(tankAmounts(row(), "1000000", "2"))
        assertNull(tankAmounts(row().also { it.json.put("formCategory", "excluded") }, "20", "1"))
        assertNull(tankAmounts(row().also { it.json.getJSONObject("usage").put("canCalculateDilution", false) }, "20", "1"))
    }
}
