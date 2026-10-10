package tw.searchbefore.nativeapp

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Same public feature descriptions as the TWA home. No account or record access. */
internal val homeFeatures = listOf(
    "登記但不得檢出提醒" to "對人工確認的精確作物與藥劑組合顯示殘留檢驗提醒；相似名稱、群組或查無資料不會自動判定。",
    "雙向合法用藥查詢" to "可依作物與病蟲害找藥，也可由藥劑反查實際登記作物；逐筆顯示倍數與安全採收期。",
    "配藥換算" to "把藥劑倍數帶入水量、桶數或面積，快速算出現場需要的實際用量。",
    "施藥紀錄與安全採收連動" to "完成施藥後留下紀錄，依同田區全部用藥判斷最晚可採日；資料不足時不誤顯示可採收。",
    "農務與設備管理" to "整理栽培、施肥、採收、資材與施藥紀錄，也可一次登錄多筆設備保養、維修、校正或清潔作業。",
    "履歷整理與多格式匯出" to "依日期與田區整理紀錄，匯出 Excel、PDF 或 CSV，方便自行保存、查閱與後續登打。",
    "本機備份與選用雲端" to "預設只存在這台裝置，可下載 JSON 完整備份；明確同意後才會同步部分田間資料。"
)

@Composable internal fun HomeFeatureCard(title: String, description: String) {
    Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Text(title, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = MaterialTheme.colorScheme.onPrimaryContainer)
            Text(description, fontSize = 14.sp, lineHeight = 22.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** TWA's three-step introduction. Dismissal is local UI preference, never cloud data. */
@Composable internal fun FirstUseGuide(dismiss: () -> Unit) {
    Surface(Modifier.fillMaxWidth().testTag("firstUseGuide"), shape = RoundedCornerShape(21.dp),
        color = MaterialTheme.colorScheme.surface, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("第一次使用，只要三步", fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold, fontSize = 17.sp,
                color = MaterialTheme.colorScheme.onPrimaryContainer)
            listOf("選擇查法 — 可用作物找藥，也能用藥劑反查實際登記作物。",
                "核對登記 — 查看作物、防治對象、稀釋倍數與安全採收期。",
                "帶入計算並記錄 — 算好用量，完成後留下施藥紀錄與採收倒數。").forEachIndexed { index, text ->
                Row(horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                    Surface(Modifier.size(24.dp), shape = CircleShape, color = MaterialTheme.colorScheme.primary) {
                        Box(contentAlignment = Alignment.Center) { Text("${index + 1}", fontSize = 14.sp, fontWeight = FontWeight.Bold) }
                    }
                    Text(text, Modifier.weight(1f), fontSize = 14.5.sp, lineHeight = 22.sp)
                }
            }
            TextButton(onClick = dismiss, modifier = Modifier.align(Alignment.End)) { Text("我知道怎麼用了", fontSize = 13.sp) }
        }
    }
}

/** Wrapping chips match the web density but retain Android's 48dp touch targets. */
@OptIn(ExperimentalLayoutApi::class)
@Composable internal fun SearchChip(label: String, modifier: Modifier = Modifier, detail: String = "", selected: Boolean = false, onClick: () -> Unit) {
    Surface(onClick = onClick, modifier = modifier, shape = RoundedCornerShape(12.dp),
        color = if(selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, if(selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant)) {
        FlowRow(Modifier.heightIn(min = 48.dp).padding(horizontal = 12.dp, vertical = 11.dp), horizontalArrangement = Arrangement.spacedBy(5.dp), verticalArrangement = Arrangement.Center) {
            Text(label, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimaryContainer)
            if(detail.isNotEmpty()) Text(detail, fontSize = 12.sp, lineHeight = 18.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable internal fun NativeAnnouncements(catalog: Catalog?, dismiss: () -> Unit) {
    AlertDialog(onDismissRequest = dismiss, title = { Text("公告") }, text = {
        LazyColumn(verticalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.testTag("announcementsList")) {
            item { Text("${releaseIdentityLabel(BuildConfig.DEBUG, BuildConfig.VERSION_NAME)}\n資料版本 ${catalog?.version.orEmpty()}\n以下為隨本版附帶的網站公告，不代表原生版本的發布日期。", fontSize = 13.sp) }
            items(catalog?.announcements.orEmpty()) { entry ->
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(entry.optString("date"), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(entry.optString("title"), fontWeight = FontWeight.Bold)
                    Text(entry.optString("body"), fontSize = 14.sp, lineHeight = 22.sp)
                    HorizontalDivider()
                }
            }
        }
    }, confirmButton = { TextButton(onClick = dismiss) { Text("關閉公告") } })
}
