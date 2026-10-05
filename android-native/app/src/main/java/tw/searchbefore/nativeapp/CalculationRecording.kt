package tw.searchbefore.nativeapp

import org.json.JSONObject

/** A draft is not a use record. It contains no date, plot, operator or persistence side effect. */
internal data class CalculationDraft(val details: ApplicationDetails, val reference: String)

internal object CalculationRecording {
    fun tanks(row: UsageRow, water: String, count: String): CalculationDraft? = runCatching {
        require(!row.usage.optBoolean("isSpecial") && !row.json.optBoolean("seed"))
        val result = requireNotNull(tankAmounts(row, water, count))
        val details = ApplicationDetails(water = water.toBigDecimal().stripTrailingZeros().toPlainString(),
            totalWater = result.waterTotal, amount = result.agentTotal, unit = row.unit)
        details.validate()
        CalculationDraft(details, "桶數試算參考：每桶 $water 公升 × $count 桶；總水量 ${result.waterTotal} 公升、製品 ${result.agentTotal} ${row.unit}。帶入值不是實際施用證明，請依已發生的操作修改確認。")
    }.getOrNull()

    fun area(row: UsageRow, water: String, area: String, unit: AreaUnit): CalculationDraft? = runCatching {
        val result = requireNotNull(areaAmounts(row, water, area, unit))
        // Even a single area estimate is not measured use. Never select an interval endpoint.
        val details = ApplicationDetails(water = water.toBigDecimal().stripTrailingZeros().toPlainString())
        details.validate()
        CalculationDraft(details, "面積試算參考：$area ${unit.label}；製品 ${result.agentTotal} ${row.unit}、水量 ${result.waterTotal} 公升。未自動填入實際總量或選擇區間上限；請填已實際施用的數量，未知可留空。")
    }.getOrNull()

    fun append(data: JSONObject, row: UsageRow, date: String, plotId: String, details: ApplicationDetails, confirmed: Boolean): JSONObject {
        require(confirmed) { "請先確認這是已實際施用的紀錄" }
        require(row.canCalculate && !row.formExcluded && !row.usage.optBoolean("isSpecial") && !row.json.optBoolean("seed")) {
            "此筆不提供計算帶入，請回原登記核對並記錄實際用途"
        }
        return Backup.appendRecord(data, row, date, plotId, details)
    }
}
