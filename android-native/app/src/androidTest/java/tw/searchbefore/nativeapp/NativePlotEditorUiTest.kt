package tw.searchbefore.nativeapp

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.junit4.StateRestorationTester
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class NativePlotEditorUiTest {
    @get:Rule val compose = createComposeRule()
    @Test fun customCropRequiresChoiceAndDraftSurvivesRecreationUntilExplicitSave() {
        val saved = mutableListOf<PlotDraft>(); var dismisses = 0
        val restoration = StateRestorationTester(compose)
        restoration.setContent { SearchBeforeTheme { PlotEditorDialog(listOf("蔥"), null, true, { dismisses++ }) { saved += it; true } } }
        compose.onNodeWithText("作物名稱").performScrollTo().performTextInput("TEST_CUSTOM")
        compose.onNodeWithText("作物名稱").performImeAction()
        compose.onNodeWithText("儲存田區").assertIsNotEnabled()
        compose.onNode(isToggleable()).performScrollTo().performClick()
        compose.onNodeWithText("品種（可留空）").performScrollTo().performTextInput("TEST_VARIETY")
        compose.onNodeWithText("品種（可留空）").performImeAction()
        restoration.emulateSavedInstanceStateRestore()
        compose.runOnIdle { assertTrue(saved.isEmpty()); assertEquals(0, dismisses) }
        compose.onNodeWithText("儲存田區").assertIsEnabled().performClick()
        compose.runOnIdle {
            assertEquals("TEST_CUSTOM", saved.single().crop); assertEquals("TEST_VARIETY", saved.single().variety)
            assertTrue(saved.single().custom); assertEquals("", saved.single().plantDate); assertEquals(1, dismisses)
        }
    }
    @Test fun invalidDateIsNotTruncatedIntoValidDateAndCancelDoesNotSave() {
        var saves = 0; var dismisses = 0
        compose.setContent { SearchBeforeTheme { PlotEditorDialog(listOf("蔥"), null, true, { dismisses++ }) { saves++; true } } }
        compose.onNodeWithText("作物名稱").performScrollTo().performTextInput("蔥")
        compose.onNodeWithText("種植日期 YYYY-MM-DD（可留空）").performScrollTo().performTextInput("2026-01-010")
        compose.onNodeWithText("種植日期 YYYY-MM-DD（可留空）").performImeAction()
        compose.onNodeWithText("儲存田區").assertIsNotEnabled()
        compose.onNodeWithText("取消").performClick()
        compose.runOnIdle { assertEquals(0, saves); assertEquals(1, dismisses) }
    }
}
