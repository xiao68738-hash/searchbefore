package tw.searchbefore.nativeapp

import org.json.JSONArray
import org.json.JSONObject

/** The web build exports the reviewed relations. No inferred word-root taxonomy. */
class PestSearch(private val rules: JSONObject) {
    private fun strings(array: JSONArray?) = array?.let { (0 until it.length()).map(it::getString) }.orEmpty()
    private val groups = strings(rules.optJSONArray("groups")).toSet()
    private val known = strings(rules.optJSONArray("known")).toSet()
    private val ambiguous = strings(rules.optJSONArray("ambiguous")).toSet()
    private fun canonical(value: String) = if(value in ambiguous) value else rules.optJSONObject("aliases")?.optString(value, value) ?: value
    private fun related(group: String, child: String): Boolean {
        if(group == child || group in ambiguous || child in ambiguous) return false
        return listOf("official", "scientific").any { child in strings(rules.optJSONObject(it)?.optJSONArray(group)) }
    }
    /** null = excluded; empty label = name match; nonempty label = explicit classified/alias result. */
    fun label(query: String, pest: String): String? {
        val q = NativeSearch.normalize(query); val p = NativeSearch.normalize(pest)
        if(q.isEmpty() || p == q || (p.contains(q) && q !in groups)) return ""
        val cq = canonical(q); val cp = canonical(p)
        if(cq == "夜蛾科" && cp == "夜蛾類") return "查詢群組・原登記：$pest"
        if(cq == cp) return "名稱對照・原登記：$pest"
        var matched = related(cq, cp)
        if(!matched && q.length >= 2 && cq !in known) {
            val terms = rules.optJSONArray("queryTerms") ?: JSONArray()
            matched = (0 until terms.length()).any { index ->
                val entry = terms.getJSONArray(index)
                strings(entry.getJSONArray(1)).any { it.contains(q) } &&
                    (entry.getString(0) == cp || related(entry.getString(0), cp))
            }
        }
        return if(matched) "分類相關・原登記：$pest" else null
    }
}
