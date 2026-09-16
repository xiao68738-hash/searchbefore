package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.json.JSONObject

@Composable fun RecipesScreen(data: JSONObject, enabled: Boolean, save: (JSONObject) -> Unit, report: (String) -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    var selected by remember { mutableStateOf<Pair<Int, JSONObject>?>(null) }
    var deleting by remember { mutableStateOf<Pair<Int, JSONObject>?>(null) }
    val rows = Recipes.rows(data)
    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 16.dp)) {
        item { Text("常用配方", style = MaterialTheme.typography.headlineSmall) }
        item { Text("配方是先前保存的換算設定，不會自動產生施藥紀錄。使用前仍須核對當時登記及產品標示；本頁資料只在本機與 JSON 備份中。") }
        item { OutlinedTextField(value = query, onValueChange = { query = it.take(120) }, label = { Text("搜尋作物、藥劑或商品名") }, modifier = Modifier.fillMaxWidth()) }
        if (rows.isEmpty()) item { Text("在查詢結果展開配藥計算後，按「存成常用配方」。") }
        itemsIndexed(rows) { index, recipe ->
            if (query.isBlank() || listOf("crop", "agent", "brand").any { recipe.optString(it).contains(query.trim()) }) {
                Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${recipe.optString("crop")} × ${recipe.optString("pest")}", style = MaterialTheme.typography.titleMedium)
                    Text(recipe.optString("agent"), style = MaterialTheme.typography.titleLarge)
                    if (recipe.optString("brand").isNotEmpty()) Text("商品名：${recipe.optString("brand")}")
                    val amount = Recipes.amount(recipe, recipe.optString("water"))
                    Text(if(amount == null) "此舊配方資料不完整，不提供自動換算；請回原登記查詢。" else "${recipe.optString("water")} 公升水 → $amount ${Recipes.unit(recipe)} 製品")
                    if (recipe.optString("note").isNotBlank()) Text(recipe.optString("note"))
                    TextButton(enabled = enabled && amount != null, onClick = { selected = index to recipe }) { Text("調整水量／商品名／備註") }
                    TextButton(enabled = enabled, onClick = { deleting = index to recipe }) { Text("刪除此配方") }
                } }
            }
        }
    }
    selected?.let { (index, recipe) ->
        var water by remember { mutableStateOf(recipe.optString("water")) }
        var brand by remember { mutableStateOf(recipe.optString("brand")) }
        var note by remember { mutableStateOf(recipe.optString("note")) }
        var error by remember { mutableStateOf("") }
        AlertDialog(onDismissRequest = { selected = null }, title = { Text(recipe.optString("agent")) }, text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("保存倍數：${recipe.optString("dil")}；不更改原配方倍數。")
                OutlinedTextField(value = water, onValueChange = { water = it.take(16) }, label = { Text("每桶水量（公升）") })
                Text(Recipes.amount(recipe, water)?.let { "製品用量：$it ${Recipes.unit(recipe)}" } ?: "水量無效或換算量過小，請核對量具。")
                OutlinedTextField(value = brand, onValueChange = { brand = it.take(120) }, label = { Text("商品名（可留空，須與原清單相符）") })
                recipe.optJSONArray("brands")?.let { a -> if(a.length() > 0) Text((0 until a.length()).joinToString("、") { a.getString(it) }) }
                OutlinedTextField(value = note, onValueChange = { note = it.take(2000) }, label = { Text("備註") })
                if(error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error)
            }
        }, confirmButton = { TextButton(enabled = enabled, onClick = {
            runCatching { Recipes.update(data, index, NativeSync.canonical(recipe), water, brand, note) }.onSuccess { save(it); selected = null }.onFailure { error = it.message ?: "配方修改失敗" }
        }) { Text("儲存配方") } }, dismissButton = { TextButton(onClick = { selected = null }) { Text("取消") } })
    }
    deleting?.let { (index, recipe) -> AlertDialog(onDismissRequest = { deleting = null }, title = { Text("刪除常用配方？") },
        text = { Text("只刪除此裝置保存的 ${recipe.optString("agent")} 配方，不會刪除實際施藥紀錄。") },
        confirmButton = { TextButton(enabled = enabled, onClick = {
            runCatching { Recipes.remove(data, index, NativeSync.canonical(recipe)) }.onSuccess(save).onFailure { report(it.message ?: "無法刪除配方") }; deleting = null
        }) { Text("確認刪除") } }, dismissButton = { TextButton(onClick = { deleting = null }) { Text("取消") } }) }
}
