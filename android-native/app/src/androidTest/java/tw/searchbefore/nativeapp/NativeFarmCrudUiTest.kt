package tw.searchbefore.nativeapp

import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** All data are synthetic, callbacks remain local, and no account or real farm records are touched. */
class NativeFarmCrudUiTest {
    @get:Rule val compose = createComposeRule()
    private fun fixture() = Backup.empty().apply {
        getJSONArray("fieldPlots").put(JSONObject().put("id", "TEST_PLOT").put("crop", "TEST_CROP"))
        put("activePlotId", "TEST_PLOT")
    }
    private fun field(label: String, value: String) {
        compose.onNodeWithText(label).performScrollTo().performTextReplacement(value)
        compose.onNodeWithText(label).performImeAction()
    }
    private fun scroll(text: String) = compose.onNodeWithTag("farmList").performScrollToNode(hasText(text))
    private fun cycle(type: String) {
        var data by mutableStateOf(fixture()); var saves = 0; val errors = mutableListOf<String>()
        compose.setContent { SearchBeforeTheme { FarmScreen(data, true, { data = it; saves++ }, { errors += it }, {}) } }
        compose.onNodeWithText("新增農務紀錄").performClick()
        compose.onNodeWithText(Farm.types.getValue(type)).performScrollTo().performClick()
        field("實際日期 YYYY-MM-DD", "2026-01-01")
        val values = Farm.fields.getValue(type).associate { definition -> definition.key to when {
            definition.numeric -> "2.5"
            definition.key == "actions" -> "清潔、保養"
            definition.key == "equipment" -> "TEST_A、TEST_B"
            else -> "TEST_${definition.key}"
        } }
        Farm.fields.getValue(type).forEach { field(it.label + if(it.required) "（必填）" else "", values.getValue(it.key)) }
        field("操作者", "TEST_OPERATOR"); field("備註", "TEST_NOTE")
        if(type == "harvest") {
            compose.onNodeWithText("儲存實際紀錄").performClick()
            compose.runOnIdle { assertEquals(0, saves) }
            compose.onNode(isToggleable()).performScrollTo().performClick()
        }
        compose.onNodeWithText("儲存實際紀錄").performClick()
        var id = ""
        compose.runOnIdle {
            assertEquals(1, saves); val row = Farm.records(data).single(); id = row.getString("id")
            assertEquals(type, row.getString("type")); assertEquals("TEST_PLOT", row.getString("plotId"))
            assertEquals("TEST_OPERATOR", row.getString("operator")); assertEquals("TEST_NOTE", row.getString("notes"))
            values.forEach { (key, value) -> assertEquals(value, Farm.detailsText(row, key)) }
        }
        scroll("修改紀錄"); compose.onNodeWithText("修改紀錄").performClick()
        field("備註", "UPDATED_NOTE")
        if(type == "harvest") compose.onNode(isToggleable()).performScrollTo().performClick()
        compose.onNodeWithText("儲存實際紀錄").performClick()
        compose.runOnIdle {
            assertEquals(2, saves); assertEquals(id, Farm.records(data).single().getString("id"))
            assertEquals("UPDATED_NOTE", Farm.records(data).single().getString("notes"))
        }
        scroll("刪除紀錄"); compose.onNodeWithText("刪除紀錄").performClick()
        compose.onNodeWithText("取消").performClick()
        compose.runOnIdle { assertEquals(2, saves); assertEquals(1, Farm.records(data).size) }
        compose.onNodeWithText("刪除紀錄").performClick(); compose.onNodeWithText("確認刪除").performClick()
        compose.runOnIdle { assertEquals(3, saves); assertTrue(Farm.records(data).isEmpty()); assertTrue(errors.isEmpty()); assertEquals(1, Backup.plots(data).size) }
    }
    @Test fun cultivationCreateEditDelete() = cycle("cultivation")
    @Test fun fertilizerCreateEditDelete() = cycle("fertilizer")
    @Test fun harvestRequiresActualConfirmationAndCanEditDelete() = cycle("harvest")
    @Test fun postharvestCreateEditDelete() = cycle("postharvest")
    @Test fun materialPurchaseCreateEditDelete() = cycle("materialPurchase")
    @Test fun equipmentArraysCreateEditDelete() = cycle("equipmentMaintenance")
    @Test fun pastedOverlongDateIsRejectedInsteadOfTruncatedIntoValidDate() {
        var saves = 0
        compose.setContent { SearchBeforeTheme { FarmScreen(fixture(), true, { saves++ }, {}, {}) } }
        compose.onNodeWithText("新增農務紀錄").performClick(); compose.onNodeWithText("栽培作業").performClick()
        field("實際日期 YYYY-MM-DD", "2026-01-010")
        field("作業內容（必填）", "TEST_ACTIVITY")
        compose.onNodeWithText("儲存實際紀錄").performClick()
        compose.onNodeWithText("請填寫已發生的正確日期").performScrollTo().assertIsDisplayed()
        compose.runOnIdle { assertEquals(0, saves) }
        compose.onNodeWithText("取消").performClick()
    }
}
