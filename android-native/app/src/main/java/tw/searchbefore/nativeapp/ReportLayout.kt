package tw.searchbefore.nativeapp

import org.json.JSONObject
import java.math.BigDecimal

enum class ReportLayout(val label: String) {
    INTEGRATED("整合紀錄"), USE("用藥自主紀錄"), TAP("TAP 登打參考");
    fun validate(scope: ReportScope) {
        require(this == INTEGRATED || scope.kind == "records") { "用藥／TAP 格式僅匯出用藥，請將紀錄種類選為「僅用藥」" }
    }
    companion object { fun parse(value: String) = entries.singleOrNull { it.name == value } ?: error("報表格式已失效，請重新選擇") }
}

data class ReportTable(val title: String, val widths: List<Int>, val rows: List<List<String>>, val note: String = "")

object ReportTables {
    private fun positive(row: JSONObject, key: String): String? = runCatching {
        row.optString(key).toBigDecimal().takeIf { it > BigDecimal.ZERO && it <= BigDecimal("10000000") }
            ?.stripTrailingZeros()?.toPlainString()
    }.getOrNull()
    fun build(data: JSONObject, layout: ReportLayout): ReportTable {
        if(layout == ReportLayout.INTEGRATED) return ReportTable("用藥與農務紀錄", listOf(30,14,18,42,48,18,40,30), Farm.table(data))
        val plots = Backup.plots(data).associate { it.getString("id") to Backup.plotLabel(it) }
        val records = NativeSync.rows(data.getJSONArray("records")).sortedBy { it.optString("date") }
        val head = if(layout == ReportLayout.USE) listOf("田區/作物紀錄區", "施藥日期", "作物/田區", "防治對象", "使用藥劑", "稀釋倍數", "每桶水量(L)", "安全採收期(天)", "可採收日(參考)", "作用機制代碼", "操作人員")
            else listOf("栽培批次/田區", "作業日期", "作業種類", "農藥名稱", "稀釋倍數(倍)", "本次共使用水量(L)", "防治對象", "安全採收日(參考)", "作物", "操作人員")
        val rows = records.map { row ->
            val plot = plots[row.optString("plotId")] ?: "未指定田區"
            val perTank = if(row.has("waterRecorded") && !row.optBoolean("waterRecorded")) null else positive(row, "water")
            val total = positive(row, "totalWater")
            val ratio = positive(row, "dil") ?: "未填數字倍數；核對原用途"
            val date = Backup.harvestDate(row) ?: "需查標示"
            val phi = if(row.isNull("phi")) "需查標示" else runCatching {
                row.optString("phi").toBigDecimal().takeIf { it >= BigDecimal.ZERO && it <= BigDecimal("3650") }
                    ?.stripTrailingZeros()?.toPlainString()
            }.getOrNull() ?: "需查標示"
            if(layout == ReportLayout.USE) listOf(plot, row.optString("date"), row.optString("crop"), row.optString("pest"),
                row.optString("agent"), ratio, perTank ?: "未記錄", phi, date, row.optString("moa"), row.optString("operator"))
            else listOf(plot, row.optString("date"), "有害生物防治", row.optString("agent"), ratio,
                total ?: perTank?.let { "每桶${it}L（非總量，待補）" } ?: "總水量未記錄",
                row.optString("pest"), date, row.optString("crop"), row.optString("operator"))
        }
        val note = if(layout == ReportLayout.TAP)
            "僅為既有用藥紀錄的登打參考，非官方表單、驗證證明或直接匯入檔；欄位請依現行 TAP 核對。未記錄總水量時，每桶數值不代表本次總量；採收日僅估算，依產品標示及實際紀錄核對。"
        else "施藥自主紀錄，供自行保存查閱；每桶水量不是本次總量，採收日僅估算參考，不代表可採收或殘留合格。完整還原請使用 JSON 備份。"
        return ReportTable(layout.label, if(layout == ReportLayout.USE) listOf(30,14,20,24,28,28,20,20,22,18,20)
            else listOf(30,14,20,28,28,32,24,22,20,20), listOf(head) + rows, note)
    }
    fun csv(data: JSONObject, layout: ReportLayout): ByteArray {
        val table = build(data, layout)
        val rows = if(table.note.isEmpty()) table.rows else table.rows + listOf(List(table.widths.size) { "" },
            listOf(table.note) + List(table.widths.size - 1) { "" })
        return ("\uFEFF" + rows.joinToString("\r\n") { row -> row.joinToString(",", transform = Farm::csvCell) }).toByteArray(Charsets.UTF_8)
    }
}
