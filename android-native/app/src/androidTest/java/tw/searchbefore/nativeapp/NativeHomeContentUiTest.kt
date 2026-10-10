package tw.searchbefore.nativeapp

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Rule
import org.junit.Test

/** Public, read-only content. Run only on the disposable CI preview device. */
class NativeHomeContentUiTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private fun reveal(text: String): SemanticsNodeInteraction {
        val list = compose.onNodeWithTag("queryList")
        list.performScrollToNode(hasText(text))
        val node = compose.onNodeWithText(text)
        repeat(8) {
            if(runCatching { node.assertIsDisplayed() }.isSuccess) return node
            list.performTouchInput { swipeUp(startY = height * .75f, endY = height * .45f) }
        }
        return node.assertIsDisplayed()
    }
    @Test fun homeShowsAllPublicFeaturesAndFourOfflineGuidesWithoutSigningIn() {
        compose.waitUntil(timeoutMillis = 60000) {
            compose.onAllNodesWithTag("queryList").fetchSemanticsNodes().isNotEmpty()
        }
        reveal("核心功能").assertIsDisplayed()
        homeFeatures.forEach { (title, description) ->
            reveal(title).assertIsDisplayed()
            reveal(description).assertIsDisplayed()
        }
        reveal("施藥前先弄懂的四件事").assertIsDisplayed()
        reveal("先核對作物、防治對象、倍數與採收期").assertIsDisplayed()
        reveal("用一桶水示範單位與公式，不靠猜").assertIsDisplayed()
        reveal("從最後一次施藥重新核對可採日期").assertIsDisplayed()
        reveal("人、天氣、器材與周邊環境一次檢查").assertIsDisplayed()
        reveal("施藥前防護清單").performClick()
        compose.onNodeWithTag("offlineGuide").assertIsDisplayed()
        compose.onNodeWithText("關閉指南").performClick()
        compose.onNodeWithTag("offlineGuide").assertDoesNotExist()
        compose.activityRule.scenario.recreate()
        reveal("核心功能").assertIsDisplayed()
    }
}
