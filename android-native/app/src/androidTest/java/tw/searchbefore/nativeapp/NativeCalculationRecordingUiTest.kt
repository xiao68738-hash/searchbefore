package tw.searchbefore.nativeapp

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.junit4.StateRestorationTester
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** No real save/login. The callback collects synthetic values only. */
class NativeCalculationRecordingUiTest {
    @get:Rule val compose = createComposeRule()
    private fun row() = UsageRow(JSONObject().put("id", "test").put("crop", "測試作物").put("pest", "測試對象")
        .put("name", "TEST_ONLY").put("formKind", "液").put("dilution", "1000").put("dose", "0.3-0.5公升")
        .put("usage", JSONObject().put("label", "稀釋倍數").put("value", "1000倍").put("canCalculateDilution", true)))
    private fun reveal(text: String): SemanticsNodeInteraction {
        val list = compose.onNodeWithTag("calculationList")
        list.performScrollToNode(hasText(text))
        val node = compose.onNodeWithText(text)
        repeat(8) {
            if(runCatching { node.assertIsDisplayed() }.isSuccess) return node
            list.performTouchInput { swipeUp(startY = height * .75f, endY = height * .45f) }
        }
        return node.assertIsDisplayed()
    }
    @Test fun cancelAndRestoreNeverSaveAndEditingClearsConfirmation() {
        var calls = 0; var actual: ApplicationDetails? = null
        val restoration = StateRestorationTester(compose)
        restoration.setContent { SearchBeforeTheme { CalculationScreen(row(), true, {}, { _, _ -> }, Backup.empty(),
            record = { _, _, _, details, confirmed -> assertTrue(confirmed); calls++; actual = details; true }) } }
        reveal("每桶水量（公升）").performTextReplacement("20")
        reveal("本次桶數（整數）").performTextReplacement("3")
        compose.onNodeWithText("本次桶數（整數）").performImeAction()
        reveal("帶入實際施藥確認").performClick()
        compose.onNodeWithText("確認並儲存實際用藥").assertIsNotEnabled()
        compose.onNodeWithText("取消，不儲存").performClick()
        compose.runOnIdle { assertEquals(0, calls) }
        reveal("帶入實際施藥確認").performClick()
        val amount = compose.onNodeWithText("本次製品總用量（不是有效成分量）")
        amount.performScrollTo().performTextReplacement("55")
        compose.onNodeWithTag("confirmActualApplication").performScrollTo().performClick()
        compose.onNodeWithText("確認並儲存實際用藥").assertIsEnabled()
        amount.performScrollTo().performTextReplacement("54")
        compose.onNodeWithText("確認並儲存實際用藥").assertIsNotEnabled()
        restoration.emulateSavedInstanceStateRestore()
        compose.onNodeWithText("確認計算帶入的實際施藥").assertExists()
        compose.runOnIdle { assertEquals(0, calls) }
        compose.onNodeWithTag("confirmActualApplication").performScrollTo().assertIsOff().performClick()
        compose.onNodeWithText("確認並儲存實際用藥").performClick()
        compose.runOnIdle { assertEquals(1, calls); assertEquals(ApplicationDetails(water = "20", totalWater = "60", amount = "54", unit = "mL"), actual) }
        compose.onNodeWithText("確認計算帶入的實際施藥").assertDoesNotExist()
    }
    @Test fun areaRangeDoesNotPrefillActualTotals() {
        var actual: ApplicationDetails? = null
        compose.setContent { SearchBeforeTheme { CalculationScreen(row(), true, {}, { _, _ -> }, Backup.empty(),
            record = { _, _, _, details, _ -> actual = details; true }) } }
        reveal("按面積換算").performClick()
        reveal("施用面積（平方公尺）").performTextReplacement("100")
        compose.onNodeWithText("施用面積（平方公尺）").performImeAction()
        reveal("帶入實際施藥確認").performClick()
        compose.onNodeWithText("面積試算參考", substring = true).assertExists()
        compose.runOnIdle { assertNull(actual) }
        compose.onNodeWithTag("confirmActualApplication").performScrollTo().performClick()
        compose.onNodeWithText("確認並儲存實際用藥").performClick()
        compose.runOnIdle { assertEquals(ApplicationDetails(water = "1"), actual) }
    }
    @Test fun futureDateAndFailedSaveKeepTheFormWithoutLosingInput() {
        var calls = 0
        val row = row(); val draft = CalculationRecording.tanks(row, "20", "1")!!
        compose.setContent { SearchBeforeTheme { CalculationRecordDialog(row, Backup.empty(), draft, true, {}) { _, _, _, _ -> calls++; false } } }
        compose.onNodeWithText("實際施藥日期 YYYY-MM-DD").performScrollTo().performTextReplacement("9999-01-01")
        compose.onNodeWithTag("confirmActualApplication").performScrollTo().performClick()
        compose.onNodeWithText("確認並儲存實際用藥").assertIsNotEnabled()
        compose.runOnIdle { assertEquals(0, calls) }
        compose.onNodeWithText("實際施藥日期 YYYY-MM-DD").performScrollTo().performTextReplacement("2020-01-01")
        compose.onNodeWithTag("confirmActualApplication").performScrollTo().performClick()
        compose.onNodeWithText("確認並儲存實際用藥").performClick()
        compose.onNodeWithText("紀錄檢查未通過，尚未儲存；請確認田區及用量後重試。").assertExists()
        compose.onNodeWithText("確認計算帶入的實際施藥").assertExists()
        compose.runOnIdle { assertEquals(1, calls) }
    }
}
