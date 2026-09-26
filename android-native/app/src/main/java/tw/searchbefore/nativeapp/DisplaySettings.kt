package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.unit.dp

@Composable internal fun DisplaySettings(preferences: DisplayPreferences, enabled: Boolean, change: (DisplayPreferences) -> Unit) {
    BrandCard {
        Text("畫面與閱讀", style = MaterialTheme.typography.titleLarge)
        Text("只保存在這台裝置，不上傳雲端、不包含在 JSON 備份。系統字體更大時會保留系統設定。")
        Text("字體大小", style = MaterialTheme.typography.titleMedium)
        // Separate rows keep 48dp targets and labels readable at large system font scales.
        listOf("normal" to "標準", "large" to "大", "xlarge" to "特大").forEach { (key, label) ->
            FilterChip(selected = preferences.font == key, enabled = enabled, onClick = { change(preferences.copy(font = key)) },
                label = { Text(label) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp))
        }
        PreferenceToggle("深色模式", preferences.dark, enabled) { change(preferences.copy(dark = it)) }
        PreferenceToggle("高對比", preferences.highContrast, enabled) { change(preferences.copy(highContrast = it)) }
        Text("預覽：每一筆登記分開顯示；未知資料不當成安全。", style = MaterialTheme.typography.bodyLarge)
        OutlinedButton(enabled = enabled && preferences != DisplayPreferences(), onClick = { change(DisplayPreferences()) }) { Text("還原顯示預設值") }
    }
}

@Composable private fun PreferenceToggle(label: String, checked: Boolean, enabled: Boolean, change: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).toggleable(checked, enabled = enabled, role = Role.Switch, onValueChange = change),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, modifier = Modifier.weight(1f))
        Switch(checked = checked, enabled = enabled, onCheckedChange = null)
    }
}
