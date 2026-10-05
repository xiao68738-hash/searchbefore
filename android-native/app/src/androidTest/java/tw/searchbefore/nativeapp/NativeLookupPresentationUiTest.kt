package tw.searchbefore.nativeapp

import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class NativeLookupPresentationUiTest {
    @get:Rule val compose = createComposeRule()
    private fun row() = UsageRow(JSONObject().put("id", "test").put("crop", "測試作物").put("pest", "測試對象")
        .put("name", "TEST_ONLY").put("content", "TEST").put("form", "TEST_FORM"))
    @Test fun groupedCropsDoNotSelectUntilExplicitOriginalUseClick() {
        val row = row(); var picked: UsageRow? = null
        compose.setContent {
            var expanded by remember { mutableStateOf(false) }
            SearchBeforeTheme { LazyColumn(Modifier.testTag("groupTest")) { item {
                AgentCropCard(AgentCropGroup(row.name, row.crop, listOf(row)), expanded, true, { expanded = !expanded }, { picked = it })
            } } }
        }
        compose.onNodeWithText("TEST_ONLY｜測試作物 × 測試對象", substring = true).assertDoesNotExist()
        compose.onNodeWithTag("agentCrop:TEST_ONLY:測試作物").performClick()
        compose.runOnIdle { assertNull(picked) }
        compose.onNodeWithText("TEST_ONLY｜測試作物 × 測試對象", substring = true).performScrollTo().performClick()
        compose.runOnIdle { assertEquals(row, picked) }
    }
    @Test fun overviewShowsResidueNoticeBeforeOriginalPestChoice() {
        var chosen = ""
        compose.setContent { SearchBeforeTheme { LazyColumn { item {
            CropOverviewCard("TEST_ONLY", listOf("測試對象"), listOf("殘留提醒：在測試作物可使用但不得檢出")) { chosen = it }
        } } } }
        compose.onNodeWithText("殘留提醒：在測試作物可使用但不得檢出").assertExists()
        compose.onNodeWithText("測試對象").performScrollTo().performClick()
        compose.runOnIdle { assertEquals("測試對象", chosen) }
    }
    @Test fun largeBrandListIsCollapsedSearchableAndDoesNotLoseNames() {
        val row = row().also { it.json.put("bl", JSONArray(listOf("TEST_A", "TEST_B", "TEST_C", "TEST_D", "TEST_E"))) }
        compose.setContent { SearchBeforeTheme { BrandNames(row) } }
        compose.onNodeWithText("TEST_E").assertDoesNotExist()
        compose.onNodeWithText("查看商品名稱（5 個）").performClick()
        compose.onNodeWithText("篩選商品名稱").performTextInput("TEST_E")
        compose.onNodeWithText("篩選商品名稱").performImeAction()
        compose.onNodeWithText("1／5 個").assertExists()
        compose.onNodeWithText("TEST_E", useUnmergedTree = true).assertExists()
        compose.onNodeWithText("TEST_A").assertDoesNotExist()
        compose.onNodeWithText("關閉商品清單").performClick()
        compose.onNodeWithText("TEST_ONLY的商品名稱").assertDoesNotExist()
    }
}
