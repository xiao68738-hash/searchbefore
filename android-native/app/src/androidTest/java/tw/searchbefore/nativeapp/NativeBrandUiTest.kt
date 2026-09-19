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

    @Test fun overviewUsesFullWidthAndKeepsRelatedTargetsSeparateAtLargeText() {
        val selected = mutableListOf<String>()
        compose.setContent {
            val density = LocalDensity.current.density
            CompositionLocalProvider(LocalDensity provides Density(density, 1.5f)) {
                SearchBeforeTheme { Column(Modifier.width(300.dp).verticalScroll(rememberScrollState())) {
                    CropOverviewCard("測試藥劑", listOf("夜蛾類", "甜菜夜蛾", "夜蛾類")) { selected.add(it) }
                } }
            }
        }
        compose.onNodeWithTag("cropOverviewCard").assertWidthIsEqualTo(300.dp)
        compose.onNodeWithText("原登記防治對象").assertIsDisplayed()
        compose.onAllNodesWithText("夜蛾類").assertCountEquals(1)
        compose.onNodeWithText("夜蛾類").performScrollTo().assertHeightIsAtLeast(48.dp).performClick()
        compose.onNodeWithText("甜菜夜蛾").performScrollTo().assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals(listOf("夜蛾類", "甜菜夜蛾"), selected) }
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

    @Test fun separateCalculatorRejectsExcludedFormWithoutSavingAnything() {
        var saved = 0
        val excluded = row().copy(json = row().json.put("formCategory", "excluded"))
        compose.setContent { SearchBeforeTheme { CalculationScreen(excluded, true, {}, { _, _ -> saved++ }) } }
        compose.onNodeWithTag("calculationList").performScrollToNode(hasText("此用法不提供稀釋計算"))
        compose.onNodeWithText("每桶水量（公升）").assertDoesNotExist()
        compose.onNodeWithText("存成常用配方").assertDoesNotExist()
        compose.runOnIdle { assertEquals(0, saved) }
    }

    @Test fun sixDestinationsRemainReadableAtLargeText() {
        compose.setContent {
            val density = LocalDensity.current.density
            CompositionLocalProvider(LocalDensity provides Density(density, 1.5f)) {
                SearchBeforeTheme { Column(Modifier.width(300.dp)) { TwaNavigation(0, true) {} } }
            }
        }
        listOf("查詢", "計算", "配方", "倒數", "紀錄", "個人").forEach {
            compose.onNodeWithText(it).assertIsDisplayed().assertHasClickAction()
        }
    }

    @Test fun compactChromeKeepsMigrationAndAllSixAccessibleTargetsAtLargeText() {
        var migrated = false
        var selected = -1
        compose.setContent {
            val density = LocalDensity.current.density
            CompositionLocalProvider(LocalDensity provides Density(density, 1.5f)) {
                SearchBeforeTheme { Column {
                    BrandHeader(true, compact = true) { migrated = true }
                    TwaNavigation(0, true, compact = true) { selected = it }
                } }
            }
        }
        compose.onNodeWithText("噴前查").assertIsDisplayed()
        compose.onNodeWithText("舊版資料移轉").assertIsDisplayed().performClick()
        compose.runOnIdle { org.junit.Assert.assertTrue(migrated) }
        listOf("查詢", "計算", "配方", "倒數", "紀錄", "個人").forEachIndexed { index, title ->
            compose.onNodeWithText(title).assertIsDisplayed().assertHeightIsAtLeast(48.dp).performClick()
            compose.runOnIdle { assertEquals(index, selected) }
        }
        val headerBounds = compose.onNodeWithTag("brandHeader").getUnclippedBoundsInRoot()
        val navigationBounds = compose.onNodeWithTag("mainNavigation").getUnclippedBoundsInRoot()
        org.junit.Assert.assertTrue(headerBounds.bottom - headerBounds.top <= 96.dp)
        org.junit.Assert.assertTrue(navigationBounds.bottom - navigationBounds.top <= 64.dp)
    }
}
