package tw.searchbefore.nativeapp

import org.json.JSONArray
import org.json.JSONObject

object Recipes {
    fun rows(data: JSONObject) = NativeSync.rows(data.getJSONArray("recipes"))
    fun add(data: JSONObject, row: UsageRow, water: String): JSONObject {
        require(!row.formExcluded && row.canCalculate && row.amount(water) != null) { "這筆登記不提供此型態稀釋配方，請依原用途查閱" }
        val next = JSONObject(data.toString())
        val recipe = JSONObject().put("crop", row.crop).put("pest", row.pest).put("agent", row.name)
            .put("dil", row.json.getString("dilution").replace(",", "").toBigDecimal()).put("water", water.toBigDecimal())
            .put("phi", row.phi ?: JSONObject.NULL).put("unit", if (row.unit == "mL") "ml" else row.unit)
            .put("moa", row.json.optString("moa")).put("doseRaw", row.json.optString("dose"))
            .put("dosePerHa", JSONObject.NULL).put("note", "").put("brand", "").put("brands", JSONArray(row.brands))
            .put("nativeCatalogId", row.id)
            .put("harvestForm", row.json.optString("selectedHarvestForm"))
        next.put("recipes", JSONArray(listOf(recipe) + rows(next)))
        return Backup.parse(Backup.encode(next))
    }
    /** Recipes have no IDs in existing web backups, so reject a stale index via full content match. */
    fun update(data: JSONObject, index: Int, expected: String, water: String, brand: String, note: String): JSONObject {
        val next = JSONObject(data.toString())
        val rows = rows(next)
        require(index in rows.indices && NativeSync.canonical(rows[index]) == expected) { "配方清單已更新，請重新開啟" }
        val recipe = rows[index]
        require(amount(recipe, water) != null) { "此配方未具備有效倍數或單位，請回原登記查詢" }
        require(note.length <= 2000)
        val brands = recipe.optJSONArray("brands")?.let { a -> (0 until a.length()).map { a.getString(it) } }.orEmpty()
        require(brand.isEmpty() || brand in brands) { "商品名須屬於此配方原登記" }
        recipe.put("water", water.toBigDecimal()).put("brand", brand).put("note", note.trim())
        return Backup.parse(Backup.encode(next))
    }
    fun remove(data: JSONObject, index: Int, expected: String): JSONObject {
        val next = JSONObject(data.toString())
        val rows = rows(next)
        require(index in rows.indices && NativeSync.canonical(rows[index]) == expected) { "配方已更新，請重新確認" }
        next.put("recipes", JSONArray(rows.filterIndexed { i, _ -> i != index }))
        return Backup.parse(Backup.encode(next))
    }
    fun unit(recipe: JSONObject): String? = when (recipe.optString("unit").lowercase()) { "ml" -> "mL"; "g" -> "g"; else -> null }
    fun amount(recipe: JSONObject, water: String): String? = if(unit(recipe) == null) null else Dilution.amount(water, recipe.optString("dil"))
}
