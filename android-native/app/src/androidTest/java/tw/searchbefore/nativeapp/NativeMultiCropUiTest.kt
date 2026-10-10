package tw.searchbefore.nativeapp

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.junit4.StateRestorationTester
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class NativeMultiCropUiTest {
    @get:Rule val compose = createComposeRule()
    private fun catalog(secondPest: String = "夜蛾類") = Catalog(JSONObject().put("dataVersion", "TEST").put("related", JSONObject())
        .put("rows", JSONArray(listOf("蔥", "甘藍").mapIndexed { index, crop -> JSONObject().put("id", "TEST_$index")
            .put("crop", crop).put("pest", if(index == 0) "夜蛾類" else secondPest).put("name", "TEST_AGENT")
            .put("content", "10%").put("form", "水懸劑").put("bl", JSONArray(listOf("TEST_PRODUCT")))
            .put("phi", 7).put("usage", JSONObject().put("label", "稀釋倍數").put("value", "TEST_RATIO_$index")) })).toString())
    private fun scroll(text: String) { compose.onNodeWithTag("multiCropList").performScrollToNode(hasText(text)) }
    private fun add(crop: String) {
        scroll("新增比較作物")
        compose.onNodeWithText("新增比較作物").performTextInput(crop)
        compose.onNodeWithText("新增比較作物").performImeAction()
        scroll("加入比較：$crop"); compose.onNodeWithText("加入比較：$crop").performClick()
    }
    @Test fun comparisonRestoresSelectionAndOnlyOpensExplicitOriginalCrop() {
        val viewed = mutableListOf<UsageRow>(); val cat = catalog()
        val restoration = StateRestorationTester(compose)
        restoration.setContent { SearchBeforeTheme { MultiCropComparisonScreen(cat, true, {}, { viewed += it }) } }
        add("蔥"); add("甘藍")
        scroll("比較：夜蛾類"); compose.onNodeWithText("比較：夜蛾類").performClick()
        restoration.emulateSavedInstanceStateRestore()
        scroll("查看 甘藍 × 夜蛾類 原登記")
        compose.runOnIdle { assertTrue(viewed.isEmpty()) }
        compose.onNodeWithText("查看 甘藍 × 夜蛾類 原登記").performClick()
        compose.runOnIdle { assertEquals("甘藍", viewed.single().crop); assertEquals("夜蛾類", viewed.single().pest); assertEquals("TEST_1", viewed.single().id) }
    }
    @Test fun relatedPestsDoNotBecomeCommonResults() {
        var opens = 0; val cat = catalog("甜菜夜蛾")
        compose.setContent { SearchBeforeTheme { MultiCropComparisonScreen(cat, true, {}, { opens++ }) } }
        add("蔥"); add("甘藍")
        val message = "沒有共同原登記對象。請分別查詢，不以夜蛾類、甜菜夜蛾等相關名稱代替。"
        scroll(message); compose.onNodeWithText(message).assertIsDisplayed()
        compose.onNodeWithText("比較：夜蛾類").assertDoesNotExist()
        compose.runOnIdle { assertEquals(0, opens) }
    }
}
