package tw.searchbefore.nativeapp

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import java.time.LocalDate

/** Synthetic, emulator-only acceptance: no login, Firestore or real account data. */
class NativeTwaDestinationsTest {
    @get:Rule val compose = createComposeRule()
    @Test fun batchCalculationRequiresExplicitSaveAndKeepsPerTankRecipe() {
        var saved = ""
        val row = UsageRow(JSONObject().put("id", "test").put("crop", "測試作物").put("pest", "測試對象")
            .put("name", "TEST_ONLY").put("formKind", "液").put("dilution", "1000")
            .put("usage", JSONObject().put("label", "稀釋倍數").put("value", "1000倍").put("canCalculateDilution", true)))
        compose.setContent { SearchBeforeTheme { CalculationScreen(row, true, {}, { _, water -> saved = water }) } }
        compose.onNodeWithTag("calculationList").performScrollToNode(hasText("每桶水量（公升）"))
        compose.onNodeWithText("每桶水量（公升）").performTextReplacement("20")
        compose.onNodeWithTag("calculationList").performScrollToNode(hasText("本次桶數（整數）"))
        compose.onNodeWithText("本次桶數（整數）").performTextReplacement("3")
        compose.onNodeWithTag("calculationList").performScrollToNode(hasText("本次總藥量：60 mL"))
        compose.onNodeWithText("本次總藥量：60 mL").assertIsDisplayed()
        compose.runOnIdle { assertEquals("", saved) }
        compose.onNodeWithTag("calculationList").performScrollToNode(hasText("存成常用配方"))
        compose.onNodeWithText("存成常用配方").performClick()
        compose.runOnIdle { assertEquals("20", saved) }
    }

    @Test fun calendarAllowsMonthNavigationWithoutSavingData() {
        val data = JSONObject().put("records", JSONArray()).put("fieldPlots", JSONArray())
        val before = data.toString()
        compose.setContent { SearchBeforeTheme { CountdownScreen(data, true, LocalDate.of(2026, 9, 18)) {} } }
        compose.onNodeWithTag("countdownList").performScrollToNode(hasText("日曆"))
        compose.onNodeWithText("日曆").performClick()
        compose.onNodeWithTag("countdownList").performScrollToNode(hasText("2026 年 9 月"))
        compose.onNodeWithText("下月").performClick()
        compose.onNodeWithText("2026 年 10 月").assertExists()
        compose.onNodeWithTag("countdownList").performScrollToNode(hasContentDescription("2026-10-15，0項事件"))
        // The grid has its own horizontal scroller. Scroll the outer list with a real vertical gesture;
        // performScrollTo() otherwise targets only the nearest (horizontal) scroll ancestor.
        val date = compose.onNodeWithContentDescription("2026-10-15，0項事件")
        for(attempt in 0 until 4) {
            if(runCatching { date.assertIsDisplayed() }.isSuccess) break
            compose.onNodeWithTag("countdownList").performTouchInput { swipeUp() }
        }
        date.assertIsDisplayed().performClick()
        compose.onNodeWithTag("countdownList").performScrollToNode(hasText("2026-10-15 明細"))
        compose.onNodeWithText("2026-10-15 明細").assertIsDisplayed()
        compose.onNodeWithTag("countdownList").performScrollToNode(hasText("這天沒有事件；不代表可採收。"))
        compose.onNodeWithText("這天沒有事件；不代表可採收。").assertIsDisplayed()
        compose.runOnIdle { assertEquals(before, data.toString()) }
    }
}
