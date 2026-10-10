package tw.searchbefore.nativeapp

import org.json.JSONObject

/** Display filtering only; never joins registrations or changes plot assignment. */
internal fun recordMatches(record: JSONObject, query: String): Boolean {
    val needle = query.trim().lowercase()
    return needle.isEmpty() || listOf("crop", "agent", "pest", "date", "operator", "notes")
        .any { record.optString(it).lowercase().contains(needle) }
}
