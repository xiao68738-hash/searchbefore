package tw.searchbefore.nativeapp

import org.json.JSONObject
import java.math.BigDecimal

/** Saved settings only, evaluated independently. No mixed tank, shared PHI or total across drugs. */
internal fun recipeBatchAmounts(recipe: JSONObject, water: String, tanks: String): TankAmounts? = runCatching {
    require(Regex("[0-9]{1,7}(\\.[0-9]{1,6})?").matches(water))
    require(Regex("[0-9]{1,5}").matches(tanks))
    val count = tanks.toInt()
    require(count in 1..10000)
    val totalWater = water.toBigDecimal().multiply(BigDecimal(count))
    require(totalWater <= BigDecimal("1000000"))
    TankAmounts(requireNotNull(Recipes.amount(recipe, water)), totalWater.stripTrailingZeros().toPlainString(),
        requireNotNull(Recipes.amount(recipe, totalWater.toPlainString())))
}.getOrNull()
