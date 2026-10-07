package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalLayoutApi::class)
@Composable internal fun PhiFilterBar(maximum: Int, change: (Int) -> Unit) {
    var custom by rememberSaveable { mutableStateOf(false) }
    var input by rememberSaveable { mutableStateOf("") }
    var invalid by rememberSaveable { mutableStateOf(false) }
    Text("安全採收期篩選", style = MaterialTheme.typography.bodyMedium)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf(0, 3, 7, 14, 21).forEach { days -> FilterChip(selected = maximum == days,
            onClick = { change(days) }, label = { Text(if(days == 0) "全部" else "≤ $days 天") }) }
        FilterChip(selected = maximum !in listOf(0, 3, 7, 14, 21), onClick = {
            input = if(maximum > 0) maximum.toString() else ""; invalid = false; custom = true
        }, label = { Text(if(maximum !in listOf(0, 3, 7, 14, 21)) "自選 ≤ $maximum 天" else "自選天數") })
    }
    if(maximum > 0) Text("目前 ≤ $maximum 天；未知或不適用者不列入，不代表今日可採收。區間及備註採較長天數篩選。", style = MaterialTheme.typography.bodySmall)
    if(custom) AlertDialog(onDismissRequest = { custom = false }, title = { Text("自選安全採收期") }, text = {
        Column {
            OutlinedTextField(input, { input = it.take(16); invalid = false }, label = { Text("自選採收期（1～365 天）") },
                singleLine = true, isError = invalid, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
            if(invalid) Text("請輸入 1～365 的整數天數。", color = MaterialTheme.colorScheme.error)
        }
    }, confirmButton = { TextButton(onClick = {
        val limit = QueryFilters.phiLimit(input); invalid = limit == null
        if(limit != null) { change(limit); custom = false }
    }) { Text("套用天數") } }, dismissButton = { TextButton(onClick = { custom = false }) { Text("取消") } })
}
