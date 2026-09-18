package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** Reuse validated dilution rules, never invent a ratio or save an actual-use record on navigation. */
@Composable internal fun CalculationScreen(row: UsageRow?, enabled: Boolean, choose: () -> Unit, saveRecipe: (UsageRow, String) -> Unit) {
    var water by rememberSaveable(row?.id) { mutableStateOf("1") }
    LazyColumn(Modifier.testTag("calculationList"), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 16.dp)) {
        item { QueryStep(1, "配藥計算") }
        if(row == null) {
            item { Info("先選擇一筆登記用法", "請從查詢結果的藥劑卡按「配藥計算」，帶入該作物與病蟲害的登記倍數。不會自行假設倍數。") }
            item { Button(enabled = enabled, onClick = choose, modifier = Modifier.fillMaxWidth()) { Text("前往查詢選藥") } }
        } else {
            item { BrandCard {
                Text(row.name, style = MaterialTheme.typography.headlineMedium)
                Text("${row.crop} × ${row.pest}", style = MaterialTheme.typography.titleMedium)
                Text("${row.json.optString("content")} ${row.json.optString("form")}")
                Text("${row.usage.getString("label")}：${row.usage.getString("value")}")
                Text("倍數依選取的原登記鎖定；更換作物或用途請重新查詢。", style = MaterialTheme.typography.bodySmall)
            } }
            row.residueText?.let { warning -> item { ResidueNotice(warning) } }
            if(row.canCalculate && !row.formExcluded) {
                item { QueryStep(2, "輸入每桶水量") }
                item { OutlinedTextField(water, { water = it.take(16) }, label = { Text("每桶水量（公升）") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, modifier = Modifier.fillMaxWidth()) }
                item { BrandCard {
                    Text("藥劑製品用量", style = MaterialTheme.typography.titleMedium)
                    Text(row.amount(water)?.let { "$it ${row.unit}" } ?: "請輸入有效水量", style = MaterialTheme.typography.headlineMedium)
                    Text("僅為此筆稀釋倍數換算，仍須遵守登記施用量與產品標示；極小用量需使用合適量具。")
                } }
                val dose = row.json.optString("dose")
                if(dose.isNotBlank() && dose != "-") item { Info("登記用量（依原單位）", dose) }
                val note = row.json.optString("note")
                if(note.isNotBlank() && note != "-") item { Info("使用注意事項", note) }
                item { Button(enabled = enabled && row.amount(water) != null, onClick = { saveRecipe(row, water) }, modifier = Modifier.fillMaxWidth()) { Text("存成常用配方") } }
            } else item { Info("此用法不提供稀釋計算", "特殊施用方式或採收型態不適用／待核對，請依原登記及產品標示操作。") }
            item { OutlinedButton(enabled = enabled, onClick = choose, modifier = Modifier.fillMaxWidth()) { Text("返回查詢／紀錄實際用藥") } }
        }
    }
}

/** Presentation only; use the same validated date function as existing records. */
internal fun countdownLabel(record: JSONObject, today: LocalDate): String {
    val date = Backup.harvestDate(record) ?: return "採收期未確認，請查產品標示"
    val days = ChronoUnit.DAYS.between(today, LocalDate.parse(date))
    return if(days > 0) "尚差 $days 天" else "等待期已到，仍需核對"
}

@Composable internal fun CountdownScreen(data: JSONObject, enabled: Boolean, recordsPage: () -> Unit) {
    var selected by rememberSaveable { mutableStateOf("") }
    val plots = Backup.plots(data)
    val records = data.getJSONArray("records").let { a -> (0 until a.length()).map { a.getJSONObject(it) } }
    val effective = selected.takeIf { id -> plots.any { it.optString("id") == id } }.orEmpty()
    val visible = records.filter { effective.isEmpty() || it.optString("plotId") == effective }
        .sortedBy { Backup.harvestDate(it) ?: "0000-00-00" }
    val today = LocalDate.now()
    LazyColumn(Modifier.testTag("countdownList"), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 16.dp)) {
        item { QueryStep(1, "安全採收期倒數") }
        item { Text("依實際用藥紀錄逐筆計算。等待期已到不代表殘留合格，未確認紀錄也不會當成 0 天。") }
        item { PlotPicker(plots, effective, "全部田區與未指定紀錄", enabled) { selected = it } }
        if(visible.isEmpty()) item { Info("目前沒有可顯示的紀錄", "查詢後記錄實際施藥，才會建立等待期參考；空白清單不代表可採收。") }
        items(visible, key = { it.getString("id") }) { record -> BrandCard {
            Text("${record.optString("crop")} × ${record.optString("pest")}", style = MaterialTheme.typography.titleMedium)
            Text(record.optString("agent"), style = MaterialTheme.typography.titleLarge)
            Text(countdownLabel(record, today), style = MaterialTheme.typography.headlineSmall)
            Text("施藥日期：${record.optString("date")}")
            Backup.harvestDate(record)?.let { Text("安全採收日參考：$it") }
            Text(plots.find { it.optString("id") == record.optString("plotId") }?.let { Backup.plotLabel(it) } ?: "未指定田區")
        } }
        item { OutlinedButton(enabled = enabled, onClick = recordsPage, modifier = Modifier.fillMaxWidth()) { Text("查看／管理用藥紀錄") } }
    }
}
