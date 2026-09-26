package tw.searchbefore.nativeapp

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/** Shared web schema. No account tokens, recipes, preferences or analytics are uploaded. */
object NativeSync {
    val collections = listOf("fieldPlots", "records", "farmRecords")
    private val idPattern = Regex("^[A-Za-z0-9_-]{1,100}$")
    fun rows(array: JSONArray) = (0 until array.length()).map { array.getJSONObject(it) }
    fun validateItem(item: JSONObject) {
        require(idPattern.matches(item.getString("id"))) { "雲端紀錄編號不符" }
        require(!item.has("_deleted") || item.get("_deleted") is Boolean) { "雲端刪除標記格式不符" }
        require(item.toString().toByteArray().size <= 100000) { "雲端單筆紀錄過大" }
        val stamp = item.optString("updatedAt")
        require(stamp.isEmpty() || runCatching { Instant.parse(stamp) }.isSuccess) { "雲端更新時間無效" }
    }
    fun validateJournal(journal: JSONObject) {
        require(journal.keys().asSequence().all { it in collections })
        for (key in collections) {
            val rows = journal.optJSONArray(key) ?: continue
            require(rows.length() <= 25000)
            val ids = mutableSetOf<String>()
            for (item in rows(rows)) {
                validateItem(item)
                require(item.optBoolean("_deleted") && ids.add(item.getString("id")))
            }
        }
    }
    private fun stamp(item: JSONObject) = item.optString("updatedAt").takeIf { it.isNotEmpty() }?.let { Instant.parse(it) } ?: Instant.EPOCH
    fun winner(local: JSONObject?, remote: JSONObject?): JSONObject? {
        if (local == null) return remote?.let { JSONObject(it.toString()) }
        if (remote == null) return JSONObject(local.toString())
        validateItem(local); validateItem(remote)
        require(local.getString("id") == remote.getString("id"))
        val chosen = when {
            stamp(local).isAfter(stamp(remote)) -> local
            stamp(remote).isAfter(stamp(local)) -> remote
            local.optBoolean("_deleted") && !remote.optBoolean("_deleted") -> local
            else -> remote // Deletion wins equal time; otherwise remote wins equal time, matching web.
        }
        return JSONObject(chosen.toString())
    }
    fun canonical(value: Any?): String = when (value) {
        is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(prefix = "{", postfix = "}") { JSONObject.quote(it) + ":" + canonical(value.get(it)) }
        is JSONArray -> (0 until value.length()).joinToString(prefix = "[", postfix = "]") { canonical(value.get(it)) }
        null, JSONObject.NULL -> "null"
        is String -> JSONObject.quote(value)
        else -> value.toString()
    }
    fun same(a: JSONObject?, b: JSONObject?) = canonical(a) == canonical(b)
    fun merged(local: List<JSONObject>, remote: List<JSONObject>): List<JSONObject> {
        require(local.size <= 45000 && remote.size <= 45000) { "同步筆數超出上限" }
        val map = linkedMapOf<String, JSONObject>()
        for (item in local + remote) {
            validateItem(item)
            val id = item.getString("id")
            map[id] = requireNotNull(winner(map[id], item))
        }
        return map.values.toList()
    }
    fun localRows(document: JSONObject, key: String): List<JSONObject> {
        require(key in collections)
        return merged(rows(document.getJSONObject("data").getJSONArray(key)), rows(document.getJSONObject("tombstones").optJSONArray(key) ?: JSONArray()))
    }
    fun journalChanges(previous: JSONObject, next: JSONObject) {
        val old = previous.getJSONObject("data")
        val data = next.getJSONObject("data")
        val journal = next.getJSONObject("tombstones")
        for (key in collections) {
            val oldItems = rows(old.getJSONArray(key)).associateBy { it.getString("id") }
            val newItems = rows(data.getJSONArray(key)).associateBy { it.getString("id") }
            val tombs = rows(journal.optJSONArray(key) ?: JSONArray()).associateBy { it.getString("id") }.toMutableMap()
            for ((id, item) in oldItems) if (id !in newItems) {
                tombs[id] = JSONObject().put("id", id).put("_deleted", true).put("updatedAt", Backup.nextStamp(item.optString("updatedAt")))
            }
            for ((id, item) in newItems) {
                val prior = winner(oldItems[id], tombs[id])
                if (!same(item, oldItems[id])) {
                    item.put("updatedAt", Backup.nextStamp(winner(item, prior)?.optString("updatedAt").orEmpty()))
                }
                tombs.remove(id)
            }
            // Retain tombstones until an explicit journal maintenance policy is validated.
            // Age-based deletion could resurrect records on a long-offline device.
            journal.put(key, JSONArray(tombs.values.toList()))
        }
    }
    fun applyRemote(document: JSONObject, server: Map<String, List<JSONObject>>): JSONObject {
        require(server.keys == collections.toSet()) { "雲端資料尚未完整讀取" }
        val next = JSONObject(document.toString())
        for (key in collections) {
            val all = merged(localRows(document, key), requireNotNull(server[key]))
            next.getJSONObject("data").put(key, JSONArray(all.filterNot { it.optBoolean("_deleted") }))
            next.getJSONObject("tombstones").put(key, JSONArray(all.filter { it.optBoolean("_deleted") }))
        }
        val data = next.getJSONObject("data")
        val plotIds = rows(data.getJSONArray("fieldPlots")).map { it.getString("id") }.toSet()
        if (data.optString("activePlotId") !in plotIds) data.put("activePlotId", "")
        // Do not guess/move orphan records to another plot. Fail closed, preserving the local copy.
        return NativeDocument.parse(NativeDocument.encode(next))
    }
}
