package tw.searchbefore.nativeapp

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeMultiCropComparisonTest {
    private fun row(id: String, crop: String, pest: String = "夜蛾類", content: String = "10%", form: String = "水懸劑", brands: List<String> = listOf("TEST_PRODUCT")) =
        JSONObject().put("id", id).put("crop", crop).put("pest", pest).put("name", "TEST_AGENT")
            .put("content", content).put("form", form).put("bl", JSONArray(brands)).put("phi", 7)
            .put("usage", JSONObject().put("label", "稀釋倍數").put("value", "$id 倍"))
    private fun catalog(vararg rows: JSONObject) = Catalog(JSONObject().put("dataVersion", "TEST")
        .put("related", JSONObject()).put("rows", JSONArray(rows.toList())).put("forms", JSONObject().put("蔥",
            JSONArray().put(JSONObject().put("id", "leaf").put("label", "葉用")))).toString())
    private val selected = listOf(CropSelection("蔥"), CropSelection("甘藍"))

    @Test fun duplicateRegistrationsKeepAllOriginalDosesAndDoNotMutateSource() {
        val a = row("a", "蔥"); val b = row("b", "蔥"); val c = row("c", "甘藍")
        val cat = catalog(a, b, c); val before = cat.rows.map { it.json.toString() }
        val group = MultiCropComparison.find(cat, selected, "夜蛾類").single()
        assertEquals(listOf("a", "b"), group.byCrop.getValue("蔥").map { it.id })
        assertEquals(listOf("a 倍", "b 倍"), group.byCrop.getValue("蔥").map { it.usage.getString("value") })
        assertEquals(listOf("c"), group.byCrop.getValue("甘藍").map { it.id })
        assertEquals(before, cat.rows.map { it.json.toString() })
    }
    @Test fun relatedPestNamesNeverStandInForExactRegistration() {
        val cat = catalog(row("a", "蔥"), row("b", "甘藍", "甜菜夜蛾"))
        assertTrue(MultiCropComparison.pests(cat, selected).isEmpty())
        assertTrue(runCatching { MultiCropComparison.find(cat, selected, "夜蛾類") }.isFailure)
    }
    @Test fun differentContentsOrFormsCannotBeShared() {
        for(other in listOf(row("b", "甘藍", content = "20%"), row("b", "甘藍", form = "乳劑"))) {
            assertTrue(MultiCropComparison.find(catalog(row("a", "蔥"), other), selected, "夜蛾類").isEmpty())
        }
    }
    @Test fun productsMustMatchAcrossEveryCropAndUnsharedRowsAreExcluded() {
        val cat = catalog(row("a", "蔥", brands = listOf("COMMON", "ONLY_A")), row("b", "蔥", brands = listOf("ONLY_B")),
            row("c", "甘藍", brands = listOf("COMMON")), row("d", "白菜", brands = listOf("COMMON", "ONLY_A")))
        val group = MultiCropComparison.find(cat, selected + CropSelection("白菜"), "夜蛾類").single()
        assertEquals(listOf("COMMON"), group.brands)
        assertEquals(listOf("a"), group.byCrop.getValue("蔥").map { it.id })
    }
    @Test fun missingIdentityOrProductNeverImpliesSharedProduct() {
        for(value in listOf("", "--", "不詳")) {
            assertTrue(MultiCropComparison.find(catalog(row("a", "蔥", content = value), row("b", "甘藍", content = value)), selected, "夜蛾類").isEmpty())
            assertTrue(MultiCropComparison.find(catalog(row("a", "蔥", brands = listOf(value)), row("b", "甘藍", brands = listOf(value))), selected, "夜蛾類").isEmpty())
        }
    }
    @Test fun harvestFormMustHaveExplicitInformationAndCannotBeExcluded() {
        val leaf = selected.map { if(it.crop == "蔥") it.copy(harvestForm = "leaf") else it }
        val a = row("a", "蔥"); val b = row("b", "甘藍")
        assertTrue(MultiCropComparison.find(catalog(a, b), leaf, "夜蛾類").isEmpty())
        a.put("cropForms", JSONObject().put("leaf", JSONObject().put("category", "excluded")))
        assertTrue(MultiCropComparison.find(catalog(a, b), leaf, "夜蛾類").isEmpty())
        a.getJSONObject("cropForms").getJSONObject("leaf").put("category", "allowed")
        assertEquals("leaf", MultiCropComparison.find(catalog(a, b), leaf, "夜蛾類").single().byCrop.getValue("蔥").single().json.getString("selectedHarvestForm"))
    }
    @Test fun invalidOrDuplicateSelectionsAreRejected() {
        val cat = catalog(row("a", "蔥"), row("b", "甘藍"))
        for(choices in listOf(selected.take(1), listOf(selected[0], selected[0]), selected + CropSelection("不存在"),
            listOf(CropSelection("蔥", "missing"), selected[1]))) {
            assertTrue(runCatching { MultiCropComparison.validate(cat, choices) }.isFailure)
        }
    }
}
