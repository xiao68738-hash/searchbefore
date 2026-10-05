package tw.searchbefore.nativeapp

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.junit4.StateRestorationTester
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class NativeFarmParityUiTest {
    @get:Rule val compose = createComposeRule()
    private fun reveal(tag: String, text: String): SemanticsNodeInteraction {
        val list = compose.onNodeWithTag(tag)
        list.performScrollToNode(hasText(text))
        val node = compose.onNodeWithText(text)
        repeat(8) {
            if(runCatching { node.assertIsDisplayed() }.isSuccess) return node
            list.performTouchInput { swipeUp(startY = height * .75f, endY = height * .45f) }
        }
        return node.assertIsDisplayed()
    }
    @Test fun timelineSearchAndInvalidDateSurviveRecreationWithoutWrites() {
        val data = Backup.empty().put("farmRecords", JSONArray().put(JSONObject().put("id", "synthetic").put("date", "2026-01-01")
            .put("type", "equipmentMaintenance").put("details", JSONObject().put("equipment", JSONArray().put("TEST_MACHINE")).put("actions", JSONArray().put("TEST_ACTION")))))
        val before = data.toString()
        val restoration = StateRestorationTester(compose)
        restoration.setContent { SearchBeforeTheme { TimelineScreen(data, true) {} } }
        reveal("timelineList", "搜尋紀錄、資材、操作者或備註").performTextInput("TEST_MACHINE")
        compose.onNodeWithText("搜尋紀錄、資材、操作者或備註").performImeAction()
        reveal("timelineList", "篩選結果 1 筆；依實際日期由新到舊，不修改原紀錄。").assertIsDisplayed()
        reveal("timelineList", "紀錄起日 YYYY-MM-DD（可留空）").performTextReplacement("2026-02-30")
        compose.onNodeWithText("紀錄起日 YYYY-MM-DD（可留空）").performImeAction()
        restoration.emulateSavedInstanceStateRestore()
        reveal("timelineList", "日期請使用有效的 YYYY-MM-DD").assertIsDisplayed()
        reveal("timelineList", "清除日期、文字與類型篩選").performClick()
        reveal("timelineList", "篩選結果 1 筆；依實際日期由新到舊，不修改原紀錄。").assertIsDisplayed()
        compose.runOnIdle { assertEquals(before, data.toString()) }
    }
    @Test fun farmDraftSurvivesRecreationAndCancelDoesNotSave() {
        var writes = 0
        val restoration = StateRestorationTester(compose)
        restoration.setContent { SearchBeforeTheme { FarmScreen(Backup.empty(), true, { writes++ }, {}, {}) } }
        reveal("farmList", "新增農務紀錄").performClick()
        compose.onNodeWithText("器具／機械／設備管理").performScrollTo().performClick()
        compose.onNodeWithText("設備（多項以、分隔）（必填）").performScrollTo().performTextInput("TEST_MACHINE")
        restoration.emulateSavedInstanceStateRestore()
        compose.onNodeWithText("設備（多項以、分隔）（必填）").assertTextContains("TEST_MACHINE")
        compose.runOnIdle { assertEquals(0, writes) }
        compose.onNodeWithText("取消").performClick()
        compose.runOnIdle { assertEquals(0, writes) }
    }
}
