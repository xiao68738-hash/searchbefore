package tw.searchbefore.nativeapp

import java.math.BigDecimal

internal data class TankAmounts(val perTank: String, val waterTotal: String, val agentTotal: String)

/** Only scales a selected registration. Counts and totals are not a recommended application rate. */
internal fun tankAmounts(row: UsageRow, water: String, tanks: String): TankAmounts? = runCatching {
    require(row.canCalculate && !row.formExcluded)
    require(Regex("[0-9]{1,5}").matches(tanks))
    val count = tanks.toInt()
    require(count in 1..10000)
    require(Regex("[0-9]{1,7}(\\.[0-9]{1,6})?").matches(water))
    val per = requireNotNull(row.amount(water))
    val totalWater = water.toBigDecimal().multiply(BigDecimal(count))
    require(totalWater <= BigDecimal("1000000"))
    val total = requireNotNull(row.amount(totalWater.toPlainString()))
    TankAmounts(per, totalWater.stripTrailingZeros().toPlainString(), total)
}.getOrNull()
