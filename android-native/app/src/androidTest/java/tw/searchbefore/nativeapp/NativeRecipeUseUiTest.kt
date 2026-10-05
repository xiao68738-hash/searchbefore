package tw.searchbefore.nativeapp

import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class NativeRecipeUseUiTest {
    @get:Rule val compose = createComposeRule()
    private fun catalog() = Catalog(JSONObject().put("dataVersion", "TEST_ONLY").put("related", JSONObject())
        .put("rows", JSONArray().put(JSONObject().put("id", "current").put("crop", "測試作物").put("pest", "測試對象")
            .put("name", "TEST_ONLY").put("content", "TEST").put("form", "TEST_FORM").put("formKind", "液").put("phi", JSONObject.NULL)
            .put("dilution", "2000").put("usage", JSONObject().put("label", "稀釋倍數").put("value", "2000倍").put("canCalculateDilution", true)))).toString())
    private fun reveal(list: String, matcher: SemanticsMatcher): SemanticsNodeInteraction {
        val container = compose.onNodeWithTag(list)
        container.performScrollToNode(matcher)
        val target = compose.onNode(matcher)
        repeat(8) {
            if(runCatching { target.assertIsDisplayed() }.isSuccess) return target
            container.performTouchInput { swipeUp(startY = height * .75f, endY = height * .45f) }
        }
        return target.assertIsDisplayed()
    }
    @Test fun legacyRecipeNeedsSelectionAndNeverWritesDataOrUsesSavedRatio() {
        val catalog = catalog()
        val data = Backup.empty().put("recipes", JSONArray().put(JSONObject().put("crop", "測試作物").put("pest", "測試對象")
            .put("agent", "TEST_ONLY").put("water", 20).put("dil", 1000).put("unit", "ml")))
        val before = data.toString(); var writes = 0; var selected: UsageRow? = null; var water = ""
        compose.setContent { SearchBeforeTheme { RecipesScreen(data, true, { writes++ }, { fail(it) }, catalog,
            use = { row, amount -> selected = row; water = amount }) } }
        reveal("recipesList", hasText("核對原登記並使用")).performClick()
        compose.runOnIdle { assertNull(selected); assertEquals(0, writes) }
        compose.onNodeWithText("取消，不帶入").performClick()
        compose.runOnIdle { assertNull(selected) }
        reveal("recipesList", hasText("核對原登記並使用")).performClick()
        reveal("recipeUseOptions", hasText("稀釋倍數：2000倍")).assertIsDisplayed()
        reveal("recipeUseOptions", hasTestTag("useRecipe:current:")).performClick()
        compose.runOnIdle {
            assertEquals("20", water); assertEquals("10", selected!!.amount(water)); assertEquals(0, writes); assertEquals(before, data.toString())
        }
    }
    @Test fun newLaunchResetsTankAreaAndDraftButUsesRecipeWater() {
        val row = catalog().rows.first()
        var launch by mutableStateOf("first")
        var initial by mutableStateOf("20")
        compose.setContent { SearchBeforeTheme { CalculationScreen(row, true, {}, { _, _ -> }, initialWater = initial, launchKey = launch) } }
        reveal("calculationList", hasText("本次桶數（整數）")).performTextReplacement("3")
        compose.onNodeWithText("本次桶數（整數）").performImeAction()
        reveal("calculationList", hasText("本次總水量：60 公升")).assertIsDisplayed()
        compose.runOnIdle { initial = "5"; launch = "second" }
        reveal("calculationList", hasText("本次總水量：5 公升")).assertIsDisplayed()
        reveal("calculationList", hasText("本次桶數（整數）")).assertTextContains("1")
        reveal("calculationList", hasText("每桶水量（公升）")).assertTextContains("5")
    }
}
