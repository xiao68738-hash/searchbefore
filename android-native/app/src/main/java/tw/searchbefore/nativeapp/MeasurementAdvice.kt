package tw.searchbefore.nativeapp

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import java.math.BigDecimal
import java.math.RoundingMode

internal data class MeasurementAdvice(val smallAmount: String? = null, val volumeReference: String? = null)

/** Display help only. It never changes the selected dilution, result or recorded quantity. */
internal fun measurementAdvice(row: UsageRow, amount: String?): MeasurementAdvice {
    if (!row.canCalculate || row.formExcluded || amount == null) return MeasurementAdvice()
    val value = amount.toBigDecimalOrNull()?.takeIf { it > BigDecimal.ZERO } ?: return MeasurementAdvice()
    val warning = if (value < BigDecimal("0.1"))
        "每桶製品用量低於 0.1 ${row.unit}，一般量具不易準確量取。請用符合精度的專用量具，並核對產品標示；不要憑目測四捨五入。" else null
    // Match the web's liquid-only, >= 1 mL reference boundary. A real bottle cap or kitchen
    // spoon has no guaranteed capacity and must not become an application instruction.
    val reference = if (row.unit == "mL" && value >= BigDecimal.ONE) {
        fun units(size: String) = value.divide(BigDecimal(size), 6, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString()
        "容量對照：每桶約為 ${units("5")} 個 5 mL，或 ${units("15")} 個 15 mL。這只供理解容量；請使用有刻度的農藥專用量具，不用一般瓶蓋或飲食餐具量藥。"
    } else null
    return MeasurementAdvice(warning, reference)
}

@Composable internal fun MeasurementAdviceText(row: UsageRow, amount: String?) {
    val advice = measurementAdvice(row, amount)
    advice.smallAmount?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    advice.volumeReference?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
}
