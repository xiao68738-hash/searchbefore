package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.Column
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.junit4.StateRestorationTester
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class NativeCalendarExportUiTest {
    @get:Rule val compose = createComposeRule()
    private fun data(phi: Any) = Backup.empty().put("fieldPlots", JSONArray().put(JSONObject().put("id", "a").put("crop", "TEST_CROP")))
        .put("records", JSONArray().put(JSONObject().put("id", "r").put("plotId", "a").put("crop", "TEST_CROP").put("date", "2026-09-01").put("phi", phi)))
    @Test fun exportRequiresConfirmationAndCancellationOrRecreationDoesNotWrite() {
        val calls = mutableListOf<String>(); val data = data(3); val before = data.toString()
        val restoration = StateRestorationTester(compose)
        restoration.setContent { SearchBeforeTheme { Column { CalendarExportButton(data, "a", true) { calls += it } } } }
        compose.onNodeWithText("匯出行事曆提醒（.ics）").performClick()
        restoration.emulateSavedInstanceStateRestore()
        compose.onNodeWithText("匯出行事曆快照？").assertIsDisplayed()
        compose.runOnIdle { assertTrue(calls.isEmpty()) }
        compose.onNodeWithText("取消匯出").performClick()
        compose.runOnIdle { assertTrue(calls.isEmpty()) }
        compose.onNodeWithText("匯出行事曆提醒（.ics）").performClick()
        compose.onNodeWithText("我了解，選擇儲存位置").performClick()
        compose.runOnIdle { assertEquals(listOf("a"), calls); assertEquals(before, data.toString()) }
    }
    @Test fun unknownWaitDoesNotOfferADueDateExport() {
        var calls = 0
        compose.setContent { SearchBeforeTheme { Column { CalendarExportButton(data(JSONObject.NULL), "a", true) { calls++ } } } }
        compose.onNodeWithText("匯出行事曆提醒（.ics）").assertIsNotEnabled()
        compose.onNodeWithText("0 組已知等待期（含歷史）；1 組未知不建立到期提醒。匯出檔不會自動更新。").assertIsDisplayed()
        compose.runOnIdle { assertEquals(0, calls) }
    }
}
