package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeRecipesTest {
    private fun row() = UsageRow(JSONObject("""{"id":"source1","crop":"蔥","pest":"夜蛾類","name":"測試","formKind":"液","dilution":"1,000","phi":1.5,"usage":{"canCalculateDilution":true},"bl":["商品甲"]}"""))
    @Test fun saveRecipeKeepsFractionalPhiAndExactBrandsWithoutSprayRecord() {
        val data = Recipes.add(Backup.empty(), row(), "2")
        val recipe = Recipes.rows(data).single()
        assertEquals(1.5, recipe.getDouble("phi"), 0.0)
        assertEquals("2", Recipes.amount(recipe, "2"))
        assertEquals("商品甲", recipe.getJSONArray("brands").getString(0))
        assertEquals(0, data.getJSONArray("records").length())
        assertEquals("2026-01-04", Backup.harvestDate(Backup.record(row(), "2026-01-01")))
    }
    @Test fun specialUseAndUnknownUnitCannotBecomeAutomaticRecipe() {
        val special = row().json.put("usage", JSONObject().put("canCalculateDilution", false))
        assertTrue(runCatching { Recipes.add(Backup.empty(), UsageRow(special), "2") }.isFailure)
        val unknown = row().json.put("formKind", "未知")
        assertTrue(runCatching { Recipes.add(Backup.empty(), UsageRow(unknown), "2") }.isFailure)
    }
    @Test fun importedChineseUnitAliasesStayCalculableWithoutRewritingOrChangingScale() {
        for ((source, expected) in listOf("毫升" to "mL", "公克" to "g", "克" to "g", " mL " to "mL")) {
            val recipe = Recipes.rows(Recipes.add(Backup.empty(), row(), "2")).single().put("unit", source)
            assertEquals(expected, Recipes.unit(recipe))
            assertEquals("2", Recipes.amount(recipe, "2"))
            assertEquals(source, recipe.getString("unit"))
        }
        for (unknownScale in listOf("L", "公升", "kg", "公斤", "未知")) {
            val recipe = Recipes.rows(Recipes.add(Backup.empty(), row(), "2")).single().put("unit", unknownScale)
            assertTrue(Recipes.referenceOnly(recipe))
            assertNull(Recipes.amount(recipe, "2"))
        }
    }
    @Test fun editPreservesOtherFieldsAndRejectsForeignBrandOrStaleIndex() {
        val data = Recipes.add(Backup.empty(), row(), "2")
        val recipe = Recipes.rows(data).single().put("unknown", "keep")
        val stamp = NativeSync.canonical(recipe)
        val edited = Recipes.update(data, 0, stamp, "3", "商品甲", "備註")
        assertEquals("keep", Recipes.rows(edited).single().getString("unknown"))
        assertEquals("3", Recipes.amount(Recipes.rows(edited).single(), "3"))
        assertTrue(runCatching { Recipes.update(data, 0, stamp, "3", "另一登記商品", "") }.isFailure)
        assertTrue(runCatching { Recipes.update(edited, 0, stamp, "4", "", "") }.isFailure)
        assertTrue(runCatching { Recipes.remove(edited, 0, stamp) }.isFailure)
        assertEquals(0, Recipes.rows(Recipes.remove(edited, 0, NativeSync.canonical(Recipes.rows(edited).single()))).size)
    }
}
