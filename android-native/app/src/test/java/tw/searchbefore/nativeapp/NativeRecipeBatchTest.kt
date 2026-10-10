package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeRecipeBatchTest {
    @Test fun independentUnitsNoMutationAndNoSharedTotal() {
        val liquid = JSONObject().put("unit", "ml").put("dil", 1000).put("water", 1)
        val powder = JSONObject().put("unit", "g").put("dil", 2000).put("water", 2)
        val before = liquid.toString() to powder.toString()
        assertEquals(TankAmounts("20", "60", "60"), recipeBatchAmounts(liquid, "20", "3"))
        assertEquals(TankAmounts("10", "60", "30"), recipeBatchAmounts(powder, "20", "3"))
        assertEquals(before, liquid.toString() to powder.toString())
    }
    @Test fun rejectsInvalidSavedDataAndUnsafeInputs() {
        listOf(JSONObject(), JSONObject().put("unit", "kg").put("dil", 1000),
            JSONObject().put("unit", "ml").put("dil", 0)).forEach { assertNull(recipeBatchAmounts(it, "20", "3")) }
        val recipe = JSONObject().put("unit", "ml").put("dil", 1000)
        listOf("0", "-1", "1.5", "10001", "1e3", "NaN").forEach { assertNull(recipeBatchAmounts(recipe, "20", it)) }
        listOf("0", "-1", "1e3", "0.0000001", "NaN").forEach { assertNull(recipeBatchAmounts(recipe, it, "1")) }
        assertNull(recipeBatchAmounts(recipe, "1000000", "2"))
    }
}
