package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.junit4.StateRestorationTester
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class NativeRecordDraftUiTest {
    @get:Rule val compose = createComposeRule()
    private fun catalog() = Catalog(JSONObject().put("dataVersion", "TEST").put("rows", JSONArray()).put("related", JSONObject()).toString())
    @Test fun editedActualUseSurvivesRecreationAndRejectsOverlongDateBeforeExplicitSave() {
        val data = Backup.empty().apply {
            getJSONArray("records").put(JSONObject().put("id", "TEST_RECORD").put("crop", "TEST_CROP").put("agent", "TEST_AGENT")
                .put("date", "2020-01-01").put("updatedAt", "2020-01-01T00:00:00.000Z").put("phi", 7)
                .put("operator", "TEST_OPERATOR").put("notes", "TEST_ORIGINAL_NOTE"))
        }
        var calls = 0; var saved: ApplicationDetails? = null; var savedDate = ""
        val restoration = StateRestorationTester(compose)
        restoration.setContent { SearchBeforeTheme { RecordsScreen(data, catalog(), true, { false },
            { _, _, date, _, details -> calls++; saved = details; savedDate = date }, { _, _, _ -> false }, { _, _, _ -> }, {}) } }
        compose.onNodeWithTag("recordsList").performScrollToNode(hasText("修改實際用藥紀錄"))
        compose.onNodeWithText("修改實際用藥紀錄").performClick()
        compose.onNodeWithText("施用方式／商品名／實際操作備註").performScrollTo().performTextReplacement("TEST_DRAFT_NOTE")
        compose.onNodeWithText("實際施藥日期 YYYY-MM-DD").performScrollTo().performTextReplacement("2020-01-020")
        compose.onNodeWithText("儲存修改").assertIsNotEnabled()
        restoration.emulateSavedInstanceStateRestore()
        compose.onNodeWithText("修改用藥紀錄").assertIsDisplayed()
        compose.onNodeWithText("儲存修改").assertIsNotEnabled()
        compose.runOnIdle { assertEquals(0, calls) }
        compose.onNodeWithText("實際施藥日期 YYYY-MM-DD").performScrollTo().performTextReplacement("2020-01-02")
        compose.onNodeWithText("儲存修改").performClick()
        compose.runOnIdle { assertEquals(1, calls); assertEquals("2020-01-02", savedDate); assertEquals("TEST_DRAFT_NOTE", saved?.notes); assertEquals("TEST_OPERATOR", saved?.operator) }
    }
    @Test fun overlongAmountMustNotBeTruncatedToDifferentValidNumber() {
        var calls = 0
        compose.setContent { SearchBeforeTheme { Column(Modifier.verticalScroll(rememberScrollState())) {
            var details by remember { mutableStateOf(ApplicationDetails(unit = "g")) }
            ApplicationFields(details) { details = it }
            Button(enabled = runCatching { details.validate() }.isSuccess, onClick = { calls++ }) { Text("TEST_SAVE") }
        } } }
        compose.onNodeWithText("本次製品總用量（不是有效成分量）").performScrollTo().performTextReplacement("000000000000000000001")
        compose.onNodeWithText("TEST_SAVE").performScrollTo().assertIsNotEnabled()
        compose.runOnIdle { assertEquals(0, calls) }
    }
    @Test fun overlongRecordFilterDateRemainsInvalidInsteadOfChangingSearchRange() {
        var filter by mutableStateOf(RecordFilter())
        compose.setContent { SearchBeforeTheme { Column(Modifier.verticalScroll(rememberScrollState())) { RecordFilterFields(filter, true) { filter = it } } } }
        for(label in listOf("紀錄起日 YYYY-MM-DD（可留空）", "紀錄迄日 YYYY-MM-DD（可留空）")) {
            compose.onNodeWithText(label).performScrollTo().performTextReplacement("2020-01-010")
            compose.onNodeWithText(label).performImeAction()
            compose.runOnIdle { assertTrue(runCatching { filter.validate(Backup.empty()) }.isFailure) }
            compose.onNodeWithText("清除日期、文字與類型篩選").performScrollTo().performClick()
        }
    }
}
