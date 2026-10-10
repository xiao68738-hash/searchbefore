package tw.searchbefore.nativeapp

import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.junit4.StateRestorationTester
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class NativeReportLayoutUiTest {
    @get:Rule val compose = createComposeRule()
    @Test fun explicitTapSelectionRestoresAndDisplaysReferenceWarning() {
        var clicks = 0; val restoration = StateRestorationTester(compose)
        restoration.setContent { SearchBeforeTheme {
            var name by rememberSaveable { mutableStateOf(ReportLayout.INTEGRATED.name) }
            ReportLayoutFields(ReportLayout.parse(name), true) { name = it.name; clicks++ }
        } }
        compose.onNodeWithText("TAP 登打參考").performClick()
        restoration.emulateSavedInstanceStateRestore()
        compose.onNodeWithText("TAP 登打參考").assertIsSelected()
        compose.onNodeWithText("僅協助登打，不是官方表單、驗證證明或直接匯入檔；請依現行 TAP 欄位及產品標示核對。").assertExists()
        compose.runOnIdle { assertEquals(1, clicks) }
    }
    @Test fun disabledFormatsCannotChangeSelection() {
        var clicks = 0
        compose.setContent { SearchBeforeTheme { ReportLayoutFields(ReportLayout.USE, false) { clicks++ } } }
        compose.onNodeWithText("TAP 登打參考").assertIsNotEnabled().performClick()
        compose.onNodeWithText("用藥自主紀錄").assertIsSelected()
        compose.runOnIdle { assertEquals(0, clicks) }
    }
}
