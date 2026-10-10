package tw.searchbefore.nativeapp

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONObject
import java.time.LocalDate
import java.time.YearMonth

/** Shared display policy: never mistake an individual interval for the whole plot's interval. */
internal data class CountdownGroup(val records: List<JSONObject>, val date: LocalDate?)
internal data class CountdownEvent(val date: LocalDate, val spray: Boolean, val records: List<JSONObject>)

internal fun countdownGroups(records: List<JSONObject>): List<CountdownGroup> = records.groupBy {
    val plot = it.optString("plotId")
    // Typed namespace avoids a plot ID colliding with an unassigned record ID.
    Pair(plot.isNotEmpty(), plot.ifEmpty { it.getString("id") })
}.values.map { rows ->
    val dates = rows.map { Backup.harvestDate(it)?.let(LocalDate::parse) }
    CountdownGroup(rows, if(dates.any { it == null }) null else dates.filterNotNull().maxOrNull())
}

internal fun countdownEvents(records: List<JSONObject>): List<CountdownEvent> {
    val sprays = records.mapNotNull { row ->
        runCatching { CountdownEvent(LocalDate.parse(row.getString("date")), true, listOf(row)) }.getOrNull()
    }
    val reviews = countdownGroups(records).mapNotNull { group ->
        group.date?.let { CountdownEvent(it, false, group.records) }
    }
    return (sprays + reviews).sortedBy { it.date }
}

internal fun monthCells(month: YearMonth): List<LocalDate?> {
    val start = month.atDay(1).dayOfWeek.value % 7
    val dates = List<LocalDate?>(start) { null } + (1..month.lengthOfMonth()).map { month.atDay(it) }
    return dates + List<LocalDate?>((7 - dates.size % 7) % 7) { null }
}

@Composable internal fun CountdownMonth(month: YearMonth, selected: String, today: LocalDate,
    events: List<CountdownEvent>, enabled: Boolean, move: (Long) -> Unit, select: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(enabled = enabled && month.year > 1, onClick = { move(-1) }) { Text("上月") }
            Text("${month.year} 年 ${month.monthValue} 月", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
            TextButton(enabled = enabled && month.year < 9999, onClick = { move(1) }) { Text("下月") }
        }
        Text("點日期看明細；圓點代表有事件。窄螢幕可左右滑動日曆。", style = MaterialTheme.typography.bodySmall)
        // Seven 48dp-wide targets remain usable even with a narrow window / large font.
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val calendarWidth = maxOf(maxWidth, 336.dp)
            Row(Modifier.horizontalScroll(rememberScrollState())) {
                Column(Modifier.width(calendarWidth)) {
                    Row { listOf("日", "一", "二", "三", "四", "五", "六").forEach {
                        Box(Modifier.weight(1f).height(32.dp), contentAlignment = Alignment.Center) { Text(it, fontSize = 12.sp) }
                    } }
                    val counts = events.groupingBy { it.date }.eachCount()
                    monthCells(month).chunked(7).forEach { week -> Row {
                        week.forEach { day ->
                            if(day == null) Spacer(Modifier.weight(1f).height(60.dp))
                            else {
                                val count = counts[day] ?: 0
                                val active = selected == day.toString()
                                Surface(onClick = { select(day.toString()) }, enabled = enabled,
                                    modifier = Modifier.weight(1f).height(60.dp).semantics {
                                        contentDescription = "$day，${count}項事件" + if(day == today) "，今天" else ""
                                    }, shape = MaterialTheme.shapes.small,
                                    color = if(active) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.background) {
                                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                                        Text(day.dayOfMonth.toString(), fontSize = 14.sp)
                                        Text(if(count > 0) "●" else if(day == today) "今天" else "", fontSize = 10.sp,
                                            color = MaterialTheme.colorScheme.primary)
                                    }
                                }
                            }
                        }
                    } }
                }
            }
        }
    }
}
