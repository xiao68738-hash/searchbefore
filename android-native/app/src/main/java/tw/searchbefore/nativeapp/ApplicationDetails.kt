package tw.searchbefore.nativeapp

import org.json.JSONObject
import java.math.BigDecimal

/** Actual measured use, not a prescription or an automatically accepted calculator result. */
data class ApplicationDetails(
    val water: String = "", val amount: String = "", val unit: String = "",
    val operator: String = "", val notes: String = "", val totalWater: String = ""
) {
    fun validate() {
        number(water); number(amount); number(totalWater, "100000000")
        require((amount.isBlank() && unit.isBlank()) || (amount.isNotBlank() && unit in units)) { "有實際製品用量時，請選擇對應單位；未填用量時請清除單位" }
        require(operator.trim().length <= 120 && notes.length <= 2000) { "操作者或備註過長" }
    }
    fun applyTo(record: JSONObject): JSONObject {
        validate()
        // The web format expects water to be a number; null/unknown is carried explicitly.
        record.put("water", number(water)?.toDouble() ?: 0.0)
            .put("waterRecorded", water.isNotBlank())
            .put("totalWater", number(totalWater, "100000000")?.toDouble() ?: "")
            .put("actualAmount", number(amount)?.stripTrailingZeros()?.toPlainString().orEmpty())
            .put("actualAmountUnit", unit).put("operator", operator.trim()).put("notes", notes.trim())
        return record
    }
    companion object {
        val units = listOf("mL", "L", "g", "kg")
        fun number(raw: String, maximum: String = "10000000"): BigDecimal? {
            if (raw.isBlank()) return null
            require(raw.length <= 20 && Regex("[0-9]+(?:\\.[0-9]{1,6})?").matches(raw)) { "用量須為非負數字，最多六位小數，不接受科學記號" }
            return BigDecimal(raw).also { require(it >= BigDecimal.ZERO && it <= BigDecimal(maximum)) { "用量超出可記錄範圍" } }
        }
        private fun displayNumber(value: Any?): String = if(value is Number) runCatching { BigDecimal(value.toString()).stripTrailingZeros().toPlainString() }.getOrDefault(value.toString()) else if(value == null || value == JSONObject.NULL) "" else value.toString()
        fun from(record: JSONObject) = ApplicationDetails(
            water = if (record.optBoolean("waterRecorded", record.optDouble("water", 0.0) > 0)) displayNumber(record.opt("water")) else "",
            amount = record.optString("actualAmount"), unit = record.optString("actualAmountUnit"),
            operator = record.optString("operator"), notes = record.optString("notes"), totalWater = displayNumber(record.opt("totalWater"))
        )
        fun summary(record: JSONObject): String {
            val d = from(record)
            return "每桶水量：${if(d.water.isBlank()) "未記錄" else d.water + " 公升"}；總水量：${if(d.totalWater.isBlank()) "未記錄" else d.totalWater + " 公升"}；實際製品總用量：${if(d.amount.isBlank()) "未記錄" else d.amount + " " + d.unit}"
        }
    }
}
