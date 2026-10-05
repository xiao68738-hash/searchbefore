package tw.searchbefore.nativeapp

import org.json.JSONArray

internal data class CropSelection(val crop: String, val harvestForm: String = "")
internal data class SharedRegistration(val name: String, val form: String, val content: String,
    val brands: List<String>, val byCrop: Map<String, List<UsageRow>>) {
    val key get() = JSONArray(listOf(name, form, content)).toString()
}

/** Compare only exact registrations and exact shared product names. Never synthesize a dose. */
internal object MultiCropComparison {
    fun validate(catalog: Catalog, selected: List<CropSelection>) {
        require(selected.size in 2..5 && selected.map { it.crop }.distinct().size == selected.size) { "請選擇 2～5 種不同的登記作物" }
        selected.forEach { choice ->
            require(choice.crop in catalog.crops) { "作物不在目前登記資料中，請重新選擇" }
            require(choice.harvestForm.isEmpty() || catalog.forms(choice.crop).any { it.first == choice.harvestForm }) { "採收部位已失效，請重新選擇" }
        }
    }
    fun pests(catalog: Catalog, selected: List<CropSelection>): List<String> {
        validate(catalog, selected)
        return selected.map { catalog.pests(it.crop).toSet() }.reduce { a, b -> a intersect b }.sorted()
    }
    fun find(catalog: Catalog, selected: List<CropSelection>, pest: String): List<SharedRegistration> {
        validate(catalog, selected)
        require(pest in pests(catalog, selected)) { "此防治對象不是全部所選作物的共同原登記" }
        fun identity(row: UsageRow) = listOf(row.name, row.json.optString("form"), row.json.optString("content"))
        fun known(value: String) = value.trim().let { it.isNotEmpty() && it !in setOf("-", "--", "未知", "不詳") }
        val grouped = selected.map { choice ->
            catalog.exact(choice.crop, pest).filter { row ->
                choice.harvestForm.isEmpty() || row.json.optJSONObject("cropForms")?.has(choice.harvestForm) == true
            }.map { it.withHarvestForm(choice.harvestForm) }.filterNot { it.formExcluded }
                .filter { identity(it).all(::known) }.groupBy(::identity)
        }
        val sharedKeys = grouped.map { it.keys }.reduce { a, b -> a intersect b }
        return sharedKeys.mapNotNull { key ->
            // Keep all duplicate registrations; one crop may have several legitimate uses.
            val products = grouped.map { map -> map.getValue(key).flatMap { it.brands }.filter(::known).toSet() }
                .reduce { a, b -> a intersect b }.sorted()
            if(products.isEmpty()) null else SharedRegistration(key[0], key[1], key[2], products,
                selected.mapIndexed { index, choice -> choice.crop to grouped[index].getValue(key).filter { row -> row.brands.any { it in products } } }.toMap())
        }.sortedWith(compareBy<SharedRegistration> { it.name }.thenBy { it.content }.thenBy { it.form })
    }
}
