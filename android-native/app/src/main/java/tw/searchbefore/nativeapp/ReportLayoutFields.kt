package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable

@Composable internal fun ReportLayoutFields(layout: ReportLayout, enabled: Boolean, select: (ReportLayout) -> Unit) {
    Column {
        Text("匯出欄位格式")
        ReportLayout.entries.forEach { value -> FilterChip(selected = value == layout, enabled = enabled,
            onClick = { select(value) }, label = { Text(value.label) }) }
        if(layout != ReportLayout.INTEGRATED) Text("此格式僅包含用藥紀錄。每桶水量與本次總量分開處理；缺值不自行補造。")
        if(layout == ReportLayout.TAP) Text("僅協助登打，不是官方表單、驗證證明或直接匯入檔；請依現行 TAP 欄位及產品標示核對。")
    }
}
