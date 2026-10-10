package tw.searchbefore.nativeapp

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class NativeRecipeReferenceUiTest {
    @get:Rule val compose = createComposeRule()
    private fun row() = UsageRow(JSONObject().put("id", "TEST_SEED").put("crop", "豌豆").put("pest", "TEST_PEST")
        .put("name", "TEST_AGENT").put("phi", JSONObject.NULL).put("note", "TEST_CURRENT_NOTE").put("bl", JSONArray())
        .put("usage", JSONObject().put("label", "用途").put("value", "種子處理").put("detail", "TEST_DETAIL").put("canCalculateDilution", false)))
    @Test fun viewingCurrentSpecialUseDoesNotOpenCalculatorOrSaveRecord() {
        val data = Recipes.addReference(Backup.empty(), row()); val before = data.toString()
        val catalog = Catalog(JSONObject().put("dataVersion", "TEST").put("related", JSONObject()).put("rows", JSONArray().put(row().json)).toString())
        var saves = 0; var launches = 0
        compose.setContent { SearchBeforeTheme { RecipesScreen(data, true, { saves++ }, {}, catalog, { _, _ -> launches++ }) } }
        compose.onNodeWithTag("recipesList").performScrollToNode(hasText("查看現行用途與注意事項"))
        compose.onNodeWithText("查看現行用途與注意事項").performClick()
        compose.onNodeWithTag("referenceOptions").performScrollToNode(hasText("TEST_CURRENT_NOTE"))
        compose.onNodeWithText("TEST_CURRENT_NOTE").assertIsDisplayed()
        compose.onNodeWithText("關閉用途查閱").performClick()
        compose.runOnIdle { assertEquals(0, saves); assertEquals(0, launches); assertEquals(before, data.toString()) }
    }
    @Test fun referenceCanEditNoteWithoutShowingWaterAndCancelKeepsOriginal() {
        val data = Recipes.addReference(Backup.empty(), row()); var saves = 0
        compose.setContent { SearchBeforeTheme { RecipesScreen(data, true, { saves++ }, {}) } }
        compose.onNodeWithTag("recipesList").performScrollToNode(hasText("調整商品名／備註"))
        compose.onNodeWithText("調整商品名／備註").performClick()
        compose.onNodeWithText("每桶水量（公升）").assertDoesNotExist()
        compose.onNodeWithText("備註").performScrollTo().performTextInput("TEST_NEW_NOTE")
        compose.onNodeWithText("取消").performClick()
        compose.runOnIdle { assertEquals(0, saves); assertEquals("", Recipes.rows(data).single().getString("note")) }
    }
}
