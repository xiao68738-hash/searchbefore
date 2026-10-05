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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import org.json.JSONObject

@Composable internal fun MultiCropComparisonScreen(catalog: Catalog, enabled: Boolean, back: () -> Unit, view: (UsageRow) -> Unit) {
    var crops by rememberSaveable { mutableStateOf(listOf<String>()) }
    var query by rememberSaveable { mutableStateOf("") }
    var formsJson by rememberSaveable { mutableStateOf("{}") }
    var pest by rememberSaveable(crops) { mutableStateOf("") }
    var pestQuery by rememberSaveable(crops) { mutableStateOf("") }
    var shown by rememberSaveable(crops, pest, formsJson) { mutableIntStateOf(10) }
    val selected = crops.map { CropSelection(it, JSONObject(formsJson).optString(it)) }
    val common = remember(catalog, crops, formsJson) { runCatching { MultiCropComparison.pests(catalog, selected) } }
    val results = remember(catalog, crops, formsJson, pest) { if(pest.isEmpty()) null else runCatching { MultiCropComparison.find(catalog, selected, pest) } }
    val focus = LocalFocusManager.current
    LazyColumn(Modifier.testTag("multiCropList"), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 16.dp)) {
        item { TextButton(onClick = back) { Text("返回一般查詢") } }
        item { Text("多作物共同查找", style = MaterialTheme.typography.headlineSmall) }
        item { Text("比較 2～5 種作物的共同原登記。藥名、含量、劑型與商品名稱均須相符；不同病蟲害分類不合併。") }
        item { Info("逐作物核對，不合併用量", "共同商品不代表可同桶或同倍數施用。每筆原用量、採收期與部位分開查看；不自動採最高倍數，不產生共同施藥紀錄。") }
        items(crops, key = { "selected:$it" }) { crop -> BrandCard {
            Text(crop, style = MaterialTheme.typography.titleLarge)
            TextButton(enabled = enabled, onClick = { crops = crops - crop; formsJson = JSONObject(formsJson).apply { remove(crop) }.toString() }) { Text("移除作物：$crop") }
            if(catalog.forms(crop).isNotEmpty()) {
                Text("比較時的採收部位")
                FilterChip(selected = JSONObject(formsJson).optString(crop).isEmpty(), onClick = { formsJson = JSONObject(formsJson).put(crop, "").toString() }, label = { Text("未指定（仍須核對）") })
                catalog.forms(crop).forEach { (id, label) ->
                    FilterChip(selected = JSONObject(formsJson).optString(crop) == id, onClick = { formsJson = JSONObject(formsJson).put(crop, id).toString() }, label = { Text(label) })
                }
            }
        } }
        if(crops.size < 5) {
            item { OutlinedTextField(query, { query = it.take(120) }, label = { Text("新增比較作物") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { focus.clearFocus() })) }
            if(query.isNotBlank()) {
                val matches = catalog.cropMatches(query).filter { it !in crops }
                items(matches.take(8), key = { "add:$it" }) { crop -> OutlinedButton(enabled = enabled, modifier = Modifier.fillMaxWidth(),
                    onClick = { crops = crops + crop; query = ""; focus.clearFocus() }) { Text("加入比較：$crop") } }
                if(matches.isEmpty()) item { Text("查無可新增的精確作物名稱；相似作物不自動加入。") }
                if(matches.size > 8) item { Text("還有其他符合名稱，請輸入更完整的作物名稱。") }
            }
        }
        if(crops.size < 2) item { Text("已選 ${crops.size} 種，請至少選 2 種作物。") }
        else if(common.isFailure) item { Text(common.exceptionOrNull()?.message ?: "請重新核對所選作物。") }
        else {
            item { Text("共同原登記防治對象 ${common.getOrThrow().size} 項") }
            item { OutlinedTextField(pestQuery, { pestQuery = it.take(120) }, label = { Text("篩選共同防治對象") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { focus.clearFocus() })) }
            items(common.getOrThrow().filter { NativeSearch.normalize(it).contains(NativeSearch.normalize(pestQuery)) }, key = { "pest:$it" }) { target ->
                FilterChip(selected = pest == target, enabled = enabled, onClick = { pest = target }, label = { Text("比較：$target") })
            }
            if(common.getOrThrow().isEmpty()) item { Text("沒有共同原登記對象。請分別查詢，不以夜蛾類、甜菜夜蛾等相關名稱代替。") }
        }
        if(results != null) {
            if(results.isFailure) item { Text(results.exceptionOrNull()?.message ?: "比較失敗，請重新選擇。") }
            else {
                val rows = results.getOrThrow()
                item { Text("$pest：${rows.size} 組有共同商品的登記") }
                if(rows.isEmpty()) item { Text("未找到相同含量、劑型且有共同商品的登記；無商品資料也不推定可共用。") }
                items(rows.take(shown), key = { "shared:${it.key}" }) { group -> BrandCard {
                    Text(group.name, style = MaterialTheme.typography.titleLarge)
                    Text("${group.content} ${group.form}")
                    SharedProductNames(group)
                    group.byCrop.forEach { (crop, registrations) ->
                        HorizontalDivider()
                        Text("$crop：${registrations.size} 筆原用法", style = MaterialTheme.typography.titleMedium)
                        registrations.forEach { row ->
                            Text("${row.usage.optString("label")}：${row.usage.optString("value")}；${row.harvestLabel()}")
                            row.residueText?.let { ResidueNotice(it) }
                            OutlinedButton(enabled = enabled, onClick = { view(row) }) { Text("查看 $crop × $pest 原登記") }
                        }
                    }
                } }
                if(rows.size > shown) item { TextButton(onClick = { shown += 10 }) { Text("顯示更多共同登記") } }
            }
        }
    }
}

@Composable private fun SharedProductNames(group: SharedRegistration) {
    var open by rememberSaveable(group.key) { mutableStateOf(false) }
    var query by rememberSaveable(group.key) { mutableStateOf("") }
    if(group.brands.size <= 3) Text("共同登記商品：${group.brands.joinToString("、")}")
    else TextButton(onClick = { open = true }) { Text("查看共同商品（${group.brands.size} 個）") }
    if(open) AlertDialog(onDismissRequest = { open = false }, title = { Text("${group.name}的共同商品") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("${group.content} ${group.form}；所選作物均有同名商品登記，仍須逐項核對產品標示與原用法。")
            OutlinedTextField(query, { query = it.take(120) }, label = { Text("篩選共同商品名稱") }, singleLine = true)
            val matches = group.brands.filter { NativeSearch.normalize(it).contains(NativeSearch.normalize(query)) }
            if(matches.isEmpty()) Text("沒有符合的共同商品")
            LazyColumn(Modifier.weight(1f, fill = false)) { items(matches) { Text(it, Modifier.padding(vertical = 6.dp)) } }
        }
    }, confirmButton = { TextButton(onClick = { open = false }) { Text("關閉共同商品清單") } })
}
