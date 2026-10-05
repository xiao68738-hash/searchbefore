package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction

@Composable internal fun RecordFilterFields(filter: RecordFilter, enabled: Boolean, change: (RecordFilter) -> Unit) {
    val focus = LocalFocusManager.current
    OutlinedTextField(filter.query, { change(filter.copy(query = it.take(120))) }, enabled = enabled,
        label = { Text("搜尋紀錄、資材、操作者或備註") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { focus.clearFocus() }))
    OutlinedTextField(filter.from, { change(filter.copy(from = it.take(10))) }, enabled = enabled,
        label = { Text("紀錄起日 YYYY-MM-DD（可留空）") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { focus.clearFocus() }))
    OutlinedTextField(filter.to, { change(filter.copy(to = it.take(10))) }, enabled = enabled,
        label = { Text("紀錄迄日 YYYY-MM-DD（可留空）") }, modifier = Modifier.fillMaxWidth(), singleLine = true,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { focus.clearFocus() }))
    TextButton(enabled = enabled, onClick = { change(filter.copy(from = "", to = "", query = "", type = "")) }) { Text("清除日期、文字與類型篩選") }
}
