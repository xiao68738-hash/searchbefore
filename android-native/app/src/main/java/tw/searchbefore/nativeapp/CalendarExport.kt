package tw.searchbefore.nativeapp

import org.json.JSONObject
import java.security.MessageDigest
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/** Local .ics snapshot only. No calendar permission, account access, auto-sync or network. */
internal object CalendarExport {
    private val utc = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC)
    fun groups(data: JSONObject, plotId: String): List<CountdownGroup> {
        ReportScope(plotId = plotId).validate(data)
        val records = NativeSync.rows(data.getJSONArray("records")).filter { plotId.isEmpty() || it.optString("plotId") == plotId }
        return countdownGroups(records)
    }
    fun text(value: String): String = value.replace("\r\n", "\n").replace('\r', '\n')
        .filter { !it.isISOControl() || it == '\n' }
        .replace("\\", "\\\\").replace("\n", "\\n").replace(";", "\\;").replace(",", "\\,")

    /** RFC 5545: 75 octets per physical line, never split a UTF-8 code point. */
    internal fun fold(line: String): String = buildString {
        var bytes = 0
        line.codePoints().toArray().forEach { point ->
            val part = String(Character.toChars(point))
            val size = part.toByteArray(Charsets.UTF_8).size
            if(bytes + size > 75) { append("\r\n "); bytes = 1 }
            append(part); bytes += size
        }
    }
    fun encode(data: JSONObject, plotId: String = "", now: Instant = Instant.now()): ByteArray {
        val known = groups(data, plotId).filter { it.date != null }
        require(known.isNotEmpty()) { "沒有可匯出的已知等待期；未知採收期不產生到期事件" }
        require(known.size <= 2000) { "事件超過 2,000 筆，請先選擇單一田區" }
        val plots = Backup.plots(data).associate { it.getString("id") to Backup.plotLabel(it) }
        val lines = mutableListOf("BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SearchBefore//Native Calendar//ZH-TW", "CALSCALE:GREGORIAN")
        known.forEach { group ->
            val plot = group.records.first().optString("plotId")
            val label = plots[plot] ?: "${group.records.first().optString("crop")}（未指定田區，僅單筆參考）"
            val date = requireNotNull(group.date)
            val start = date.atTime(7, 0).atZone(ZoneId.of("Asia/Taipei")).toInstant()
            val identity = org.json.JSONArray(listOf(plot, date.toString(), group.records.map { it.getString("id") }.sorted())).toString()
            val id = MessageDigest.getInstance("SHA-256").digest(identity.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
            lines += listOf("BEGIN:VEVENT", "UID:$id@searchbefore.tw", "DTSTAMP:${utc.format(now)}", "DTSTART:${utc.format(start)}",
                "DTEND:${utc.format(start.plusSeconds(1800))}", "TRANSP:TRANSPARENT",
                "SUMMARY:${text("核對採收等待期：$label")}",
                "DESCRIPTION:${text("依匯出當時 ${group.records.size} 筆紀錄，最晚已知等待期至 $date。不代表殘留合格或准許採收。此檔不會隨新施藥、修改或刪除自動更新；請回 APP 核對完整紀錄，必要時移除舊事件後重新匯出。提醒預設臺灣時間上午 7 點，實際通知由行事曆設定決定。")}")
            for(trigger in listOf("-PT14H", "PT0S")) lines += listOf("BEGIN:VALARM", "TRIGGER:$trigger", "ACTION:DISPLAY",
                "DESCRIPTION:${text("核對等待期與完整紀錄，不代表可採收")}", "END:VALARM")
            lines += "END:VEVENT"
        }
        lines += "END:VCALENDAR"
        return (lines.joinToString("\r\n", transform = ::fold) + "\r\n").toByteArray(Charsets.UTF_8)
    }
}
