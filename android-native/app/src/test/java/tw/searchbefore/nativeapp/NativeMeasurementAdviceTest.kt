package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeMeasurementAdviceTest {
    private fun row(kind: String = "液") = UsageRow(JSONObject().put("formKind", kind)
        .put("usage", JSONObject().put("canCalculateDilution", true)))
    @Test fun liquidCapacityReferenceHasExplicitScaleAndDoesNotClaimBottleCapsHaveFixedCapacity() {
        val advice = measurementAdvice(row(), "1")
        assertNull(advice.smallAmount)
        assertTrue(advice.volumeReference!!.contains("0.2 個 5 mL"))
        assertTrue(advice.volumeReference.contains("0.066667 個 15 mL"))
        assertTrue(advice.volumeReference.contains("不用一般瓶蓋或飲食餐具量藥"))
    }
    @Test fun smallDoseThresholdAppliesToBothKnownUnitsButPowderNeverUsesVolumeReference() {
        for(kind in listOf("液", "粉")) {
            val row = row(kind)
            assertTrue(measurementAdvice(row, "0.05").smallAmount!!.contains("0.1 ${row.unit}"))
            assertNull(measurementAdvice(row, "0.05").volumeReference)
            assertNull(measurementAdvice(row, "0.1").smallAmount)
        }
        assertNull(measurementAdvice(row("粉"), "15").volumeReference)
    }
    @Test fun invalidExcludedAndNonDilutionUsesHaveNoHintsAndSourceIsUnchanged() {
        val row = row(); val before = row.json.toString()
        for(amount in listOf(null, "", "0", "-1", "NaN", "0.3–0.5")) assertEquals(MeasurementAdvice(), measurementAdvice(row, amount))
        assertEquals(before, row.json.toString())
        assertEquals(MeasurementAdvice(), measurementAdvice(row("未知"), "1"))
        assertEquals(MeasurementAdvice(), measurementAdvice(UsageRow(JSONObject(row.json.toString()).put("formCategory", "excluded")), "1"))
        assertEquals(MeasurementAdvice(), measurementAdvice(UsageRow(JSONObject(row.json.toString()).put("usage", JSONObject().put("canCalculateDilution", false))), "1"))
    }
}
