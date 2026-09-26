package tw.searchbefore.nativeapp

import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import org.json.JSONObject
import java.io.OutputStream

object NativePdf {
    fun write(data: JSONObject, stream: OutputStream) {
        val table = Farm.table(data)
        require(table.size <= 2001) { "PDF 超過 2,000 筆，請改匯出完整 CSV／Excel" }
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 10f; color = Color.BLACK; typeface = Typeface.create("sans-serif", Typeface.NORMAL) }
        val pdf = PdfDocument()
        var page: PdfDocument.Page? = null
        try {
            var pageNumber = 0
            var y = 0f
            fun newPage() {
                page?.let(pdf::finishPage)
                pageNumber++
                page = pdf.startPage(PdfDocument.PageInfo.Builder(595, 842, pageNumber).create())
                y = 35f
                page!!.canvas.drawText("噴前查｜用藥與農務紀錄　$pageNumber", 30f, y, paint)
                y += 20f
                page!!.canvas.drawText("閱讀用報表，非驗證或用藥許可；完整還原請使用 JSON 備份。", 30f, y, paint)
                y += 25f
            }
            fun line(text: String) {
                if(page == null || y > 805f) newPage()
                page!!.canvas.drawText(text,30f,y,paint); y += 15f
            }
            newPage()
            table.drop(1).forEach { row ->
                row.forEachIndexed { index, value ->
                    for(paragraph in (table[0][index] + "：" + value).split('\n')) {
                        var remaining = paragraph.replace('\r',' ')
                        if(remaining.isEmpty()) line("")
                        while(remaining.isNotEmpty()) {
                            val count = paint.breakText(remaining, true, 535f, null).coerceAtLeast(1)
                            line(remaining.take(count)); remaining = remaining.drop(count)
                        }
                    }
                }
                line("────────────────────────")
            }
            if(table.size == 1) line("目前沒有用藥或農務紀錄。")
            page?.let(pdf::finishPage)
            page = null
            pdf.writeTo(stream)
        } finally {
            page?.let { runCatching { pdf.finishPage(it) } }
            pdf.close()
        }
    }
}
