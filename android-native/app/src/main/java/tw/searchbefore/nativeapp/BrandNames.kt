package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp

@Composable internal fun BrandNames(row: UsageRow) {
    val brands = row.brands.distinct()
    var open by rememberSaveable(row.id) { mutableStateOf(false) }
    var query by rememberSaveable(row.id) { mutableStateOf("") }
    val focus = LocalFocusManager.current
    if(brands.size <= 3) {
        if(brands.isNotEmpty()) Text("商品名稱：${brands.joinToString("、")}", style = MaterialTheme.typography.bodyLarge)
    } else TextButton(onClick = { open = true }) { Text("查看商品名稱（${brands.size} 個）") }
    if(open) AlertDialog(onDismissRequest = { open = false }, title = { Text("${row.name}的商品名稱") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("${row.json.optString("content")} ${row.json.optString("form")}｜${row.crop} × ${row.pest}")
            Text("只列這筆原登記的商品名，仍須核對手邊產品標示。")
            OutlinedTextField(query, { query = it.take(120) }, label = { Text("篩選商品名稱") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { focus.clearFocus() }))
            val filtered = brands.filter { NativeSearch.normalize(it).contains(NativeSearch.normalize(query)) }
            Text("${filtered.size}／${brands.size} 個")
            LazyColumn(Modifier.weight(1f, fill = false), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if(filtered.isEmpty()) item { Text("查無符合商品名；不代表其他商品適用。") }
                items(filtered, key = { it }) { Text(it) }
            }
        }
    }, confirmButton = { TextButton(onClick = { open = false }) { Text("關閉商品清單") } })
}
