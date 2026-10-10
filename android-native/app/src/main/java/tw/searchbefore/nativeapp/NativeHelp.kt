package tw.searchbefore.nativeapp

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.net.toUri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable internal fun NativeHelpCard(catalog: Catalog, enabled: Boolean, home: Boolean = false) {
    val context = LocalContext.current
    var guideId by rememberSaveable { mutableStateOf("") }
    var message by rememberSaveable { mutableStateOf("") }
    fun open(url: String) {
        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, url.toUri())) }.onFailure { message = "無法開啟瀏覽器，請連網後再試。" }
    }
    BrandCard {
        if(home) Text("農藥使用知識", style = MaterialTheme.typography.bodySmall)
        Text(if(home) "施藥前先弄懂的四件事" else "使用指南與回饋", style = MaterialTheme.typography.titleMedium)
        Text("指南文字隨此版本提供，可離線閱讀；最新內容及圖解請至原網頁核對。")
        catalog.guides.forEachIndexed { index, guide ->
            OutlinedButton(enabled = enabled, modifier = Modifier.fillMaxWidth(), onClick = { guideId = guide.getString("id") }) {
                if(home) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text((index + 1).toString().padStart(2, '0'), fontWeight = FontWeight.Bold)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(guide.getString("title"), fontWeight = FontWeight.Bold)
                        val detail = when(guide.getString("id")) {
                            "guide-label.html" -> "先核對作物、防治對象、倍數與採收期"
                            "guide-dilution.html" -> "用一桶水示範單位與公式，不靠猜"
                            "guide-phi.html" -> "從最後一次施藥重新核對可採日期"
                            "guide-ppe.html" -> "人、天氣、器材與周邊環境一次檢查"
                            else -> ""
                        }
                        if(detail.isNotEmpty()) Text(detail, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text("›")
                } else Text(guide.getString("title"))
            }
        }
        NativeFeedbackEntry(catalog, enabled)
        Text("免登記植物保護資材", style = MaterialTheme.typography.titleMedium)
        Text("另查官方公告。這不是所選作物／病蟲害的登記用藥清單；不依名稱或病害分類推定全部適用，也不提供共用倍數。")
        OutlinedButton(enabled = enabled, onClick = { open("https://pesticide.aphia.gov.tw/information/Data/Protectnews") }) { Text("查看防檢署免登記資材公告") }
        if(message.isNotEmpty()) Text(message)
    }
    catalog.guides.find { it.optString("id") == guideId }?.let { guide ->
        AlertDialog(onDismissRequest = { guideId = "" }, title = { Text(guide.getString("title")) }, text = {
            val blocks = guide.getJSONArray("blocks").let { a -> (0 until a.length()).map { a.getString(it) } }
            LazyColumn(Modifier.testTag("offlineGuide"), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item { Text("隨本版附帶的指南文字，不代表已查證最新公告；原文保留的複核日期與來源見下方。") }
                items(blocks) { Text(it) }
            }
        }, confirmButton = { TextButton(enabled = enabled, onClick = { open(guide.getString("sourceUrl")) }) { Text("連網查看原文與圖解") } },
            dismissButton = { TextButton(onClick = { guideId = "" }) { Text("關閉指南") } })
    }
}

/** Only the caller's public catalog selection is offered; never access history or local records. */
@Composable internal fun RegistrationFeedbackEntry(catalog: Catalog, row: UsageRow, enabled: Boolean) {
    NativeFeedbackEntry(catalog, enabled, NativeFeedback.registrationContext(row), "回報此筆資料問題")
}

@Composable internal fun NativeFeedbackEntry(catalog: Catalog, enabled: Boolean, publicContext: String = "", label: String = if(publicContext.isEmpty()) "意見回饋／回報問題" else "回報這個查詢的問題") {
    val context = LocalContext.current
    var feedback by rememberSaveable(publicContext) { mutableStateOf(false) }
    OutlinedButton(enabled = enabled, onClick = { feedback = true }) { Text(label) }
    if(feedback) FeedbackDialog(catalog.version, enabled, { feedback = false }, copied = { body ->
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("噴前查回饋", body))
    }, emailAvailable = NativeFeedback.validEmail(catalog.feedbackEmail), mail = { subject, body ->
        val uri = "mailto:${Uri.encode(catalog.feedbackEmail, "@")}?subject=${Uri.encode(subject)}&body=${Uri.encode(body)}".toUri()
        context.startActivity(Intent(Intent.ACTION_SENDTO, uri))
    }, publicContext = publicContext)
}

@Composable internal fun FeedbackDialog(dataVersion: String, enabled: Boolean, dismiss: () -> Unit, copied: (String) -> Unit,
    emailAvailable: Boolean, mail: (String, String) -> Unit, publicContext: String = "") {
    var category by rememberSaveable { mutableStateOf(NativeFeedback.categories.first()) }
    var description by rememberSaveable { mutableStateOf("") }
    var message by rememberSaveable { mutableStateOf("") }
    var includeContext by rememberSaveable(publicContext) { mutableStateOf(false) }
    val body = runCatching { NativeFeedback.body(category, description, BuildConfig.VERSION_NAME, dataVersion, if(includeContext) publicContext else "") }.getOrNull()
    AlertDialog(onDismissRequest = dismiss, title = { Text("意見回饋／回報問題") }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("只附帶你填寫的內容、App 與資料版本。不會讀取帳號、田區、照片或紀錄；請勿填入密碼或私人資料。")
            NativeFeedback.categories.forEach { value -> FilterChip(selected = category == value, onClick = { category = value }, label = { Text(value) }) }
            OutlinedTextField(description, { description = it.take(2001) }, label = { Text("問題描述（最多 2,000 字）") }, modifier = Modifier.fillMaxWidth())
            if(publicContext.isNotEmpty()) {
                Row {
                    Checkbox(checked = includeContext, onCheckedChange = { includeContext = it }, modifier = Modifier.testTag("includePublicQuery"))
                    Text("附上以下公開查詢條件（可不勾選）", modifier = Modifier.weight(1f))
                }
                Text(publicContext)
            }
            Text("App ${BuildConfig.VERSION_NAME}／資料 $dataVersion。開啟郵件後仍須自行確認收件人、內容與寄送；本頁不會自動送出。")
            if(message.isNotEmpty()) Text(message)
        }
    }, confirmButton = { Column {
        TextButton(enabled = enabled && body != null, onClick = { runCatching { copied(requireNotNull(body)) }.onSuccess { message = "內容已複製，尚未送出。" }.onFailure { message = "複製失敗，請手動保留內容。" } }) { Text("複製回饋內容") }
        if(emailAvailable) TextButton(enabled = enabled && body != null, onClick = { runCatching { mail("噴前查回饋【$category】", requireNotNull(body)) }.onSuccess { message = "已開啟郵件草稿，尚未確認寄出。" }.onFailure { message = "無法開啟郵件，請改用複製內容。" } }) { Text("開啟郵件草稿") }
    } }, dismissButton = { TextButton(onClick = dismiss) { Text("取消") } })
}
