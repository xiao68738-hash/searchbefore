package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

/** Synthetic UI only; no Google login, real cloud records or device-state mutations. */
class NativeBrandUiTest {
    @get:Rule val compose = createComposeRule()
    private fun row(seed: Boolean = false) = UsageRow(JSONObject().put("id", "visual-test")
        .put("name", "測試藥劑").put("crop", "小麥").put("pest", "測試對象")
        .put("phi", JSONObject.NULL).put("seed", seed).put("formKind", "液").put("dilution", "1000")
        .put("usage", JSONObject().put("label", if(seed) "特殊用途" else "稀釋倍數")
            .put("value", if(seed) "種子處理，依產品標示" else "1000 倍").put("canCalculateDilution", !seed))
        .put("mrl", JSONObject().put("status", "reviewed-no-detect"))
        .put("note", "測試用附註，應保持可讀。"))

    @Test fun narrowLargeTextKeepsWarningsAndExplicitActions() {
        var records = 0
        compose.setContent {
            val density = LocalDensity.current.density
            CompositionLocalProvider(LocalDensity provides Density(density, 1.5f)) {
                SearchBeforeTheme { Column(Modifier.width(300.dp).verticalScroll(rememberScrollState())) {
                    UsageCard(row(), true, {}, { records++ })
                } }
            }
        }
        compose.onNodeWithText("測試藥劑").assertIsDisplayed()
        compose.onNodeWithText("請查產品標示").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("殘留提醒：在小麥可使用但不得檢出").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("測試用附註，應保持可讀。").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("配藥計算").performScrollTo().performClick()
        compose.onNodeWithText("每桶水量（公升）").performScrollTo().assertIsDisplayed()
        compose.runOnIdle { assertEquals(0, records) }
        compose.onNodeWithText("紀錄用藥").performScrollTo().performClick()
        compose.runOnIdle { assertEquals(1, records) }
    }

    @Test fun seedUsageNeverInventsDilutionOrCalculation() {
        compose.setContent { SearchBeforeTheme { Column(Modifier.verticalScroll(rememberScrollState())) {
            UsageCard(row(seed = true), true, {}, {})
        } } }
        compose.onNodeWithText("種子處理，依產品標示").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("不適用").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("配藥計算").assertDoesNotExist()
        compose.onNodeWithText("--倍", substring = true).assertDoesNotExist()
        compose.onNodeWithText("殘留提醒：在小麥可使用但不得檢出").performScrollTo().assertIsDisplayed()
    }

    @Test fun legalLinksOnlyOpenFixedPublicPagesAfterAnExplicitTap() {
        val opened = mutableListOf<NativePublicPage>()
        compose.setContent { SearchBeforeTheme { Column(Modifier.verticalScroll(rememberScrollState())) {
            NativeLegalLinks(true) { opened.add(it) }
        } } }
        compose.runOnIdle { assertEquals(0, opened.size) }
        compose.onNodeWithText("隱私權政策").performScrollTo().performClick()
        compose.onNodeWithText("申請刪除帳號與雲端資料").performScrollTo().performClick()
        compose.runOnIdle { assertEquals(listOf(NativePublicPage.PRIVACY, NativePublicPage.DELETION), opened) }
    }
}
