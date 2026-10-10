package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalLayoutApi::class)
@Composable internal fun DisplaySettings(preferences: DisplayPreferences, enabled: Boolean, change: (DisplayPreferences) -> Unit) {
    BrandCard {
        Text("外觀", style = MaterialTheme.typography.titleLarge)
        PreferenceToggle("深色模式", preferences.dark, enabled) { change(preferences.copy(dark = it)) }
        HorizontalDivider()
        Text("字體大小", style = MaterialTheme.typography.titleMedium)
        // Wrap at large system fonts while retaining 48dp touch targets.
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("normal" to "標準", "large" to "大", "xlarge" to "特大").forEach { (key, label) ->
                FilterChip(selected = preferences.font == key, enabled = enabled, onClick = { change(preferences.copy(font = key)) },
                    label = { Text(label) }, modifier = Modifier.heightIn(min = 48.dp))
            }
        }
        HorizontalDivider()
        PreferenceToggle("高對比", preferences.highContrast, enabled) { change(preferences.copy(highContrast = it)) }
        Text("只儲存在此裝置，不隨 JSON 或雲端移轉；保留系統的大字設定。", style = MaterialTheme.typography.bodySmall)
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
