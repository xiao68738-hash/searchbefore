package tw.searchbefore.nativeapp

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import org.junit.Rule
import org.junit.Test

/** Disposable emulator only. No account, recording, backup import, or cloud operations. */
class NativeQueryParityTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private fun ready() = compose.waitUntil(timeoutMillis = 60000) {
        compose.onAllNodesWithTag("queryList").fetchSemanticsNodes().isNotEmpty()
    }
    private fun reveal(matcher: SemanticsMatcher, tag: String = "queryList"): SemanticsNodeInteraction {
        val list = compose.onNodeWithTag(tag)
        list.performScrollToNode(matcher)
        val node = compose.onNode(matcher)
        repeat(8) {
            if(runCatching { node.assertIsDisplayed() }.isSuccess) return node
            list.performTouchInput { swipeUp(startY = height * .75f, endY = height * .45f) }
        }
        return node.assertIsDisplayed()
    }
    private fun crop(value: String) {
        ready()
        reveal(hasTestTag("catalogSearch")).performTextInput(value)
        compose.onNodeWithTag("catalogSearch").performImeAction()
        reveal(hasText(value) and hasClickAction() and !hasSetTextAction()).performClick()
    }
    @Test fun taxonomyFilterKeepsOriginalPestAndPhiFilterSurvivesRecreation() {
        crop("蔥")
        reveal(hasText("篩選病蟲害或分類，例：夜蛾科")).performTextInput("夜蛾科")
        compose.onNodeWithText("篩選病蟲害或分類，例：夜蛾科").performImeAction()
        reveal(hasTestTag("pest:甜菜夜蛾")).performClick()
        compose.onNodeWithText("蔥 × 甜菜夜蛾").assertIsDisplayed()
        reveal(hasText("≤ 21 天")).performClick()
        reveal(hasText("≤ 21 天")).assertIsSelected()
        reveal(hasText("≤ 3 天")).performClick()
        compose.onNodeWithText("自選天數").performScrollTo().performClick()
        compose.onNodeWithText("自選採收期（1～365 天）").performTextReplacement("366")
        compose.onNodeWithText("套用天數").performClick()
        compose.onNodeWithText("請輸入 1～365 的整數天數。").assertIsDisplayed()
        compose.onNodeWithText("自選採收期（1～365 天）").performTextReplacement("3650")
        compose.onNodeWithText("套用天數").performClick()
        compose.onNodeWithText("請輸入 1～365 的整數天數。").assertIsDisplayed()
        compose.onNodeWithText("取消").performClick()
        compose.activityRule.scenario.recreate()
        ready()
        reveal(hasText("≤ 3 天")).assertIsSelected()
        reveal(hasText("也要看看蔥 × 夜蛾類用藥嗎？")).performClick()
        compose.onNodeWithText("蔥 × 夜蛾類").assertIsDisplayed()
        reveal(hasText("全部") and hasClickAction()).assertIsSelected()
    }
    @Test fun specialUsesStartCollapsedAndRetainPurposeWithoutFakeDilution() {
        crop("豌豆")
        // Find the actual registration; don't manufacture a pesticide record.
        val catalog = Catalog(compose.activity.assets.open("catalog.json").bufferedReader().use { it.readText() })
        val registration = catalog.rows.first { it.crop == "豌豆" && it.name == "脫克松" }
        reveal(hasTestTag("pest:${registration.pest}")).performClick()
        compose.onNodeWithText("脫克松").assertDoesNotExist()
        reveal(hasText("展開特殊施用方式", substring = true) and hasClickAction()).performClick()
        reveal(hasText("脫克松")).assertIsDisplayed()
        reveal(hasText("施用用途")).assertIsDisplayed()
        compose.onNodeWithText("--倍", substring = true).assertDoesNotExist()
    }
    @Test fun overviewSearchAndReverseLookupRetainDrugScope() {
        crop("蔥")
        reveal(hasText("收合總覽") and hasClickAction()).assertExists()
        reveal(hasText("篩選藥劑或病蟲害")).performTextInput("畢芬寧")
        compose.onNodeWithText("篩選藥劑或病蟲害").performImeAction()
        reveal(hasText("畢芬寧") and !hasSetTextAction()).assertIsDisplayed()
        reveal(hasText("以藥劑找作物") and hasClickAction()).performClick()
        reveal(hasTestTag("catalogSearch")).performTextInput("脫克松")
        compose.onNodeWithTag("catalogSearch").performImeAction()
        reveal(hasTestTag("agentCrop:脫克松:豌豆")).performClick()
        reveal(hasText("脫克松｜豌豆 ×", substring = true) and hasClickAction()).performClick()
        reveal(hasText("目前只看：脫克松")).assertIsDisplayed()
        reveal(hasText("查看此作物／防治對象的全部藥劑")).performClick()
        compose.onNodeWithText("目前只看：脫克松").assertDoesNotExist()
    }
    @Test fun invalidReportScopeDisablesReportsButNotCompleteBackup() {
        ready()
        compose.onNodeWithText("個人", useUnmergedTree = true).performClick()
        reveal(hasText("報表起日 YYYY-MM-DD（可留空）"), "personalList").performTextInput("2026-10-05")
        compose.onNodeWithText("報表起日 YYYY-MM-DD（可留空）").performImeAction()
        reveal(hasText("報表迄日 YYYY-MM-DD（可留空）"), "personalList").performTextInput("2026-10-01")
        compose.onNodeWithText("報表迄日 YYYY-MM-DD（可留空）").performImeAction()
        reveal(hasText("匯出 Excel 報表"), "personalList").assertIsNotEnabled()
        reveal(hasText("匯出完整備份"), "personalList").assertIsEnabled()
        compose.activityRule.scenario.recreate()
        compose.waitUntil(timeoutMillis = 60000) { compose.onAllNodesWithTag("personalList").fetchSemanticsNodes().isNotEmpty() }
        reveal(hasText("匯出 Excel 報表"), "personalList").assertIsNotEnabled()
        reveal(hasText("清除報表篩選"), "personalList").performClick()
        reveal(hasText("匯出 Excel 報表"), "personalList").assertIsEnabled()
        reveal(hasText("報表起日 YYYY-MM-DD（可留空）"), "personalList").performTextReplacement("2026-01-010")
        compose.onNodeWithText("報表起日 YYYY-MM-DD（可留空）").performImeAction()
        reveal(hasText("匯出 Excel 報表"), "personalList").assertIsNotEnabled()
        reveal(hasText("匯出完整備份"), "personalList").assertIsEnabled()
    }
}
