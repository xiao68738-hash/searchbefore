package tw.searchbefore.nativeapp

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject

/** Same entry points as the TWA. Opening a section never creates a record or uploads it. */
@Composable internal fun RecordHub(data: JSONObject, enabled: Boolean, openCountdown: (() -> Unit)? = null, open: (Int) -> Unit) {
    val summary = FieldSummaries.build(data)
    Column(Modifier.testTag("recordHub").verticalScroll(rememberScrollState()).padding(vertical = 18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        BrandCard {
            Text("田區摘要", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSecondaryContainer)
            if(summary == null) {
                Text("先建立一個田區", style = MaterialTheme.typography.titleLarge)
                Text("建立後，施藥與農務紀錄才會集中在同一個作物批次。", style = MaterialTheme.typography.bodyMedium)
                Text("不用一次填完，先建立名稱和種植日期即可。", style = MaterialTheme.typography.bodySmall)
                Button(enabled = enabled, onClick = { open(0) }) { Text("建立田區") }
            } else {
                Text(Backup.plotLabel(summary.plot), style = MaterialTheme.typography.titleLarge)
                Text("用藥 ${summary.pesticideCount}・農務 ${summary.farmCount}", style = MaterialTheme.typography.bodyMedium)
                Text("最新一筆", style = MaterialTheme.typography.titleSmall)
                Text(summary.latest?.let { "${it.label} · ${it.record.optString("date")}\n${it.details}" } ?: "尚無作業紀錄", style = MaterialTheme.typography.bodyMedium)
                Text("安全採收", style = MaterialTheme.typography.titleSmall)
                Text(Farm.safetyLabel(summary.safety), style = MaterialTheme.typography.bodyMedium,
                    color = if(summary.needsSafetyReview) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
                Text("僅依此田區完整用藥紀錄判斷；未指定田區的紀錄不會自動合併。", style = MaterialTheme.typography.bodySmall)
                Button(enabled = enabled, onClick = {
                    if(summary.needsSafetyReview) { if(openCountdown != null) openCountdown() else open(2) }
                    else open(1)
                }) { Text(summary.action) }
            }
            TextButton(enabled = enabled, onClick = { open(2) }) { Text("查看完整作業時間軸") }
        }
        listOf(
            Triple(0, "01・田區", "田區新增／田區管理" to "建立種植批次、設定預設田區，並查看每個田區的完整作業鏈。"),
            Triple(1, "02・作業", "農務與設備紀錄" to "記錄栽培、施肥、採收、採後處理、資材購入及設備保養等作業。"),
            Triple(3, "03・整理", "用藥歷史／匯出用藥紀錄" to "查看過去的施藥內容，再依日期與田區整理 Excel、PDF 或 CSV。")
        ).forEachIndexed { index, (destination, eyebrow, copy) ->
            Surface(onClick = { open(destination) }, enabled = enabled, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(21.dp),
                color = MaterialTheme.colorScheme.surface, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                Row(Modifier.padding(17.dp).heightIn(min = 74.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Surface(shape = RoundedCornerShape(15.dp), color = if(index == 1) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.primaryContainer) {
                        Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) { NativeTabIcon(if(index == 0) 2 else 4) }
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(eyebrow, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSecondaryContainer)
                        Text(copy.first, fontSize = 18.sp, lineHeight = 25.sp, fontWeight = FontWeight.Bold)
                        Text(copy.second, fontSize = 13.sp, lineHeight = 20.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text("›", fontSize = 22.sp, color = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

@Composable internal fun NativeUseReports(data: JSONObject, enabled: Boolean, export: (ReportScope, ReportLayout, String) -> Unit) {
    var from by rememberSaveable { mutableStateOf("") }
    var to by rememberSaveable { mutableStateOf("") }
    var plot by rememberSaveable { mutableStateOf("") }
    val scope = ReportScope(from, to, plot, "records")
    val valid = runCatching { scope.validate(data) }.isSuccess
    BrandCard(Modifier.testTag("useReports")) {
        Text("匯出用藥紀錄", style = MaterialTheme.typography.titleLarge)
        ReportScopeFields(data, scope, enabled, showKinds = false) { from = it.from; to = it.to; plot = it.plotId }
        listOf(ReportLayout.USE, ReportLayout.TAP).forEach { layout ->
            Text(layout.label, style = MaterialTheme.typography.titleMedium)
            listOf("xlsx" to "Excel", "pdf" to "PDF", "csv" to "CSV").forEach { (format, title) ->
                OutlinedButton(enabled = enabled && valid, modifier = Modifier.fillMaxWidth(), onClick = { export(scope, layout, format) }) {
                    Text("${if(layout == ReportLayout.TAP) "TAP 對照表" else "匯出"} $title")
                }
            }
        }
        Text("供自行保存、查閱與登打核對。不是官方 TAP 認證或自動上傳；完整還原請至個人頁匯出 JSON。", style = MaterialTheme.typography.bodySmall)
    }
}
