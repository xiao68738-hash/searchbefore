package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import java.time.LocalDate

/** Explicit confirmation with restorable inputs. Cancel/recreation never invokes save. */
@Composable internal fun CalculationRecordDialog(row: UsageRow, data: JSONObject, draft: CalculationDraft, enabled: Boolean,
    dismiss: () -> Unit, save: (String, String, ApplicationDetails, Boolean) -> Boolean) {
    var date by rememberSaveable(row.id, draft.reference) { mutableStateOf(LocalDate.now().toString()) }
    var plotId by rememberSaveable(row.id, draft.reference) { mutableStateOf("") }
    var water by rememberSaveable(row.id, draft.reference) { mutableStateOf(draft.details.water) }
    var total by rememberSaveable(row.id, draft.reference) { mutableStateOf(draft.details.totalWater) }
    var amount by rememberSaveable(row.id, draft.reference) { mutableStateOf(draft.details.amount) }
    var unit by rememberSaveable(row.id, draft.reference) { mutableStateOf(draft.details.unit) }
    var operator by rememberSaveable(row.id, draft.reference) { mutableStateOf("") }
    var notes by rememberSaveable(row.id, draft.reference) { mutableStateOf("") }
    var confirmed by rememberSaveable(row.id, draft.reference) { mutableStateOf(false) }
    var error by rememberSaveable(row.id, draft.reference) { mutableStateOf("") }
    var submitting by remember { mutableStateOf(false) }
    val details = ApplicationDetails(water, amount, unit, operator, notes, total)
    val plots = Backup.plots(data).filter { it.optString("crop", it.optString("name")) == row.crop }
    val validDate = Backup.validDate(date) && !LocalDate.parse(date).isAfter(LocalDate.now())
    val valid = runCatching {
        require(!row.formExcluded)
        require(validDate)
        require(plotId.isEmpty() || plots.any { it.getString("id") == plotId })
        details.validate()
    }.isSuccess
    AlertDialog(onDismissRequest = { if(!submitting) dismiss() }, title = { Text("確認計算帶入的實際施藥") }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()).testTag("calculationRecordForm"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("${row.crop} × ${row.pest}｜${row.name}\n${row.json.optString("content")} ${row.json.optString("form")}")
            Text(draft.reference)
            row.residueText?.let { ResidueNotice(it) }
            Text("只有最後按下儲存才會新增紀錄；取消不儲存。已開啟雲端同步者仍須自行執行同步。")
            OutlinedTextField(date, { date = it.take(10); confirmed = false }, label = { Text("實際施藥日期 YYYY-MM-DD") }, modifier = Modifier.fillMaxWidth())
            if(!validDate) Text("請填有效的實際施藥日期，不可填未來日期。", color = MaterialTheme.colorScheme.error)
            PlotPicker(plots, plotId, "未指定田區", enabled && !submitting) { plotId = it; confirmed = false }
            Text("僅可選相同登記作物的田區；未指定不會自動歸入田區。", style = MaterialTheme.typography.bodySmall)
            if(plotId.isNotEmpty() && plots.none { it.getString("id") == plotId }) Text("原田區已不存在或作物不符，請重新選擇。", color = MaterialTheme.colorScheme.error)
            ApplicationFields(details, fromCalculation = true) {
                water = it.water; total = it.totalWater; amount = it.amount; unit = it.unit; operator = it.operator; notes = it.notes
                confirmed = false; error = ""
            }
            Row {
                Checkbox(checked = confirmed, enabled = enabled && !submitting, onCheckedChange = { confirmed = it }, modifier = Modifier.testTag("confirmActualApplication"))
                Text("我已核對日期、田區與用量，確認這是實際施用，不是預計施用或試算。", modifier = Modifier.weight(1f))
            }
            if(error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
        }
    }, confirmButton = {
        TextButton(enabled = enabled && !submitting && confirmed && valid, onClick = {
            if(!submitting) {
                submitting = true
                if(save(date, plotId, details, confirmed)) dismiss()
                else { submitting = false; error = "紀錄檢查未通過，尚未儲存；請確認田區及用量後重試。" }
            }
        }) { Text("確認並儲存實際用藥") }
    }, dismissButton = { TextButton(enabled = !submitting, onClick = dismiss) { Text("取消，不儲存") } })
}
