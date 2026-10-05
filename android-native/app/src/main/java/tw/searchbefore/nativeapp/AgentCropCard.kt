package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

@Composable internal fun AgentCropCard(group: AgentCropGroup, expanded: Boolean, enabled: Boolean,
    toggle: () -> Unit, select: (UsageRow) -> Unit) {
    BrandCard {
        OutlinedButton(enabled = enabled, onClick = toggle, modifier = Modifier.fillMaxWidth().testTag("agentCrop:${group.name}:${group.crop}")) {
            Column(Modifier.weight(1f)) {
                Text("${group.name}｜${group.crop}", style = MaterialTheme.typography.titleMedium)
                Text("${group.rows.size} 筆原登記用法・${if(expanded) "收合" else "展開"}")
            }
            Text(if(expanded) "−" else "+")
        }
        if(expanded) group.rows.forEach { row ->
            OutlinedButton(enabled = enabled, onClick = { select(row) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Text("${row.name}｜${row.crop} × ${row.pest}\n${row.json.optString("content")} ${row.json.optString("form")}")
            }
        }
    }
}
