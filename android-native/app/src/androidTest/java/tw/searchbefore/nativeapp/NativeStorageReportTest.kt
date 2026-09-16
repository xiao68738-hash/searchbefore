package tw.searchbefore.nativeapp

import android.content.Context
import android.content.ContextWrapper
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File

/** Synthetic fixtures in an isolated test directory. No account, app records or cloud access. */
class NativeStorageReportTest {
    private val target get() = InstrumentationRegistry.getInstrumentation().targetContext
    private fun isolated(): Context {
        val root = File(target.cacheDir, "native-validation/store-${System.nanoTime()}").apply { check(mkdirs()) }
        return object : ContextWrapper(target) {
            override fun getFilesDir() = File(root, "files").apply { mkdirs() }
            override fun getNoBackupFilesDir() = File(root, "no-backup").apply { mkdirs() }
        }
    }
    private fun fixture(): JSONObject = Backup.empty().apply {
        getJSONArray("fieldPlots").put(JSONObject().put("id", "test_plot").put("crop", "蔥").put("tag", "測試田區，非真實紀錄"))
        getJSONArray("records").put(JSONObject().put("id", "test_record").put("crop", "蔥")
            .put("agent", "測試藥劑（不作為用藥資料）").put("pest", "夜蛾類").put("date", "2026-01-01")
            .put("phi", 7).put("plotId", "test_plot").put("updatedAt", "2026-01-01T00:00:00.000Z")
            .put("notes", "中文長備註與換行\n=HYPERLINK(文字而非公式)"))
        getJSONArray("recipes").put(JSONObject().put("crop", "蔥").put("agent", "僅測試配方").put("unknownField", "保留欄位"))
    }
    @Test fun legacyMigrationAndRecoverySurviveStoreRecreation() {
        val context = isolated()
        val original = fixture()
        val legacy = File(context.filesDir, "native-backup.json")
        val legacyBytes = Backup.encode(original)
        legacy.writeBytes(legacyBytes)
        File(context.filesDir, "before-import.json").writeBytes(Backup.encode(Backup.empty()))
        val store = NativeStore(context)
        val migrated = store.load()
        assertTrue(NativeSync.same(original, migrated.getJSONObject("data")))
        assertArrayEquals(legacyBytes, legacy.readBytes())
        assertEquals(0, store.readRecovery().getJSONArray("records").length())
        store.keepRecovery(original)
        val owned = JSONObject(migrated.toString()).put("ownerUid", "synthetic_owner").put("syncEnabled", true)
        val replaced = NativeDocument.replaceData(owned, Backup.empty(), importing = true)
        store.save(replaced)
        val reopened = NativeStore(context)
        val loaded = reopened.load()
        assertFalse(loaded.getBoolean("syncEnabled"))
        assertEquals("synthetic_owner", loaded.getString("ownerUid"))
        assertEquals(1, loaded.getJSONObject("tombstones").getJSONArray("records").length())
        assertTrue(NativeSync.same(original, reopened.readRecovery()))
        val export = Backup.encode(loaded.getJSONObject("data")).toString(Charsets.UTF_8)
        assertFalse(export.contains("synthetic_owner"))
        assertFalse(export.contains("tombstones"))
    }
    @Test fun corruptCurrentFileIsPreservedAndNeverReplacedByEmptyData() {
        val context = isolated()
        NativeStore(context).load()
        val current = File(context.noBackupFilesDir, "native-records/state.json")
        val corrupt = "{broken synthetic fixture".toByteArray()
        current.writeBytes(corrupt)
        assertTrue(runCatching { NativeStore(context).load() }.isFailure)
        assertArrayEquals(corrupt, current.readBytes())
    }
    @Test fun chinesePdfIsPagedRenderableAndExcelIsGenerated() {
        val output = File(target.cacheDir, "native-validation/reports").apply { mkdirs() }
        val data = fixture()
        val template = data.getJSONArray("records").getJSONObject(0)
        repeat(19) { index -> data.getJSONArray("records").put(JSONObject(template.toString()).put("id", "test_extra_$index")) }
        val pdf = File(output, "synthetic-report.pdf")
        pdf.outputStream().use { NativePdf.write(data, it) }
        assertTrue(pdf.length() > 1000)
        File(output, "synthetic-report.xlsx").writeBytes(NativeReports.xlsx(data))
        ParcelFileDescriptor.open(pdf, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
            PdfRenderer(descriptor).use { renderer ->
                assertTrue(renderer.pageCount >= 2)
                renderer.openPage(0).use { page ->
                    val bitmap = Bitmap.createBitmap(1190, 1684, Bitmap.Config.ARGB_8888)
                    bitmap.eraseColor(Color.WHITE)
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    val pixels = IntArray(bitmap.width * bitmap.height)
                    bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
                    assertTrue(pixels.count { Color.red(it) < 128 && Color.alpha(it) > 0 } > 1000)
                    File(output, "synthetic-report-page1.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
                    bitmap.recycle()
                }
            }
        }
    }
}
