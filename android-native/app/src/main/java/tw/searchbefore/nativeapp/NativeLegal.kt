package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** Fixed public URLs: never append account identifiers, tokens or a record payload. */
enum class NativePublicPage(val url: String) {
    PRIVACY("https://searchbefore.tw/privacy.html"),
    DELETION("https://searchbefore.tw/delete-account.html")
}

@Composable fun NativeLegalLinks(enabled: Boolean, open: (NativePublicPage) -> Unit) {
    BrandCard {
        Text("隱私與帳號管理", style = MaterialTheme.typography.titleMedium)
        OutlinedButton(enabled = enabled, onClick = { open(NativePublicPage.PRIVACY) }, modifier = Modifier.fillMaxWidth()) {
            Text("隱私權政策")
        }
        OutlinedButton(enabled = enabled, onClick = { open(NativePublicPage.DELETION) }, modifier = Modifier.fillMaxWidth()) {
            Text("申請刪除帳號與雲端資料")
        }
        Text("開啟網站查看申請方式，不會立即刪除資料，也不會自動寄出信件。登出或關閉同步不等於刪除雲端資料。",
            style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
    }
}
