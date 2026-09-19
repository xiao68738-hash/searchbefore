package tw.searchbefore.nativeapp

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.time.format.DateTimeFormatterBuilder
import java.util.UUID

// Compatible envelope; account identity, tokens and sync consent are NEVER imported.
object Backup {
    const val MAX_BYTES = 10 * 1024 * 1024
    private val limits = mapOf("records" to 20000, "fieldPlots" to 5000, "farmRecords" to 20000, "recipes" to 5000, "recentCrops" to 100)
    private val safeId = Regex("^[A-Za-z0-9_-]{1,100}$")
    fun empty(): JSONObject = JSONObject().put("schemaVersion", 1).put("activePlotId", "").put("lastFarmOperator", "").apply {
        limits.keys.forEach { put(it, JSONArray()) }
    }
    fun parse(bytes: ByteArray): JSONObject {
        require(bytes.size <= MAX_BYTES) { "備份檔不能超過 10 MB" }
        val text = bytes.toString(Charsets.UTF_8)
        checkDepth(text)
        val root = JSONObject(text)
        require(root.optString("product") == "searchbefore-backup" && root.optInt("formatVersion") == 1) { "不是支援的噴前查備份檔" }
        val input = root.getJSONObject("data")
        return validateData(input)
    }
    fun checkDepth(text: String) {
        // Reject excessive nesting before the recursive JSON parser runs.
        var depth = 0; var quoted = false; var escaped = false
        for (c in text) {
            if (quoted) {
                if (escaped) escaped = false else if (c == '\\') escaped = true else if (c == '"') quoted = false
            } else when(c) {
                '"' -> quoted = true
                '{', '[' -> { depth++; require(depth <= 32) { "備份巢狀層數過多" } }
                '}', ']' -> depth--
            }
        }
        require(depth == 0 && !quoted) { "JSON 格式不完整" }
    }
    private fun validateData(input: JSONObject): JSONObject {
        val out = empty()
        for ((key, limit) in limits) {
            val a = if (!input.has(key) || input.isNull(key)) JSONArray() else input.getJSONArray(key)
            require(a.length() <= limit) { "備份筆數過多" }
            val ids = mutableSetOf<String>()
            for (i in 0 until a.length()) {
                if (key == "recentCrops") { require(a.getString(i).length <= 120); continue }
                val item = a.getJSONObject(i)
                if (key != "recipes") {
                    val id = item.getString("id")
                    require(safeId.matches(id) && ids.add(id)) { "編號錯誤或重複" }
                }
                if (key == "records") {
                    require(item.getString("crop").length in 1..120 && item.getString("agent").length in 1..200)
                    require(validDate(item.getString("date"))) { "施藥日期格式不正確" }
                    if (!item.isNull("phi")) require(item.getDouble("phi") in 0.0..3650.0)
                    if (item.has("actualAmount") || item.has("actualAmountUnit") || item.has("waterRecorded")) {
                        if(item.has("waterRecorded")) {
                            require(item.get("waterRecorded") is Boolean) { "實際水量標記格式錯誤" }
                            require(item.getBoolean("waterRecorded") || item.optDouble("water", 0.0) <= 0) { "實際水量與未記錄標記不符" }
                        }
                        ApplicationDetails.from(item).validate()
                    }
                }
                require(item.toString().length <= 100000) { "單筆備份內容過大" }
            }
            out.put(key, JSONArray(a.toString()))
        }
        val plotIds = out.getJSONArray("fieldPlots").let { a -> (0 until a.length()).map { a.getJSONObject(it).getString("id") }.toSet() }
        for (key in listOf("records", "farmRecords")) {
            val a = out.getJSONArray(key)
            for (i in 0 until a.length()) {
                val plot = a.getJSONObject(i).optString("plotId")
                require(plot.isEmpty() || (safeId.matches(plot) && plot in plotIds)) { "紀錄引用了不存在的田區" }
            }
        }
        val active = input.optString("activePlotId")
        require(active.isEmpty() || active in plotIds) { "預設田區不存在" }
        out.put("activePlotId", active)
        out.put("lastFarmOperator", input.optString("lastFarmOperator").take(120))
        out.put("schemaVersion", input.optInt("schemaVersion", 1).also { require(it in 1..100) })
        return out
    }
    fun encode(data: JSONObject): ByteArray = JSONObject().put("product", "searchbefore-backup")
        .put("formatVersion", 1).put("appVersion", BuildConfig.VERSION_NAME)
        .put("exportedAt", Instant.now().toString()).put("data", data).toString(2).toByteArray()
    fun validDate(date: String) = Regex("\\d{4}-\\d{2}-\\d{2}").matches(date) && runCatching { LocalDate.parse(date) }.isSuccess
    fun harvestDate(record: JSONObject): String? = runCatching {
        if (record.isNull("phi")) return null
        val days = record.getDouble("phi")
        require(days.isFinite() && days in 0.0..365.0)
        // Keep the existing web policy: actual application date + interval + one day.
        // Also round fractional imported intervals UP, never shorten the waiting period.
        LocalDate.parse(record.getString("date")).plusDays(kotlin.math.ceil(days).toLong() + 1).toString()
    }.getOrNull()
    fun plots(data: JSONObject): List<JSONObject> = data.getJSONArray("fieldPlots").let { a ->
        (0 until a.length()).map { a.getJSONObject(it) }
    }
    fun plotLabel(plot: JSONObject): String = listOf(plot.optString("crop", plot.optString("name")),
        plot.optString("variety"), plot.optString("tag")).filter { it.isNotBlank() }.joinToString(" / ")
    fun addPlot(data: JSONObject, crop: String, tag: String, plantDate: String, catalogCrops: List<String>): JSONObject {
        require(crop in catalogCrops) { "請選擇原登記作物名稱" }
        require(tag.trim().length in 1..120) { "請填寫 1～120 字的田區名稱" }
        require(plantDate.isEmpty() || validDate(plantDate)) { "種植日期格式不正確" }
        require(plantDate.isEmpty() || !LocalDate.parse(plantDate).isAfter(LocalDate.now())) { "實際種植日期不可填未來日期" }
        val next = JSONObject(data.toString())
        val plot = JSONObject().put("id", "plot_" + UUID.randomUUID().toString()).put("name", crop)
            .put("crop", crop).put("cropSource", "registered").put("tag", tag.trim()).put("variety", "")
            .put("plantDate", plantDate).put("createdAt", LocalDate.now().toString())
            .put("updatedAt", DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(Instant.now()))
        next.getJSONArray("fieldPlots").put(plot)
        return parse(encode(next))
    }
    fun appendRecord(data: JSONObject, row: UsageRow, date: String, plotId: String, details: ApplicationDetails = ApplicationDetails()): JSONObject {
        require(!row.formExcluded) { "此收穫型態用法待確認，請回原登記核對" }
        if (plotId.isNotEmpty()) {
            val plot = plots(data).find { it.getString("id") == plotId }
            require(plot != null && plot.optString("crop", plot.optString("name")) == row.crop) { "田區與登記作物不符，請重新選擇" }
        }
        val next = JSONObject(data.toString())
        next.getJSONArray("records").put(details.applyTo(record(row, date).put("plotId", plotId)))
        return parse(encode(next))
    }
    fun nextStamp(previous: String = "", observedNow: Instant = Instant.now()): String {
        // Compare at the precision we actually persist. A nanosecond clock value can be
        // later than the previous instant yet format to the very same millisecond.
        val now = observedNow.truncatedTo(ChronoUnit.MILLIS)
        val old = previous.takeIf { it.isNotEmpty() }?.let { Instant.parse(it) }
        val next = if (old != null && !old.isBefore(now)) old.plusMillis(1) else now
        return DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(next)
    }
    fun updateRecord(data: JSONObject, id: String, expectedStamp: String, date: String, plotId: String, operator: String, details: ApplicationDetails? = null): JSONObject {
        require(validDate(date) && !LocalDate.parse(date).isAfter(LocalDate.now())) { "請填有效的實際施藥日期，不可填未來日期" }
        require(operator.trim().length <= 120) { "操作者姓名過長" }
        val next = JSONObject(data.toString())
        val records = next.getJSONArray("records")
        val record = (0 until records.length()).map { records.getJSONObject(it) }.find { it.getString("id") == id }
        requireNotNull(record) { "找不到原紀錄，請重新開啟" }
        require(record.optString("updatedAt") == expectedStamp) { "紀錄已更新，請重新開啟再編輯" }
        if (plotId.isNotEmpty()) {
            val plot = plots(next).find { it.getString("id") == plotId }
            require(plot != null && plot.optString("crop", plot.optString("name")) == record.getString("crop")) { "田區與登記作物不符" }
        }
        record.put("date", date).put("plotId", plotId).put("operator", operator.trim())
            .put("updatedAt", nextStamp(expectedStamp))
        details?.copy(operator = operator)?.applyTo(record)
        // Update a clone in place: unknown backup fields and other records survive.
        return parse(encode(next))
    }
    fun updatePlot(data: JSONObject, id: String, expectedStamp: String, tag: String, plantDate: String): JSONObject {
        require(tag.trim().length in 1..120) { "請填寫 1～120 字的田區名稱" }
        require(plantDate.isEmpty() || (validDate(plantDate) && !LocalDate.parse(plantDate).isAfter(LocalDate.now()))) { "種植日期不正確或尚未發生" }
        val next = JSONObject(data.toString())
        val plot = plots(next).find { it.getString("id") == id }
        requireNotNull(plot) { "找不到原田區，請重新開啟" }
        require(plot.optString("updatedAt") == expectedStamp) { "田區已更新，請重新開啟再編輯" }
        // Crop/id remain immutable here so existing spray and farm records keep their meaning.
        plot.put("tag", tag.trim()).put("plantDate", plantDate).put("updatedAt", nextStamp(expectedStamp))
        return parse(encode(next))
    }
    fun record(row: UsageRow, date: String): JSONObject {
        require(validDate(date)) { "請輸入 YYYY-MM-DD 日期" }
        require(!LocalDate.parse(date).isAfter(LocalDate.now())) { "實際施藥紀錄不可填未來日期" }
        return JSONObject().put("id", "rec_" + UUID.randomUUID().toString()).put("crop", row.crop)
            .put("registrationId", row.id).put("harvestForm", row.json.optString("selectedHarvestForm"))
            .put("pest", row.pest).put("agent", row.name).put("date", date)
            .put("phi", row.phi ?: JSONObject.NULL).put("moa", row.json.optString("moa"))
            .put("dil", if(row.canCalculate) row.json.optString("dilution").replace(",", "").toDoubleOrNull() ?: 0 else 0)
            .put("water", 0).put("plotId", "").put("operator", "").put("updatedAt", DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(Instant.now()))
    }
}
