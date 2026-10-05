package tw.searchbefore.nativeapp

import org.json.JSONObject

internal data class RecipeUseOption(val row: UsageRow, val formLabel: String)

/** Saved recipes are references, not current registration authority. Never pick the first/name-only match. */
internal object RecipeUse {
    fun options(recipe: JSONObject, catalog: Catalog): List<RecipeUseOption> {
        val crop = recipe.optString("crop")
        val pest = recipe.optString("pest")
        val name = recipe.optString("agent")
        if(listOf(crop, pest, name).any { it.isBlank() }) return emptyList()
        return catalog.exact(crop, pest).filter { it.name == name }.flatMap { original ->
            val forms = catalog.forms(crop)
            if(forms.isEmpty()) listOf(RecipeUseOption(original, "原登記作物"))
            else forms.mapNotNull { (id, label) ->
                // withHarvestForm deliberately returns the original on unknown IDs: check before calling it.
                if(original.json.optJSONObject("cropForms")?.has(id) == true)
                    RecipeUseOption(original.withHarvestForm(id), label) else null
            }
        }.filter { option ->
            val row = option.row
            row.canCalculate && !row.formExcluded && !row.usage.optBoolean("isSpecial") && !row.json.optBoolean("seed")
        }
    }

    fun water(recipe: JSONObject, row: UsageRow): String? = recipe.optString("water").takeIf {
        row.canCalculate && !row.formExcluded && row.amount(it) != null
    }

    fun launch(recipe: JSONObject, catalog: Catalog, id: String, form: String): Pair<UsageRow, String> {
        val selected = options(recipe, catalog).singleOrNull { it.row.id == id && it.row.json.optString("selectedHarvestForm") == form }
        requireNotNull(selected) { "原登記或採收型態已更新，請重新核對，不套用舊配方" }
        val water = requireNotNull(water(recipe, selected.row)) { "配方水量無效，請回查詢重新輸入" }
        return selected.row to water
    }
}
