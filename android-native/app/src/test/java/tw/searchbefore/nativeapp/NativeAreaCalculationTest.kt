package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeAreaCalculationTest {
    private fun row(dose: String = "0.3-0.5公升", kind: String = "液") = UsageRow(JSONObject()
        .put("formKind", kind).put("dilution", "1000").put("dose", dose)
        .put("usage", JSONObject().put("canCalculateDilution", true)))

    @Test fun preservesBothBoundsAndDoesNotRoundUpTanksOrMutate() {
        val row = row()
        val before = row.json.toString()
        assertEquals(AreaAmounts("20", "3～5", "3～5", "0.15～0.25"), areaAmounts(row, "20", "100", AreaUnit.SQUARE_METER))
        assertEquals(areaAmounts(row, "20", "100", AreaUnit.SQUARE_METER), areaAmounts(row, "20", "0.01", AreaUnit.HECTARE))
        assertEquals(before, row.json.toString())
        assertEquals(AreaAmounts("1", "300", "300", "300"), areaAmounts(row("0.3公升"), "1", "1", AreaUnit.HECTARE))
    }

    @Test fun acceptsOnlyCompleteCompatibleMassOrVolumeUnits() {
        listOf("0.3-0.5公斤", "300～500公克", "300-500g", "0.3~0.5kg").forEach { dose ->
            assertEquals("3～5", areaAmounts(row(dose, "粉"), "20", "100", AreaUnit.SQUARE_METER)?.agentTotal)
        }
        listOf("0.3-0.5 公升", "300–500毫升", "300-500ml", "300-500mL", "0.3至0.5L").forEach { dose ->
            assertEquals("3～5", areaAmounts(row(dose), "20", "100", AreaUnit.SQUARE_METER)?.agentTotal)
        }
        listOf("", "-", "0.3", "0.3公升/株", "每桶0.3公升", "0.3公升（分2次）", "1-0.3公升", "-1公升", "0公升",
            "1e3公升", "1,0公升", "0.3公斤", "0.3公升及0.2公斤", "1000001毫升").forEach { assertNull(it, hectareDose(row(it))) }
        assertNull(hectareDose(row("0.3公升", "粉")))
    }

    @Test fun blocksSpecialUsesExcludedFormsAndInvalidInputs() {
        listOf(row().also { it.json.put("seed", true) }, row().also { it.json.put("formCategory", "excluded") },
            row().also { it.json.getJSONObject("usage").put("isSpecial", true) },
            row().also { it.json.getJSONObject("usage").put("canCalculateDilution", false) }).forEach {
            assertNull(areaAmounts(it, "20", "100", AreaUnit.SQUARE_METER))
        }
        listOf("", "0", "-1", "NaN", "1e9", "10000000", "0.0000001").forEach {
            assertNull(areaAmounts(row(), "20", it, AreaUnit.SQUARE_METER))
            assertNull(areaAmounts(row(), it, "100", AreaUnit.SQUARE_METER))
        }
        assertNull(areaAmounts(row(), "20", "0.000001", AreaUnit.SQUARE_METER))
        assertNull(areaAmounts(row(), "20", "10001", AreaUnit.HECTARE))
        assertNull(areaAmounts(row(), "20", "10000", AreaUnit.HECTARE)) // total water cap
    }
}
