package tw.searchbefore.nativeapp

import org.json.JSONObject
import java.time.LocalDate

/** A reminder to REVIEW records, never a statement that harvesting or residues are safe. */
object ReminderPolicy {
    fun needsReview(data: JSONObject, today: LocalDate = LocalDate.now()): Boolean {
        val rows = NativeSync.rows(data.getJSONArray("records"))
        val groups = rows.groupBy { it.optString("plotId").ifEmpty { "unassigned:" + it.getString("id") } }
        return groups.values.any { records ->
            val known = records.map { Backup.harvestDate(it)?.let(LocalDate::parse) }
            if (known.any { it == null }) {
                // An unknown interval suppresses a "due" interpretation for the whole batch.
                records.any { r -> runCatching { LocalDate.parse(r.getString("date")) in today.minusDays(30)..today }.getOrDefault(false) }
            } else {
                val latest = known.filterNotNull().maxOrNull()
                latest != null && latest in today.minusDays(7)..today.plusDays(1)
            }
        }
    }
}
