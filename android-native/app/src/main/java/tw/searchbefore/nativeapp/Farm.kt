package tw.searchbefore.nativeapp

import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.UUID

data class FarmField(val key: String, val label: String, val required: Boolean = false, val numeric: Boolean = false)
object Farm {
    val types = linkedMapOf("cultivation" to "栽培作業", "fertilizer" to "施肥", "harvest" to "採收",
        "postharvest" to "採後處理", "materialPurchase" to "資材購入", "equipmentMaintenance" to "器具／機械／設備管理")
    private fun f(key: String, label: String, required: Boolean = false, numeric: Boolean = false) = FarmField(key, label, required, numeric)
    val fields = mapOf(
        "cultivation" to listOf(f("activity", "作業內容", true), f("method", "方法")),
        "fertilizer" to listOf(f("materialName", "肥料或資材名稱", true), f("dressing", "基肥／追肥"), f("quantity", "施用量", true, true), f("unit", "施用量單位", true), f("method", "方法"), f("lotNo", "批號")),
        "harvest" to listOf(f("quantity", "採收量", true, true), f("unit", "採收量單位", true), f("grade", "等級"), f("batchNo", "批號／追溯碼")),
        "postharvest" to listOf(f("process", "處理方式", true), f("quantity", "處理數量", false, true), f("unit", "單位"), f("destination", "去向")),
        "materialPurchase" to listOf(f("category", "資材類別", true), f("materialName", "資材名稱", true), f("supplier", "供應商", true), f("quantity", "購入數量", true, true), f("unit", "單位", true), f("lotNo", "批號"), f("receiptNo", "憑證號碼")),
        "equipmentMaintenance" to listOf(f("equipment", "設備（多項以、分隔）", true), f("actions", "作業：清潔／保養／維修／校正", true)))
    fun records(data: JSONObject) = NativeSync.rows(data.getJSONArray("farmRecords"))
    fun detailsText(record: JSONObject, key: String): String {
        val value = record.optJSONObject("details")?.opt(key)
        return if (value is JSONArray) (0 until value.length()).joinToString("、") { value.getString(it) } else if (value == null || value == JSONObject.NULL) "" else value.toString()
    }
    fun save(data: JSONObject, id: String?, expectedStamp: String, type: String, date: String, plotId: String,
             operator: String, notes: String, values: Map<String, String>, confirmHarvest: Boolean = false): JSONObject {
        require(type in types) { "請選擇農務類型" }
        require(type != "harvest" || confirmHarvest) { "請確認這是實際採收事實紀錄，不是可採收許可" }
        require(Backup.validDate(date) && !LocalDate.parse(date).isAfter(LocalDate.now())) { "請填寫已發生的正確日期" }
        require(operator.trim().length <= 120 && notes.length <= 2000) { "操作者或備註過長" }
        require((type == "equipmentMaintenance" && plotId.isEmpty()) || Backup.plots(data).any { it.getString("id") == plotId }) { "請指定現有田區／種植批次" }
        val next = JSONObject(data.toString())
        val existing = id?.let { target -> records(next).find { it.getString("id") == target } }
        if (id != null) {
            requireNotNull(existing) { "農務紀錄不存在" }
            require(existing.optString("updatedAt") == expectedStamp && existing.optString("type") == type) { "紀錄已改變，請重新開啟" }
        }
        val result = existing ?: JSONObject().put("id", "farm_" + UUID.randomUUID()).put("createdAt", Backup.nextStamp())
        val details = result.optJSONObject("details") ?: JSONObject()
        for (field in fields.getValue(type)) {
            val raw = values[field.key].orEmpty().trim()
            require(raw.length <= 500 && (!field.required || raw.isNotEmpty())) { "請填寫${field.label}（最多 500 字）" }
            val parsed = if (field.numeric && raw.isNotEmpty()) {
                require(Regex("[0-9]+(?:\\.[0-9]+)?").matches(raw) && raw.length <= 24) { "${field.label}須為非負數字" }
                BigDecimal(raw).stripTrailingZeros().toPlainString()
            } else raw
            if (type == "equipmentMaintenance") {
                val items = parsed.split('、', ',', '，').map { it.trim() }.filter { it.isNotEmpty() }.distinct()
                require(items.isNotEmpty() && items.size <= 20 && items.all { it.length <= 120 }) { "設備或作業內容不正確" }
                details.put(field.key, JSONArray(items))
            } else details.put(field.key, parsed)
        }
        if (type == "postharvest") {
            if (details.optString("quantity").isEmpty()) details.put("unit", "")
            else require(details.optString("unit").isNotBlank()) { "有處理數量時請填單位" }
        }
        result.put("type", type).put("date", date).put("plotId", plotId).put("operator", operator.trim())
            .put("notes", notes.trim()).put("details", details).put("updatedAt", Backup.nextStamp(expectedStamp))
        if (type == "harvest") result.put("safetyCheck", safety(next, plotId, date).put("confirmedActualHarvest", true))
        if (existing == null) next.getJSONArray("farmRecords").put(result)
        next.put("lastFarmOperator", operator.trim())
        return Backup.parse(Backup.encode(next))
    }
    fun safety(data: JSONObject, plotId: String, date: String = LocalDate.now().toString()): JSONObject {
        require(Backup.validDate(date))
        // Match the existing web safety core: include every record assigned to this batch.
        // A backdated harvest form must not silently hide a later or unknown application.
        val relevant = NativeSync.rows(data.getJSONArray("records")).filter { plotId.isNotEmpty() && it.optString("plotId") == plotId }
        val dates = relevant.map { Backup.harvestDate(it) }
        val latest = dates.filterNotNull().maxOrNull().orEmpty()
        val unknown = dates.any { it == null }
        val state = when { relevant.isEmpty() -> "none"; unknown -> "unknown"; latest > date -> "waiting"; else -> "safe" }
        return JSONObject().put("status", state).put("safeDate", latest).put("hasUnknown", unknown)
            .put("recordCount", relevant.size).put("daysRemaining", if (unknown || latest.isEmpty()) JSONObject.NULL else maxOf(0, ChronoUnit.DAYS.between(LocalDate.parse(date), LocalDate.parse(latest))))
            .put("checkedAt", Backup.nextStamp())
    }
    fun safetyLabel(check: JSONObject): String = when(check.getString("status")) {
        "none" -> "尚無已指定田區的用藥紀錄，不能據此判定可採收。"
        "unknown" -> "部分採收期未確認，請核對產品標示。" + if(check.optString("safeDate").isNotEmpty()) "已知等待期最晚至 ${check.optString("safeDate")}，不代表那天即可採收。" else ""
        "waiting" -> "依已記錄用藥，至少等至 ${check.optString("safeDate")}；仍有 ${check.optLong("daysRemaining")} 天。" + if(check.optBoolean("hasUnknown")) "另有採收期未確認。" else ""
        else -> "已記錄的等待期已屆滿；不代表殘留合格或保證可採收，請確認紀錄完整及產品標示。"
    }
    fun delete(data: JSONObject, collection: String, id: String, stamp: String): JSONObject {
        require(collection in listOf("records", "farmRecords", "fieldPlots"))
        val next = JSONObject(data.toString())
        val rows = NativeSync.rows(next.getJSONArray(collection))
        val item = rows.find { it.getString("id") == id }
        requireNotNull(item) { "找不到原紀錄" }
        require(item.optString("updatedAt") == stamp) { "紀錄已更新，請重新確認" }
        if (collection == "fieldPlots") {
            require(listOf("records", "farmRecords").all { key -> NativeSync.rows(next.getJSONArray(key)).none { it.optString("plotId") == id } }) { "田區仍有紀錄，請先保留備份並處理紀錄歸屬" }
            if (next.optString("activePlotId") == id) next.put("activePlotId", "")
        }
        next.put(collection, JSONArray(rows.filterNot { it.getString("id") == id }))
        return Backup.parse(Backup.encode(next))
    }
    fun csvCell(value: String): String {
        // Prevent spreadsheet formula execution in user-controlled names/notes.
        val safe = if (value.trimStart().firstOrNull() in listOf('=', '+', '-', '@') || value.startsWith('\t') || value.startsWith('\r')) "'$value" else value
        return "\"" + safe.replace("\"", "\"\"") + "\""
    }
    fun table(data: JSONObject): List<List<String>> {
        val plots = Backup.plots(data).associate { it.getString("id") to Backup.plotLabel(it) }
        val head = listOf("田區／種植批次", "日期", "類型", "作物／藥劑／作業", "詳細欄位", "操作者", "備註", "紀錄編號")
        val items = (NativeSync.rows(data.getJSONArray("records")).map { "用藥" to it } + records(data).map { (types[it.optString("type")] ?: it.optString("type")) to it }).sortedBy { it.second.optString("date") }
        val rows = items.map { (label, r) -> listOf(plots[r.optString("plotId")] ?: "未指定田區", r.optString("date"), label,
            if(label == "用藥") "${r.optString("crop")} × ${r.optString("pest")}｜${r.optString("agent")}" else label,
            if(label == "用藥") "採收期：${if(r.isNull("phi")) "待確認" else r.get("phi")}；水量：${r.opt("water") ?: ""}" + (if(r.optDouble("dil", 0.0) > 0) "；倍數：${r.get("dil")}" else "；無數字倍數，請核對原用途")
            else fields[r.optString("type")]?.mapNotNull { field -> detailsText(r,field.key).takeIf { it.isNotEmpty() }?.let { "${field.label}：$it" } }?.joinToString("；") ?: r.opt("details")?.toString().orEmpty(),
            r.optString("operator"), r.optString("notes"), r.optString("id")) }
        return listOf(head) + rows
    }
    fun csv(data: JSONObject): ByteArray = ("\uFEFF" + table(data).joinToString("\r\n") { row -> row.joinToString(",", transform = ::csvCell) }).toByteArray(Charsets.UTF_8)
}
