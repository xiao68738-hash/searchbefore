package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import org.json.JSONObject

@Composable internal fun RecipeUseDialog(recipe: JSONObject, catalog: Catalog, enabled: Boolean, dismiss: () -> Unit,
    use: (String, String) -> Unit) {
    val options = RecipeUse.options(recipe, catalog)
    AlertDialog(onDismissRequest = dismiss, title = { Text("使用前重新核對原登記") }, text = {
        LazyColumn(Modifier.testTag("recipeUseOptions"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Text("${recipe.optString("crop")} × ${recipe.optString("pest")}｜${recipe.optString("agent")}")
                Text("保存倍數：${recipe.optString("dil")}；每桶水量：${recipe.optString("water")} 公升。")
                Text("下列為目前資料中的原登記，可能與保存時不同。請核對含量、劑型、採收型態及產品標示後自行選擇；計算使用選取的現行倍數，不沿用舊倍數。")
                Text("只帶入每桶水量；桶數重設為 1，面積及實際施藥確認清空。不建立施藥紀錄，也不修改原配方。")
            }
            if(options.isEmpty()) item { Text("找不到相同作物、病蟲害與藥劑的可計算原登記。請回查詢重新選擇，不以相關病蟲害或相似藥名替代。") }
            items(options, key = { "${it.row.id}:${it.row.json.optString("selectedHarvestForm")}" }) { option ->
                val row = option.row
                HorizontalDivider()
                Text("${row.name}｜${row.json.optString("content")} ${row.json.optString("form")}", style = MaterialTheme.typography.titleMedium)
                Text("採收型態：${option.formLabel}")
                Text("${row.usage.optString("label")}：${row.usage.optString("value")}")
                Text(row.phi?.let { "安全採收期：${it.toBigDecimal().stripTrailingZeros().toPlainString()} 天" } ?: "安全採收期未確認，請查產品標示")
                row.residueText?.let { ResidueNotice(it) }
                val water = RecipeUse.water(recipe, row)
                if(water == null) Text("保存水量無法用於此筆換算，請回查詢重新輸入。")
                Button(enabled = enabled && water != null, onClick = { use(row.id, row.json.optString("selectedHarvestForm")) },
                    modifier = Modifier.fillMaxWidth().testTag("useRecipe:${row.id}:${row.json.optString("selectedHarvestForm")}")) {
                    Text("核對後使用這筆登記")
                }
            }
        }
    }, confirmButton = {}, dismissButton = { TextButton(onClick = dismiss) { Text("取消，不帶入") } })
}
