package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Isolated callbacks only: never writes a user's recipes or use records. */
class NativeCardActionsUiTest {
    @get:Rule val compose = createComposeRule()
    private fun row(excluded: Boolean = false) = UsageRow(JSONObject().put("id", "card-test")
        .put("name", "TEST_ONLY").put("crop", "測試作物").put("pest", "測試對象")
        .put("phi", JSONObject.NULL).put("formKind", "液").put("dilution", "1000")
        .put("formCategory", if(excluded) "excluded" else "matched")
        .put("usage", JSONObject().put("label", "稀釋倍數").put("value", "1000 倍").put("canCalculateDilution", true)))

    @Test fun quickRecipeNeedsConfirmationRejectsBadWaterAndNeverRecordsUse() {
        val saved = mutableListOf<String>(); var records = 0; var calculations = 0
        val row = row(); val original = row.json.toString()
        compose.setContent { SearchBeforeTheme { Column(Modifier.verticalScroll(rememberScrollState())) {
            UsageCard(row, true, { saved.add(it) }, { records++ }, onCalculate = { calculations++ })
        } } }
        compose.onNodeWithText("存入配方").performScrollTo().performClick()
        compose.runOnIdle { assertTrue(saved.isEmpty()); assertEquals(0, records) }
        compose.onNodeWithText("取消").performClick()
        compose.onNodeWithText("存入配方").performScrollTo().performClick()
        compose.onNodeWithText("配方每桶水量（公升）").performTextReplacement("0")
        compose.onNodeWithText("確認存入配方").assertIsNotEnabled()
        compose.onNodeWithText("配方每桶水量（公升）").performTextReplacement("2e6")
        compose.onNodeWithText("確認存入配方").assertIsNotEnabled()
        compose.onNodeWithText("配方每桶水量（公升）").performTextReplacement("5")
        compose.onNodeWithText("確認存入配方").performClick()
        compose.runOnIdle {
            assertEquals(listOf("5"), saved); assertEquals(0, records); assertEquals(0, calculations)
            assertEquals(original, row.json.toString())
        }
    }

    @Test fun excludedRegistrationCannotBeSavedOrCalculated() {
        compose.setContent { SearchBeforeTheme { Column(Modifier.verticalScroll(rememberScrollState())) {
            UsageCard(row(excluded = true), true, { fail("Excluded recipe") }, { fail("Excluded record") })
        } } }
        compose.onNodeWithText("存入配方").assertDoesNotExist()
        compose.onNodeWithText("配藥計算").assertDoesNotExist()
        compose.onNodeWithText("收藏此用途").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("紀錄用藥").performScrollTo().assertIsNotEnabled()
    }
}
