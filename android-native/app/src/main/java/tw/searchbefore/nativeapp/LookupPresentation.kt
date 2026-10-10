package tw.searchbefore.nativeapp

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

internal data class AgentCropGroup(val name: String, val crop: String, val rows: List<UsageRow>) {
    val key: String get() = JSONArray(listOf(name, crop)).toString()
}

internal fun agentCropGroups(rows: List<UsageRow>, cropQuery: String = ""): List<AgentCropGroup> = rows
    .filter { cropQuery.isBlank() || NativeSearch.normalize(it.crop).contains(NativeSearch.normalize(cropQuery)) }
    .groupBy { it.name to it.crop }.map { (scope, registrations) -> AgentCropGroup(scope.first, scope.second, registrations) }
    .sortedWith(compareBy<AgentCropGroup> { it.name }.thenBy { it.crop })

/** Keep form-specific evidence, including pending notices; never infer safety from absence. */
internal fun overviewResidueNotices(rows: List<UsageRow>, form: String): List<String> = rows.map { it.withHarvestForm(form) }
    .mapNotNull { it.residueText }.distinct()

internal object RotationHistory {
    fun latest(data: JSONObject, row: UsageRow, today: LocalDate = LocalDate.now(), plotId: String? = null): JSONObject? {
        val code = row.json.optString("moa").trim().uppercase()
        return latestByCode(data, row.crop, today, plotId)[code]
    }
    fun latestByCode(data: JSONObject, crop: String, today: LocalDate = LocalDate.now(), plotId: String? = null): Map<String, JSONObject> {
        val latest = mutableMapOf<String, JSONObject>()
        NativeSync.rows(data.optJSONArray("records") ?: JSONArray()).forEach { record ->
            val code = record.optString("moa").trim().uppercase()
            if(record.optString("crop") != crop || !Regex("^(IRAC|FRAC|HRAC)\\s+\\S.*$").matches(code) ||
                (plotId != null && record.optString("plotId") != plotId)) return@forEach
            val date = runCatching { LocalDate.parse(record.optString("date")) }.getOrNull()
            if(date != null && !date.isAfter(today) && !date.isBefore(today.minusDays(30)) &&
                (latest[code] == null || record.optString("date") > latest.getValue(code).optString("date"))) latest[code] = record
        }
        return latest
    }
}
