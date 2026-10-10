package tw.searchbefore.nativeapp

import org.json.JSONObject

internal data class TimelineEvent(val collection: String, val record: JSONObject, val label: String, val details: String) {
    val key: String get() = "$collection:${record.getString("id")}"
}

internal data class RecordFilter(val plotId: String = "", val from: String = "", val to: String = "", val query: String = "", val type: String = "") {
    fun validate(data: JSONObject) {
        ReportScope(from, to, plotId).validate(data)
        require(type.isEmpty() || type == "records" || type == "farmRecords" || type in Farm.types) { "請重新選擇紀錄類型" }
    }
    fun includes(record: JSONObject, collection: String, summary: String): Boolean {
        val date = record.optString("date")
        return (plotId.isEmpty() || record.optString("plotId") == plotId) &&
            ((from.isEmpty() && to.isEmpty()) || (Backup.validDate(date) && (from.isEmpty() || date >= from) && (to.isEmpty() || date <= to))) &&
            (type.isEmpty() || type == collection || (collection == "farmRecords" && type == record.optString("type"))) &&
            (query.isBlank() || NativeSearch.normalize(summary).contains(NativeSearch.normalize(query)))
    }
}

internal object FarmTimeline {
    fun summary(record: JSONObject, collection: String): String = if(collection == "records")
        "${record.optString("crop")} × ${record.optString("pest")}｜${record.optString("agent")}\n${ApplicationDetails.summary(record)}"
    else Farm.fields[record.optString("type")]?.mapNotNull { field ->
        Farm.detailsText(record, field.key).takeIf { it.isNotBlank() }?.let { "${field.label}：$it" }
    }?.joinToString("\n") ?: "其他農務：${record.optJSONObject("details") ?: ""}"

    fun events(data: JSONObject, filter: RecordFilter = RecordFilter()): List<TimelineEvent> {
        filter.validate(data)
        val plots = Backup.plots(data).associate { it.getString("id") to Backup.plotLabel(it) }
        return listOf("records", "farmRecords").flatMap { collection ->
            NativeSync.rows(data.getJSONArray(collection)).mapNotNull { record ->
                val label = if(collection == "records") "用藥" else Farm.types[record.optString("type")] ?: "其他農務"
                val details = summary(record, collection)
                val search = listOf(label, details, record.optString("operator"), record.optString("notes"), plots[record.optString("plotId")].orEmpty()).joinToString("\n")
                if(filter.includes(record, collection, search)) TimelineEvent(collection, record, label, details) else null
            }
        }.sortedWith(compareByDescending<TimelineEvent> { it.record.optString("date") }.thenBy { it.key })
    }
}
