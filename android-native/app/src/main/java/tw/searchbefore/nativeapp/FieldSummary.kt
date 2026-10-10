package tw.searchbefore.nativeapp

import org.json.JSONObject
import java.time.LocalDate

/** Read-only projection. Never assigns unlinked records to a plot or changes the default plot. */
internal data class FieldSummary(
    val plot: JSONObject, val latest: TimelineEvent?, val pesticideCount: Int,
    val farmCount: Int, val safety: JSONObject
) {
    val needsSafetyReview: Boolean get() = safety.getString("status") in listOf("unknown", "waiting")
    val action: String get() = when {
        safety.getString("status") == "unknown" -> "先核對採收期"
        safety.getString("status") == "waiting" -> "查看安全採收倒數"
        latest == null -> "新增第一筆作業"
        farmCount == 0 -> "補上田間作業"
        else -> "繼續記錄田間作業"
    }
}

internal object FieldSummaries {
    fun build(data: JSONObject, today: String = LocalDate.now().toString()): FieldSummary? {
        require(Backup.validDate(today))
        val plots = Backup.plots(data)
        if(plots.isEmpty()) return null
        val events = FarmTimeline.events(data).filter { Backup.validDate(it.record.optString("date")) }
        val latestPlotId = events.firstOrNull { it.record.optString("plotId").isNotBlank() }?.record?.optString("plotId")
        val plot = plots.find { it.optString("id") == data.optString("activePlotId") }
            ?: plots.find { it.optString("id") == latestPlotId }
            ?: plots.sortedByDescending { it.optString("createdAt") }.first()
        val id = plot.getString("id")
        val assigned = events.filter { it.record.optString("plotId") == id }
        return FieldSummary(plot, assigned.firstOrNull(), assigned.count { it.collection == "records" },
            assigned.count { it.collection == "farmRecords" }, Farm.safety(data, id, today))
    }
}
