package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.json.JSONObject

@Composable internal fun CalendarExportButton(data: JSONObject, plotId: String, enabled: Boolean, export: (String) -> Unit) {
    var confirming by rememberSaveable(plotId) { mutableStateOf(false) }
    val result = remember(data, plotId) { runCatching { CalendarExport.groups(data, plotId) } }
    val known = result.getOrDefault(emptyList()).count { it.date != null }
    val unknown = result.getOrDefault(emptyList()).count { it.date == null }
    OutlinedButton(enabled = enabled && result.isSuccess && known in 1..2000, onClick = { confirming = true }, modifier = Modifier.fillMaxWidth()) {
        Text("匯出行事曆提醒（.ics）")
    }
    Text("${known} 組已知等待期（含歷史）；${unknown} 組未知不建立到期提醒。匯出檔不會自動更新。", style = MaterialTheme.typography.bodySmall)
    if(known > 2000) Text("事件超過 2,000 筆，請先選擇單一田區。")
    if(confirming) AlertDialog(onDismissRequest = { confirming = false }, title = { Text("匯出行事曆快照？") }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("只產生 $known 個已知等待期事件；$unknown 組含未知採收期，整組不產生到期事件。未指定田區的紀錄只作單筆參考。")
            Text("事件內容不是可採收許可。新增施藥、修改或刪除紀錄後，請回 APP 核對並自行移除舊事件；重複匯入可能產生重複提醒。")
            Text("檔案含作物／田區名稱與日期。你將自行選擇儲存位置及匯入的行事曆；該行事曆可能同步到其服務商。APP 不會直接讀寫你的行事曆或新增權限。")
            Text("預設事件為臺灣時間上午 7 點，含前一天傍晚及當時提醒；實際通知由你的行事曆設定決定。")
        }
    }, confirmButton = { TextButton(enabled = enabled && result.isSuccess && known in 1..2000, onClick = { confirming = false; export(plotId) }) { Text("我了解，選擇儲存位置") } },
        dismissButton = { TextButton(onClick = { confirming = false }) { Text("取消匯出") } })
}
