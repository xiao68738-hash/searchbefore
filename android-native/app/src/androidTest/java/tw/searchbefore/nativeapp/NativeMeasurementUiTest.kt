package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.json.JSONObject
import org.junit.Rule
import org.junit.Test

class NativeMeasurementUiTest {
    @get:Rule val compose = createComposeRule()
    private fun row(kind: String) = UsageRow(JSONObject().put("formKind", kind).put("usage", JSONObject().put("canCalculateDilution", true)))
    @Test fun smallAmountWarningIsReadableWithoutSuggestingVolumeForPowder() {
        compose.setContent { SearchBeforeTheme { Column(Modifier.verticalScroll(rememberScrollState())) { MeasurementAdviceText(row("粉"), "0.05") } } }
        compose.onNodeWithText("每桶製品用量低於 0.1 g", substring = true).assertIsDisplayed()
        compose.onNodeWithText("容量對照", substring = true).assertDoesNotExist()
    }
    @Test fun liquidCapacityReferenceKeepsItsMeasuringToolWarningVisible() {
        compose.setContent { SearchBeforeTheme { Column(Modifier.verticalScroll(rememberScrollState())) { MeasurementAdviceText(row("液"), "1") } } }
        compose.onNodeWithText("不用一般瓶蓋或飲食餐具量藥", substring = true).performScrollTo().assertIsDisplayed()
    }
}
