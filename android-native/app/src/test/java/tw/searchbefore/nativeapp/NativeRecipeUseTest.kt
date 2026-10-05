package tw.searchbefore.nativeapp

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeRecipeUseTest {
    private fun row(id: String = "current", crop: String = "測試作物", pest: String = "測試對象", name: String = "TEST_ONLY") = JSONObject()
        .put("id", id).put("crop", crop).put("pest", pest).put("name", name).put("formKind", "液").put("dilution", "2000")
        .put("usage", JSONObject().put("canCalculateDilution", true))
    private fun recipe() = JSONObject().put("crop", "測試作物").put("pest", "測試對象").put("agent", "TEST_ONLY")
        .put("water", 20).put("dil", 1000).put("unit", "ml").put("nativeCatalogId", "old-version")
    private fun catalog(rows: List<JSONObject>, forms: Boolean = false) = Catalog(JSONObject().put("dataVersion", "TEST_ONLY")
        .put("rows", JSONArray(rows)).put("related", JSONObject()).apply {
            if(forms) put("forms", JSONObject().put("測試作物", JSONArray().put(JSONObject().put("id", "leaf").put("label", "葉部"))
                .put(JSONObject().put("id", "seed").put("label", "種子"))))
        }.toString())
    @Test fun matchesExactOriginalScopeAndNeverTrustsSavedIdOrRatio() {
        val original = recipe(); val before = original.toString()
        val cat = catalog(listOf(row(), row("other-crop", crop = "其他作物"), row("related-pest", pest = "相關對象"), row("prefix-name", name = "TEST_ONLY_2")))
        assertEquals(listOf("current"), RecipeUse.options(original, cat).map { it.row.id })
        val (current, water) = RecipeUse.launch(original, cat, "current", "")
        assertEquals("20", water); assertEquals("10", current.amount(water))
        assertEquals(before, original.toString())
        assertTrue(runCatching { RecipeUse.launch(original, cat, "old-version", "") }.isFailure)
    }
    @Test fun legacyRecipesRequireExplicitSelectionFromAllCurrentFormulations() {
        val legacy = recipe().apply { remove("nativeCatalogId") }
        val cat = catalog(listOf(row("liquid"), row("powder").put("formKind", "粉")))
        assertEquals(2, RecipeUse.options(legacy, cat).size)
        assertEquals("g", RecipeUse.launch(legacy, cat, "powder", "").first.unit)
        assertTrue(runCatching { RecipeUse.launch(legacy, cat, "", "") }.isFailure)
    }
    @Test fun excludedMissingAndUnknownHarvestFormsNeverFallBackToBase() {
        val current = row().put("cropForms", JSONObject()
            .put("leaf", JSONObject().put("category", "ordinary").put("mrl", JSONObject().put("status", "reviewed-no-detect")))
            .put("seed", JSONObject().put("category", "excluded")))
        val cat = catalog(listOf(current, row("missing-form-info")), forms = true)
        assertEquals(listOf("leaf"), RecipeUse.options(recipe(), cat).map { it.row.json.optString("selectedHarvestForm") })
        val selected = RecipeUse.launch(recipe(), cat, "current", "leaf").first
        assertNotNull(selected.residueText)
        for(form in listOf("", "unknown", "seed")) assertTrue(runCatching { RecipeUse.launch(recipe(), cat, "current", form) }.isFailure)
    }
    @Test fun seedSpecialNonCalculableAndIncompleteRecipesStayBlocked() {
        val rows = listOf(row("seed").put("seed", true), row("excluded").put("formCategory", "excluded"),
            row("special").apply { getJSONObject("usage").put("isSpecial", true) },
            row("no-ratio").apply { getJSONObject("usage").put("canCalculateDilution", false) })
        assertTrue(RecipeUse.options(recipe(), catalog(rows)).isEmpty())
        val incomplete = recipe().apply { remove("pest") }
        assertTrue(RecipeUse.options(incomplete, catalog(listOf(row()))).isEmpty())
    }
    @Test fun invalidWaterAndAmbiguousDuplicateIdsCannotLaunch() {
        val cat = catalog(listOf(row()))
        for(water in listOf("0", "-1", "NaN", "1e20", "")) {
            val bad = recipe().put("water", water)
            assertNull(RecipeUse.water(bad, cat.rows.first()))
            assertTrue(runCatching { RecipeUse.launch(bad, cat, "current", "") }.isFailure)
        }
        assertTrue(runCatching { RecipeUse.launch(recipe(), catalog(listOf(row(), row())), "current", "") }.isFailure)
    }
}
