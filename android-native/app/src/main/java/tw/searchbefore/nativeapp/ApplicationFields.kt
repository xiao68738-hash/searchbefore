package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType

@Composable fun ApplicationFields(value: ApplicationDetails, change: (ApplicationDetails) -> Unit) {
    OutlinedTextField(value.water, { change(value.copy(water = it.take(20))) }, label = { Text("實際每桶水量（公升，可留空）") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
    OutlinedTextField(value.totalWater, { change(value.copy(totalWater = it.take(20))) }, label = { Text("本次實際總水量（公升，可留空）") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
    OutlinedTextField(value.amount, { change(value.copy(amount = it.take(20), unit = if(it.isBlank()) "" else value.unit)) }, label = { Text("本次製品總用量（不是有效成分量）") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
    Text("製品用量單位：${value.unit.ifEmpty { "未選擇" }}")
    Row(horizontalArrangement = Arrangement.SpaceEvenly, modifier = Modifier.fillMaxWidth()) {
        ApplicationDetails.units.forEach { unit -> FilterChip(selected = value.unit == unit, enabled = value.amount.isNotBlank(), onClick = { change(value.copy(unit = unit)) }, label = { Text(unit) }) }
    }
    OutlinedTextField(value.operator, { change(value.copy(operator = it.take(120))) }, label = { Text("操作者（可留空）") }, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(value.notes, { change(value.copy(notes = it.take(2000))) }, label = { Text("施用方式／商品名／實際操作備註") }, modifier = Modifier.fillMaxWidth())
    Text("只記錄已發生的用量，留空表示未記錄，不會由稀釋倍數自動填入。種子處理等特殊用途也可記錄實際製品量與方式，不產生倍數。")
    runCatching { value.validate() }.exceptionOrNull()?.message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
}
