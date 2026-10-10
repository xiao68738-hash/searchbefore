package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import org.json.JSONObject

@Composable internal fun TimelineScreen(data: JSONObject, enabled: Boolean, manage: (Boolean) -> Unit) {
    var plotId by rememberSaveable { mutableStateOf("") }
    var from by rememberSaveable { mutableStateOf("") }
    var to by rememberSaveable { mutableStateOf("") }
    var query by rememberSaveable { mutableStateOf("") }
    var type by rememberSaveable { mutableStateOf("") }
    var shown by rememberSaveable(plotId, from, to, query, type) { mutableIntStateOf(30) }
    val plots = Backup.plots(data)
    val filter = RecordFilter(plotId, from, to, query, type)
    val result = remember(data, filter) { runCatching { FarmTimeline.events(data, filter) } }
    val events = result.getOrDefault(emptyList())
    LazyColumn(Modifier.testTag("timelineList"), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 16.dp)) {
        item { Text("田區概況與整合時間軸", style = MaterialTheme.typography.headlineSmall) }
        item { PlotPicker(plots, plotId, "全部田區與未指定紀錄", enabled) { plotId = it } }
        if(plotId.isNotEmpty()) {
            val plot = plots.find { it.getString("id") == plotId }
            if(plot != null) item { BrandCard {
                Text(Backup.plotLabel(plot), style = MaterialTheme.typography.titleLarge)
                if(plot.optString("plantDate").isNotBlank()) Text("種植日期：${plot.optString("plantDate")}")
                val all = FarmTimeline.events(data, RecordFilter(plotId = plotId))
                Text("此田區全部歷史：${all.count { it.collection == "records" }} 筆用藥、${all.count { it.collection == "farmRecords" }} 筆農務")
                all.firstOrNull()?.let { Text("最近作業：${it.record.optString("date")} ${it.label}") }
                Text("等待期檢查採田區全部用藥，不受下方日期／文字篩選影響。")
                Text(Farm.safetyLabel(Farm.safety(data, plotId)))
            } }
        } else item { Text("請選田區查看完整概況與等待期。全部清單不合併不同田區的採收判斷，未指定紀錄也不自行歸入田區。") }
        item { RecordFilterFields(filter, enabled) { from = it.from; to = it.to; query = it.query; type = it.type } }
        item { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = type == "", enabled = enabled, onClick = { type = "" }, label = { Text("全部") })
            FilterChip(selected = type == "records", enabled = enabled, onClick = { type = "records" }, label = { Text("用藥") })
            FilterChip(selected = type == "farmRecords", enabled = enabled, onClick = { type = "farmRecords" }, label = { Text("農務") })
        } }
        result.exceptionOrNull()?.let { item { Text(it.message ?: "篩選條件無效", color = MaterialTheme.colorScheme.error) } }
        item { Text("篩選結果 ${events.size} 筆；依實際日期由新到舊，不修改原紀錄。") }
        if(result.isSuccess && events.isEmpty()) item { Text("沒有符合的紀錄，不代表沒有施藥或可以採收。") }
        items(events.take(shown), key = { it.key }) { event -> BrandCard {
            val record = event.record
            Text("${record.optString("date")}｜${event.label}", style = MaterialTheme.typography.titleMedium)
            Text(plots.find { it.optString("id") == record.optString("plotId") }?.let(Backup::plotLabel) ?: "未指定田區")
            Text(event.details)
            if(event.collection == "records") Text(Backup.harvestDate(record)?.let { "此筆等待期至 $it（仍須核對整區紀錄）" } ?: "此筆採收期未確認")
            if(record.optString("operator").isNotBlank()) Text("操作者：${record.optString("operator")}")
            if(record.optString("notes").isNotBlank()) Text("備註：${record.optString("notes")}")
        } }
        if(events.size > shown) item { TextButton(onClick = { shown += 30 }) { Text("顯示更多紀錄") } }
        item { OutlinedButton(enabled = enabled, onClick = { manage(false) }) { Text("管理用藥與田區") } }
        item { OutlinedButton(enabled = enabled, onClick = { manage(true) }) { Text("管理農務紀錄") } }
    }
}
