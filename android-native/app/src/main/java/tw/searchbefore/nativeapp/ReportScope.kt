package tw.searchbefore.nativeapp

import org.json.JSONArray
import org.json.JSONObject

/** Reporting copy only. Never pass the result to persistence, synchronization or a full backup. */
data class ReportScope(val from: String = "", val to: String = "", val plotId: String = "", val kind: String = "all") {
    fun validate(data: JSONObject) {
        require(kind in listOf("all", "records", "farmRecords")) { "請重新選擇報表種類" }
        require((from.isEmpty() || Backup.validDate(from)) && (to.isEmpty() || Backup.validDate(to))) { "日期請使用有效的 YYYY-MM-DD" }
        require(from.isEmpty() || to.isEmpty() || from <= to) { "起日不能晚於迄日" }
        require(plotId.isEmpty() || Backup.plots(data).any { it.getString("id") == plotId }) { "所選田區已不存在，請重新選擇；不會自動匯出其他田區" }
    }
    private fun includes(collection: String, row: JSONObject): Boolean {
        val date = row.optString("date")
        return (kind == "all" || kind == collection) && (plotId.isEmpty() || row.optString("plotId") == plotId) &&
            ((from.isEmpty() && to.isEmpty()) || (Backup.validDate(date) &&
                (from.isEmpty() || date >= from) && (to.isEmpty() || date <= to)))
    }
    /** Preview counts without serializing/deep-copying the entire backup on every keystroke. */
    fun counts(data: JSONObject): Pair<Int, Int> {
        validate(data)
        fun count(collection: String): Int {
            val input = data.getJSONArray(collection)
            return (0 until input.length()).count { includes(collection, input.getJSONObject(it)) }
        }
        return count("records") to count("farmRecords")
    }
    fun select(data: JSONObject): JSONObject {
        validate(data)
        val result = JSONObject(data.toString())
        for(collection in listOf("records", "farmRecords")) {
            val input = data.getJSONArray(collection)
            val rows = (0 until input.length()).map(input::getJSONObject).filter { includes(collection, it) }
            result.put(collection, JSONArray(rows.map { JSONObject(it.toString()) }))
        }
        return result
    }
    companion object {
        val kinds = linkedMapOf("all" to "用藥與農務", "records" to "僅用藥", "farmRecords" to "僅農務")
    }
}
