package tw.searchbefore.nativeapp

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Rule
import org.junit.Test

/** Read-only smoke tests. Never click login, sync, import, save or delete on a connected device. */
class NativeNavigationTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private fun ready() {
        compose.waitUntil(timeoutMillis = 60000) { compose.onAllNodesWithText("按作物查").fetchSemanticsNodes().isNotEmpty() }
    }
    @Test fun exactRegistrationAndRelatedLinkRemainSeparate() {
        ready()
        compose.onNodeWithText("作物名稱，例如：蔥").performTextInput("蔥")
        compose.onNode(hasText("蔥") and hasClickAction() and !hasSetTextAction()).performClick()
        compose.onNodeWithTag("queryList").performScrollToNode(hasText("甜菜夜蛾　1 筆登記用法"))
        compose.onNodeWithText("甜菜夜蛾　1 筆登記用法").performClick()
        compose.onNodeWithText("蔥 × 甜菜夜蛾").assertExists()
        compose.onNodeWithTag("queryList").performScrollToNode(hasText("也要看看蔥 × 夜蛾類用藥嗎？"))
        compose.onNodeWithText("也要看看蔥 × 夜蛾類用藥嗎？").performClick()
        compose.onNodeWithText("蔥 × 夜蛾類").assertExists()
    }
    @Test fun fiveNativeTabsAndActivityRecreationWorkWithoutLogin() {
        ready()
        compose.onNodeWithText("農務", useUnmergedTree = true).performClick()
        compose.onNodeWithText("新增農務紀錄").assertExists()
        compose.onNodeWithText("配方", useUnmergedTree = true).performClick()
        compose.onNodeWithText("常用配方").assertExists()
        compose.onNodeWithText("個人", useUnmergedTree = true).performClick()
        compose.onNodeWithText("你的資料").assertExists()
        compose.activityRule.scenario.recreate()
        compose.waitUntil(timeoutMillis = 60000) { compose.onAllNodesWithText("你的資料").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("紀錄", useUnmergedTree = true).performClick()
        compose.onNodeWithText("新增田區／種植批次").assertExists()
    }
}
