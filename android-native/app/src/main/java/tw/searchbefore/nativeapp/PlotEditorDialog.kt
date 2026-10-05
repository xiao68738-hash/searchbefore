package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import java.time.LocalDate

internal data class PlotDraft(val crop: String, val tag: String, val plantDate: String, val variety: String = "", val custom: Boolean = false) {
    fun validate(crops: List<String>, editing: Boolean = false) {
        require(crop.trim().length in 1..120 && crop.none { it.isISOControl() }) { "請填寫 1～120 字的作物名稱" }
        require(editing || custom || crop.trim() in crops) { "請選登記作物，或明確勾選自訂名稱" }
        require(tag.trim().length <= 120 && tag.none { it.isISOControl() }) { "田區名稱最多 120 字，不含控制字元" }
        require(variety.trim().length <= 120 && variety.none { it.isISOControl() }) { "品種最多 120 字，不含控制字元" }
        require(plantDate.isEmpty() || (Backup.validDate(plantDate) && !LocalDate.parse(plantDate).isAfter(LocalDate.now()))) { "請填有效的實際種植日期，不可填未來日期" }
    }
}

@Composable internal fun PlotEditorDialog(crops: List<String>, original: JSONObject?, enabled: Boolean,
    dismiss: () -> Unit, save: (PlotDraft) -> Boolean) {
    val key = original?.optString("id") ?: "new"
    var crop by rememberSaveable(key) { mutableStateOf(original?.optString("crop", original.optString("name")) ?: "") }
    var tag by rememberSaveable(key) { mutableStateOf(original?.optString("tag") ?: "") }
    var variety by rememberSaveable(key) { mutableStateOf(original?.optString("variety") ?: "") }
    var date by rememberSaveable(key) { mutableStateOf(original?.optString("plantDate") ?: "") }
    var custom by rememberSaveable(key) { mutableStateOf(original?.optString("cropSource") == "custom") }
    var saveFailed by rememberSaveable(key) { mutableStateOf(false) }
    val draft = PlotDraft(crop, tag, date, variety, custom)
    val error = runCatching { draft.validate(crops, original != null) }.exceptionOrNull()?.message
    val focus = LocalFocusManager.current
    val keyboard = KeyboardOptions(imeAction = ImeAction.Done)
    val done = KeyboardActions(onDone = { focus.clearFocus() })
    AlertDialog(onDismissRequest = dismiss, title = { Text(if(original == null) "新增田區／種植批次" else "修改田區") }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if(original == null) {
                OutlinedTextField(crop, { crop = it.take(121); saveFailed = false }, label = { Text("作物名稱") }, singleLine = true, keyboardOptions = keyboard, keyboardActions = done)
                if(crop.isNotBlank() && crop.trim() !in crops && !custom) {
                    crops.filter { it.contains(crop.trim()) }.take(6).forEach { name ->
                        TextButton(onClick = { crop = name; custom = false }) { Text("選擇登記作物：$name") }
                    }
                }
                Row { Checkbox(custom, { custom = it; saveFailed = false }); Text("使用自訂作物名稱（僅作紀錄）") }
            } else Text("作物：$crop。保留原作物與識別碼，避免改變既有紀錄歸屬。")
            Text(if(crop.trim() in crops && original?.optString("cropSource") != "custom") "登記作物名稱；各用藥仍需個別查詢核對。"
                else "自訂／未對應作物只作田間紀錄，不會自動對應相似作物、提供用藥登記或推定採收期。")
            OutlinedTextField(variety, { variety = it.take(121); saveFailed = false }, label = { Text("品種（可留空）") }, singleLine = true, keyboardOptions = keyboard, keyboardActions = done)
            OutlinedTextField(tag, { tag = it.take(121); saveFailed = false }, label = { Text("田區名稱（可留空）") }, singleLine = true, keyboardOptions = keyboard, keyboardActions = done)
            OutlinedTextField(date, { date = it.take(11); saveFailed = false }, label = { Text("種植日期 YYYY-MM-DD（可留空）") }, singleLine = true, keyboardOptions = keyboard, keyboardActions = done)
            Text("留空不會補造日期；品種與田區名稱不改變原登記範圍。")
            if(error != null) Text(error, color = MaterialTheme.colorScheme.error)
            if(saveFailed) Text("未儲存，田區可能已更新。草稿保留，請先核對錯誤訊息。", color = MaterialTheme.colorScheme.error)
        }
    }, confirmButton = { TextButton(enabled = enabled && error == null, onClick = {
        focus.clearFocus()
        if(save(draft)) dismiss() else saveFailed = true
    }) { Text("儲存田區") } }, dismissButton = { TextButton(onClick = dismiss) { Text("取消") } })
}
