package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import java.time.LocalDate

@Composable fun FarmScreen(data: JSONObject, enabled: Boolean, save: (JSONObject) -> Unit, report: (String) -> Unit, export: () -> Unit) {
    var plotId by rememberSaveable { mutableStateOf("") }
    var type by rememberSaveable { mutableStateOf("cultivation") }
    var showTypes by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<JSONObject?>(null) }
    var editorOpen by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<JSONObject?>(null) }
    val plots = Backup.plots(data)
    val selectedPlot = plotId.takeIf { target -> plots.any { it.getString("id") == target } }.orEmpty()
    val rows = Farm.records(data).filter { selectedPlot.isEmpty() || it.optString("plotId") == selectedPlot }.sortedByDescending { it.optString("date") }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 16.dp)) {
        item { Text("農務紀錄", style = MaterialTheme.typography.headlineSmall) }
        item { PlotPicker(plots, selectedPlot, "全部田區／設備作業", enabled) { plotId = it } }
        if (selectedPlot.isNotEmpty()) item { Info("採收等待期參考", Farm.safetyLabel(Farm.safety(data, selectedPlot))) }
        item { Button(enabled = enabled, onClick = { showTypes = true }) { Text("新增農務紀錄") } }
        item { OutlinedButton(enabled = enabled, onClick = export) { Text("匯出用藥與農務 CSV") } }
        if (rows.isEmpty()) item { Text("尚無農務紀錄。栽培、施肥、採收、採後處理、資材購入及設備保養都可記在這裡。") }
        items(rows, key = { it.getString("id") }) { r ->
            val label = Farm.types[r.optString("type")] ?: "其他農務（原始備份）"
            Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("${r.optString("date")}｜$label", style = MaterialTheme.typography.titleMedium)
                Text(plots.find { it.getString("id") == r.optString("plotId") }?.let(Backup::plotLabel) ?: "未指定田區／設備作業")
                Farm.fields[r.optString("type")]?.forEach { field ->
                    val value = Farm.detailsText(r, field.key)
                    if (value.isNotEmpty()) Text("${field.label}：$value")
                }
                if (r.optString("operator").isNotEmpty()) Text("操作者：${r.optString("operator")}")
                if (r.optString("notes").isNotEmpty()) Text("備註：${r.optString("notes")}")
                if (r.optString("type") in Farm.types) TextButton(enabled = enabled, onClick = { editing = r; type = r.getString("type"); editorOpen = true }) { Text("修改紀錄") }
                TextButton(enabled = enabled, onClick = { deleting = r }) { Text("刪除紀錄") }
            } }
        }
    }
    if (showTypes) AlertDialog(onDismissRequest = { showTypes = false }, title = { Text("選擇農務類型") }, text = {
        Column { Farm.types.forEach { (key, label) -> TextButton(onClick = { type = key; editing = null; showTypes = false; editorOpen = true }) { Text(label) } } }
    }, confirmButton = { TextButton(onClick = { showTypes = false }) { Text("取消") } })
    if (editorOpen) FarmEditor(data, type, selectedPlot, editing, enabled, close = { editorOpen = false }) { next -> save(next); editorOpen = false }
    deleting?.let { r -> AlertDialog(onDismissRequest = { deleting = null }, title = { Text("刪除此筆農務？") },
        text = { Text("${r.optString("date")} ${Farm.types[r.optString("type")] ?: "農務"}\n若已啟用同步，下次同步會把刪除傳到同帳號。需要保留完整歷史時，請先匯出備份。") },
        confirmButton = { TextButton(enabled = enabled, onClick = {
            runCatching { Farm.delete(data, "farmRecords", r.getString("id"), r.optString("updatedAt")) }.onSuccess(save).onFailure { report(it.message ?: "無法刪除") }
            deleting = null
        }) { Text("確認刪除") } }, dismissButton = { TextButton(onClick = { deleting = null }) { Text("取消") } }) }
}

@Composable private fun FarmEditor(data: JSONObject, type: String, selectedPlot: String, existing: JSONObject?, enabled: Boolean, close: () -> Unit, save: (JSONObject) -> Unit) {
    var date by remember { mutableStateOf(existing?.optString("date") ?: LocalDate.now().toString()) }
    var plotId by remember { mutableStateOf(existing?.optString("plotId") ?: selectedPlot) }
    var operator by remember { mutableStateOf(existing?.optString("operator") ?: data.optString("lastFarmOperator")) }
    var notes by remember { mutableStateOf(existing?.optString("notes").orEmpty()) }
    var error by remember { mutableStateOf("") }
    var harvestConfirmed by remember(date, plotId) { mutableStateOf(false) }
    val values = remember { mutableStateMapOf<String, String>().apply {
        Farm.fields.getValue(type).forEach { put(it.key, existing?.let { r -> Farm.detailsText(r, it.key) }.orEmpty()) }
    } }
    AlertDialog(onDismissRequest = close, title = { Text((if (existing == null) "新增" else "修改") + Farm.types.getValue(type)) }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PlotPicker(Backup.plots(data), plotId, if(type == "equipmentMaintenance") "設備作業可不指定田區" else "請指定田區", enabled) { plotId = it }
            if (Backup.plots(data).isEmpty() && type != "equipmentMaintenance") Text("請先到紀錄頁新增田區。")
            OutlinedTextField(value = date, onValueChange = { date = it.take(10) }, label = { Text("實際日期 YYYY-MM-DD") })
            Farm.fields.getValue(type).forEach { field ->
                OutlinedTextField(value = values[field.key].orEmpty(), onValueChange = { values[field.key] = it.take(500) }, label = { Text(field.label + if(field.required) "（必填）" else "") }, modifier = Modifier.fillMaxWidth())
            }
            OutlinedTextField(value = operator, onValueChange = { operator = it.take(120) }, label = { Text("操作者") })
            OutlinedTextField(value = notes, onValueChange = { notes = it.take(2000) }, label = { Text("備註") })
            if (type == "harvest" && plotId.isNotEmpty() && Backup.validDate(date)) Text(Farm.safetyLabel(Farm.safety(data, plotId, date)))
            if (type == "harvest") Row {
                Checkbox(checked = harvestConfirmed, onCheckedChange = { harvestConfirmed = it })
                Text("我已閱讀等待期提醒，確認這是實際發生的採收紀錄，不代表殘留合格或准許採收。")
            }
            if (error.isNotEmpty()) Text(error, color = MaterialTheme.colorScheme.error)
        }
    }, confirmButton = { TextButton(enabled = enabled, onClick = {
        runCatching { Farm.save(data, existing?.getString("id"), existing?.optString("updatedAt").orEmpty(), type, date, plotId, operator, notes, values.toMap(), harvestConfirmed) }
            .onSuccess(save).onFailure { error = it.message ?: "農務資料不正確" }
    }) { Text("儲存實際紀錄") } }, dismissButton = { TextButton(onClick = close) { Text("取消") } })
}
