package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate

class NativeCalculationRecordingTest {
    private fun row(powder: Boolean = false) = UsageRow(JSONObject().put("id", "test-registration").put("crop", "測試作物")
        .put("pest", "測試對象").put("name", "TEST_ONLY").put("formKind", if(powder) "粉" else "液")
        .put("dilution", "1000").put("phi", 7).put("dose", if(powder) "0.3-0.5公斤" else "0.3-0.5公升")
        .put("usage", JSONObject().put("canCalculateDilution", true)))
    @Test fun tankDraftKeepsTotalAndPerTankDistinctAndDoesNotMutate() {
        val row = row(); val before = row.json.toString()
        val draft = requireNotNull(CalculationRecording.tanks(row, "20", "3"))
        assertEquals(ApplicationDetails(water = "20", totalWater = "60", amount = "60", unit = "mL"), draft.details)
        assertTrue(draft.reference.contains("不是實際施用證明"))
        assertEquals(before, row.json.toString())
    }
    @Test fun powderNeverTurnsIntoVolumeAndFractionalWaterIsPreserved() {
        assertEquals(ApplicationDetails(water = "0.5", totalWater = "1", amount = "1", unit = "g"),
            CalculationRecording.tanks(row(true), "0.500", "2")!!.details)
    }
    @Test fun areaRangeIsReferenceOnlyAndNeverChoosesAnEndpoint() {
        for(powder in listOf(false, true)) {
            val draft = CalculationRecording.area(row(powder), "20", "100", AreaUnit.SQUARE_METER)!!
            assertEquals(ApplicationDetails(water = "20"), draft.details)
            assertTrue(draft.reference.contains("3～5"))
            assertEquals("", draft.details.amount); assertEquals("", draft.details.totalWater); assertEquals("", draft.details.unit)
        }
    }
    @Test fun scalarAreaEstimateAlsoNeedsActualTotalsFromUser() {
        val row = row().also { it.json.put("dose", "0.3公升") }
        assertEquals(ApplicationDetails(water = "20"), CalculationRecording.area(row, "20", "100", AreaUnit.SQUARE_METER)!!.details)
    }
    @Test fun invalidOrSpecialUsesCannotCreateCalculatorDrafts() {
        for(bad in listOf("0", "-1", "NaN", "1e20", "0.0000001")) assertNull(CalculationRecording.tanks(row(), bad, "1"))
        assertNull(CalculationRecording.tanks(row(), "20", "1.5"))
        assertNull(CalculationRecording.area(row(), "20", "0", AreaUnit.SQUARE_METER))
        val cases = listOf(row().also { it.json.put("seed", true) }, row().also { it.json.put("formCategory", "excluded") },
            row().also { it.usage.put("isSpecial", true) }, row().also { it.usage.put("canCalculateDilution", false) })
        cases.forEach { assertNull(CalculationRecording.tanks(it, "20", "1")); assertNull(CalculationRecording.area(it, "20", "100", AreaUnit.SQUARE_METER)) }
    }
    @Test fun onlyConfirmedEditedActualValuesAreSavedAndSourceIsUntouched() {
        val data = Backup.empty(); val before = data.toString(); val date = LocalDate.now().toString()
        val actual = ApplicationDetails(water = "20", totalWater = "40", amount = "39", unit = "mL", notes = "TEST_ONLY")
        assertTrue(runCatching { CalculationRecording.append(data, row(), date, "", actual, false) }.isFailure)
        val saved = CalculationRecording.append(data, row(), date, "", actual, true).getJSONArray("records").getJSONObject(0)
        assertEquals(actual, ApplicationDetails.from(saved))
        assertEquals("test-registration", saved.getString("registrationId"))
        assertEquals(before, data.toString())
    }
    @Test fun changedPlotFutureDateAndInvalidUnitsAreRejectedWithoutMutation() {
        val data = Backup.addPlot(Backup.empty(), "其他作物", "TEST_ONLY", "", listOf("其他作物"))
        val before = data.toString(); val plot = data.getJSONArray("fieldPlots").getJSONObject(0).getString("id")
        val date = LocalDate.now().toString()
        assertTrue(runCatching { CalculationRecording.append(data, row(), date, plot, ApplicationDetails(), true) }.isFailure)
        assertTrue(runCatching { CalculationRecording.append(data, row(), date, "deleted", ApplicationDetails(), true) }.isFailure)
        assertTrue(runCatching { CalculationRecording.append(data, row(), LocalDate.now().plusDays(1).toString(), "", ApplicationDetails(), true) }.isFailure)
        assertTrue(runCatching { CalculationRecording.append(data, row(), date, "", ApplicationDetails(amount = "1", unit = "unknown"), true) }.isFailure)
        assertEquals(before, data.toString())
    }
    @Test fun confirmationDoesNotBypassNonCalculableOrExcludedUse() {
        val row = row().also { it.json.put("formCategory", "excluded") }
        assertTrue(runCatching { CalculationRecording.append(Backup.empty(), row, LocalDate.now().toString(), "", ApplicationDetails(), true) }.isFailure)
    }
}
