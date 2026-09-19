package tw.searchbefore.nativeapp

import org.json.JSONObject
import java.math.BigDecimal
import java.math.RoundingMode

data class UsageRow(val json: JSONObject) {
    val id get() = json.getString("id")
    val crop get() = json.getString("crop")
    val pest get() = json.getString("pest")
    val name get() = json.getString("name")
    val usage get() = json.getJSONObject("usage")
    val phi: Double? get() = if (json.isNull("phi")) null else json.getDouble("phi").takeIf { it.isFinite() && it in 0.0..3650.0 }
    val brands get() = json.optJSONArray("bl")?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList()
    val unit get() = when (json.optString("formKind")) { "液" -> "mL"; "粉" -> "g"; else -> "" }
    val canCalculate get() = usage.optBoolean("canCalculateDilution") && unit.isNotEmpty()
    val formExcluded get() = json.optString("formCategory") == "excluded"
    fun withHarvestForm(form: String): UsageRow {
        if(form.isEmpty()) return this
        val info = json.optJSONObject("cropForms")?.optJSONObject(form) ?: return this
        return UsageRow(JSONObject(json.toString()).put("formCategory", info.getString("category"))
            .put("formReason", info.optString("reason")).put("selectedHarvestForm", form)
            .put("mrl", info.opt("mrl") ?: JSONObject.NULL))
    }
    fun amount(water: String): String? {
        if (!canCalculate) return null
        return Dilution.amount(water, json.optString("dilution"))
    }
    val residueText: String? get() {
        val m = json.optJSONObject("mrl") ?: return null
        return if (m.optString("status") == "reviewed-no-detect")
            "殘留提醒：在${crop}可使用但不得檢出" + m.optString("scopeNote").takeIf { it.isNotBlank() }?.let { "\n$it" }.orEmpty()
        else "殘留提醒：${crop}的部位／分類待確認，請核對產品標示。"
    }
}

object Dilution {
    fun amount(water: String, multiple: String): String? = runCatching {
        val liters = water.toBigDecimal()
        val ratio = multiple.replace(",", "").toBigDecimal()
        require(liters > BigDecimal.ZERO && liters <= BigDecimal("1000000"))
        require(ratio > BigDecimal.ZERO && ratio <= BigDecimal("10000000"))
        val amount = liters.multiply(BigDecimal("1000")).divide(ratio, 6, RoundingMode.HALF_UP)
        require(amount >= BigDecimal("0.001")) // do not turn tiny doses into a misleading zero
        amount.stripTrailingZeros().toPlainString()
    }.getOrNull()
}

class Catalog(text: String) {
    private val root = JSONObject(text)
    val version = root.getString("dataVersion")
    val rows = root.getJSONArray("rows").let { a -> (0 until a.length()).map { UsageRow(a.getJSONObject(it)) } }
    private val byCrop = rows.groupBy { it.crop }
    val crops = byCrop.keys.sorted()
    private val search = NativeSearch(root.optJSONObject("readings") ?: JSONObject(), root.optJSONObject("characterReadings") ?: JSONObject())
    private val agentNames = rows.flatMap { listOf(it.name) + it.brands }.distinct()
    fun cropMatches(query: String) = crops.filter { query.isBlank() || NativeSearch.normalize(it).contains(NativeSearch.normalize(query)) }
    fun cropSuggestions(query: String) = search.suggestions(query, crops)
    fun agentSuggestions(query: String) = search.suggestions(query, agentNames)
    fun forms(crop: String): List<Pair<String, String>> = root.optJSONObject("forms")?.optJSONArray(crop)?.let { a ->
        (0 until a.length()).map { a.getJSONObject(it).let { f -> f.getString("id") to f.getString("label") } }
    }.orEmpty()
    fun formAlias(query: String): Pair<String, String>? = root.optJSONObject("formAliases")?.optJSONObject(query.trim())?.let {
        it.getString("crop").takeIf { crop -> crop in crops }?.let { crop -> crop to it.optString("form") }
    }
    fun pests(crop: String) = byCrop[crop].orEmpty().map { it.pest }.distinct().sorted()
    fun exact(crop: String, pest: String) = byCrop[crop].orEmpty().filter { it.pest == pest }
    fun overview(crop: String) = byCrop[crop].orEmpty().groupBy { it.name }
    fun related(crop: String, pest: String): List<String> {
        val list = root.getJSONObject("related").optJSONObject(crop)?.optJSONArray(pest) ?: return emptyList()
        return (0 until list.length()).map { list.getString(it) }.filter { exact(crop, it).isNotEmpty() && it != pest }
    }
    fun byAgent(query: String): List<UsageRow> {
        if (query.isBlank()) return emptyList()
        val q = NativeSearch.normalize(query)
        return rows.filter { NativeSearch.normalize(it.name).contains(q) || it.brands.any { b -> NativeSearch.normalize(b).contains(q) } }
    }
}
