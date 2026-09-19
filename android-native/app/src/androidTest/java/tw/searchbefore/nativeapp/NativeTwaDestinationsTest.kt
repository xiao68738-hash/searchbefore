package tw.searchbefore.nativeapp

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import java.time.LocalDate
import androidx.test.platform.app.InstrumentationRegistry
import android.graphics.Bitmap
import java.io.File

/** Synthetic, emulator-only acceptance: no login, Firestore or real account data. */
class NativeTwaDestinationsTest {
    @get:Rule val compose = createComposeRule()
    private fun showResult(list: String, text: String) {
        compose.onNodeWithTag(list).performScrollToNode(hasText(text))
        val target = compose.onNodeWithText(text)
        // LazyColumn scroll-to-node aligns the containing item, not necessarily this text.
        // Tall cards + the keyboard can leave its lower rows outside the viewport.
        for(attempt in 0 until 6) {
            if(runCatching { target.assertIsDisplayed() }.isSuccess) break
            compose.onNodeWithTag(list).performTouchInput { swipeUp(startY = height * 0.75f, endY = height * 0.45f) }
        }
        target.assertIsDisplayed()
    }
    private fun captureSynthetic(name: String) {
        compose.waitForIdle()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        instrumentation.waitForIdleSync()
        android.os.SystemClock.sleep(250)
        val folder = File(instrumentation.targetContext.cacheDir, "native-validation/synthetic").apply { mkdirs() }
        val bitmap = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
        File(folder, name).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }
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
        compose.onNodeWithText("本次桶數（整數）").performImeAction()
        showResult("calculationList", "本次總藥量：60 mL")
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

    @Test fun areaKeepsRangeAndClearsValueOnUnitChange() {
        var saves = 0
        val row = UsageRow(JSONObject().put("id", "area-test").put("crop", "測試作物").put("pest", "測試對象")
            .put("name", "TEST_ONLY").put("formKind", "液").put("dilution", "1000").put("dose", "0.3-0.5公升")
            .put("usage", JSONObject().put("label", "稀釋倍數").put("value", "1000倍").put("canCalculateDilution", true)))
        compose.setContent { SearchBeforeTheme { CalculationScreen(row, true, {}, { _, _ -> saves++ }) } }
        compose.onNodeWithTag("calculationList").performScrollToNode(hasText("按面積換算"))
        compose.onNodeWithText("按面積換算").performClick()
        compose.onNodeWithTag("calculationList").performScrollToNode(hasText("施用面積（平方公尺）"))
        compose.onNodeWithText("施用面積（平方公尺）").performTextReplacement("100")
        compose.onNodeWithText("施用面積（平方公尺）").performImeAction()
        showResult("calculationList", "全區藥劑製品：3～5 mL")
        captureSynthetic("area-range.png")
        compose.onNodeWithTag("calculationList").performScrollToNode(hasText("公頃", substring = false))
        compose.onNodeWithText("公頃", substring = false).performClick()
        compose.onNodeWithText("全區藥劑製品：3～5 mL").assertDoesNotExist()
        compose.onNodeWithTag("calculationList").performScrollToNode(hasText("存成常用配方"))
        compose.onNodeWithText("存成常用配方").assertIsNotEnabled()
        compose.runOnIdle { assertEquals(0, saves) }
    }

    @Test fun multiRecipePreviewDoesNotSaveAndKeepsUnitsSeparate() {
        var saves = 0
        val data = JSONObject().put("recipes", JSONArray()
            .put(JSONObject().put("crop", "測試").put("agent", "TEST_LIQUID").put("unit", "ml").put("dil", 1000).put("water", 1))
            .put(JSONObject().put("crop", "測試").put("agent", "TEST_POWDER").put("unit", "g").put("dil", 2000).put("water", 2)))
        val before = data.toString()
        compose.setContent { SearchBeforeTheme { RecipesScreen(data, true, { saves++ }, {}) } }
        compose.onNodeWithTag("recipesList").performScrollToNode(hasText("多筆獨立換算"))
        compose.onNodeWithText("多筆獨立換算").performClick()
        compose.onNodeWithTag("recipesList").performScrollToNode(hasText("試算每桶水量（公升）"))
        compose.onNodeWithText("試算每桶水量（公升）").performTextReplacement("20")
        compose.onNodeWithTag("recipesList").performScrollToNode(hasText("各配方分別試算桶數"))
        compose.onNodeWithText("各配方分別試算桶數").performTextReplacement("3")
        compose.onNodeWithText("各配方分別試算桶數").performImeAction()
        showResult("recipesList", "本筆合計：60 mL／60 公升水")
        showResult("recipesList", "本筆合計：30 g／60 公升水")
        captureSynthetic("recipe-batch.png")
        compose.runOnIdle { assertEquals(0, saves); assertEquals(before, data.toString()) }
    }
}
