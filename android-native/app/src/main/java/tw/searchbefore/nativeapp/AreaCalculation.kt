package tw.searchbefore.nativeapp

import java.math.BigDecimal
import java.math.RoundingMode

internal data class DoseRange(val low: BigDecimal, val high: BigDecimal)
internal data class AreaAmounts(val perTank: String, val agentTotal: String, val waterTotal: String, val tanks: String)
internal enum class AreaUnit(val label: String, val squareMeters: String) {
    SQUARE_METER("平方公尺", "1"), HECTARE("公頃", "10000")
}

/** The source dose column is per hectare, but also contains per-tree/special-use prose.
 * Accept only a complete, dimensionally compatible scalar/range; never pick its upper bound.
 */
internal fun hectareDose(row: UsageRow): DoseRange? = runCatching {
    require(row.canCalculate && !row.formExcluded && !row.json.optBoolean("seed") && !row.usage.optBoolean("isSpecial"))
    val n = "([0-9]{1,7}(?:\\.[0-9]{1,6})?)"
    val match = Regex("^\\s*$n\\s*(?:[-~～–至]\\s*$n\\s*)?(公升|毫升|公斤|公克|mL|ml|L|kg|g)\\s*$")
        .matchEntire(row.json.optString("dose")) ?: return null
    val unit = match.groupValues[3]
    val liquid = unit in setOf("公升", "毫升", "mL", "ml", "L")
    require(row.unit == if(liquid) "mL" else "g")
    val scale = if(unit in setOf("公升", "公斤", "L", "kg")) BigDecimal("1000") else BigDecimal.ONE
    val low = match.groupValues[1].toBigDecimal().multiply(scale)
    val high = (match.groupValues[2].ifEmpty { match.groupValues[1] }).toBigDecimal().multiply(scale)
    require(low > BigDecimal.ZERO && high >= low && high <= BigDecimal("1000000"))
    DoseRange(low, high)
}.getOrNull()

private fun areaNumber(value: BigDecimal): String = if(value < BigDecimal("0.001")) "<0.001"
    else value.setScale(6, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString()

private fun interval(low: BigDecimal, high: BigDecimal): String =
    if(low.compareTo(high) == 0) areaNumber(low) else "${areaNumber(low)}～${areaNumber(high)}"

/** Read-only unit conversion, not spray-volume guidance. Fractional tanks are not rounded up. */
internal fun areaAmounts(row: UsageRow, water: String, area: String, unit: AreaUnit): AreaAmounts? = runCatching {
    val dose = requireNotNull(hectareDose(row))
    val number = Regex("[0-9]{1,7}(\\.[0-9]{1,6})?")
    require(number.matches(water) && number.matches(area))
    val perTank = requireNotNull(row.amount(water))
    val ha = area.toBigDecimal().multiply(unit.squareMeters.toBigDecimal()).movePointLeft(4)
    require(ha > BigDecimal.ZERO && ha <= BigDecimal("10000"))
    val low = dose.low.multiply(ha)
    val high = dose.high.multiply(ha)
    require(low >= BigDecimal("0.001")) // no misleading zero / unmeasurably tiny drug quantity
    val ratio = row.json.getString("dilution").replace(",", "").toBigDecimal()
    val waterLow = low.multiply(ratio).movePointLeft(3)
    val waterHigh = high.multiply(ratio).movePointLeft(3)
    require(waterHigh <= BigDecimal("1000000"))
    AreaAmounts(perTank, interval(low, high), interval(waterLow, waterHigh),
        interval(waterLow.divide(water.toBigDecimal(), 12, RoundingMode.HALF_UP),
            waterHigh.divide(water.toBigDecimal(), 12, RoundingMode.HALF_UP)))
}.getOrNull()
