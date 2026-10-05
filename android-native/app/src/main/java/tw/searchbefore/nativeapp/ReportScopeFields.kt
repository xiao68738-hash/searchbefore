package tw.searchbefore.nativeapp

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import org.json.JSONObject

@Composable internal fun ReportScopeFields(data: JSONObject, scope: ReportScope, enabled: Boolean, change: (ReportScope) -> Unit) {
    val focus = LocalFocusManager.current
    Text("閱讀用報表範圍", style = MaterialTheme.typography.titleMedium)
    Text("以下篩選只影響 CSV／Excel／PDF；完整 JSON 備份仍包含全部紀錄。", style = MaterialTheme.typography.bodySmall)
    PlotPicker(Backup.plots(data), scope.plotId, "全部田區與未指定紀錄", enabled) { change(scope.copy(plotId = it)) }
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        ReportScope.kinds.forEach { (key, label) -> FilterChip(selected = scope.kind == key, enabled = enabled,
            onClick = { change(scope.copy(kind = key)) }, label = { Text(label) }) }
    }
    OutlinedTextField(scope.from, { change(scope.copy(from = it.take(11))) }, enabled = enabled, label = { Text("報表起日 YYYY-MM-DD（可留空）") },
        singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { focus.clearFocus() }))
    OutlinedTextField(scope.to, { change(scope.copy(to = it.take(11))) }, enabled = enabled, label = { Text("報表迄日 YYYY-MM-DD（可留空）") },
        singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { focus.clearFocus() }))
    val selected = runCatching { scope.counts(data) }
    selected.onSuccess { Text("將匯出 ${it.first} 筆用藥、${it.second} 筆農務。") }
        .onFailure { Text(it.message ?: "請檢查篩選條件", color = MaterialTheme.colorScheme.error) }
    TextButton(enabled = enabled, onClick = { change(ReportScope()) }) { Text("清除報表篩選") }
}
