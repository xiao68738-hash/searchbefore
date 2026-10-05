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

@Composable internal fun RecipeReferenceDialog(recipe: JSONObject, catalog: Catalog, dismiss: () -> Unit) {
    val options = RecipeUse.referenceOptions(recipe, catalog)
    AlertDialog(onDismissRequest = dismiss, title = { Text("現行原登記用途") }, text = {
        LazyColumn(Modifier.testTag("referenceOptions"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Text("${recipe.optString("crop")} × ${recipe.optString("pest")}｜${recipe.optString("agent")}")
                Text("收藏不代表現行使用許可；以下逐筆列出相同作物、對象及藥名的原登記。請自行核對商品、含量、劑型與採收部位，不自動挑選相似用法。")
            }
            if(options.isEmpty()) item { Text("目前找不到符合的原登記。不要沿用舊用途，請回查詢核對產品標示。") }
            items(options, key = { "${it.row.id}:${it.row.json.optString("selectedHarvestForm")}" }) { option ->
                val row = option.row
                HorizontalDivider()
                Text("${row.json.optString("content")} ${row.json.optString("form")}｜${option.formLabel}")
                BrandNames(row)
                UsageFacts(row.usage.optString("label"), row.usage.optString("value"), row.harvestLabel())
                if(row.usage.optString("detail").isNotBlank()) Text(row.usage.getString("detail"))
                for(field in listOf("dose", "times", "note")) row.json.optString(field).takeIf { it.isNotBlank() && it != "-" }?.let { Text(it) }
                row.residueText?.let { ResidueNotice(it) }
            }
        }
    }, confirmButton = { TextButton(onClick = dismiss) { Text("關閉用途查閱") } })
}
