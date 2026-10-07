package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class NativeRecordHubUiTest {
    @get:Rule val compose = createComposeRule()

    @Test fun webEntryPointsNavigateWithoutChangingRecords() {
        val data = Backup.empty()
        val original = data.toString()
        val destinations = mutableListOf<Int>()
        compose.setContent { SearchBeforeTheme { Column(Modifier.width(320.dp)) { RecordHub(data, true) { destinations.add(it) } } } }
        listOf("田區新增／田區管理", "農務與設備紀錄", "用藥歷史／匯出用藥紀錄").forEach {
            compose.onNodeWithText(it).performScrollTo().assertHasClickAction().performClick()
        }
        compose.runOnIdle { assertEquals(listOf(0, 1, 3), destinations); assertEquals(original, data.toString()) }
    }

    @Test fun useExportRetainsRecordsOnlyAndTapLayoutUntilExplicitAction() {
        val calls = mutableListOf<Triple<ReportScope, ReportLayout, String>>()
        compose.setContent { SearchBeforeTheme { Column(Modifier.width(320.dp).verticalScroll(rememberScrollState())) {
            NativeUseReports(Backup.empty(), true) { scope, layout, format -> calls.add(Triple(scope, layout, format)) }
        } } }
        compose.runOnIdle { assertEquals(0, calls.size) }
        compose.onNodeWithText("匯出 Excel").performScrollTo().performClick()
        compose.onNodeWithText("TAP 對照表 PDF").performScrollTo().performClick()
        compose.runOnIdle {
            assertEquals(2, calls.size)
            assertEquals(Triple(ReportScope(kind = "records"), ReportLayout.USE, "xlsx"), calls[0])
            assertEquals(Triple(ReportScope(kind = "records"), ReportLayout.TAP, "pdf"), calls[1])
        }
    }
}
