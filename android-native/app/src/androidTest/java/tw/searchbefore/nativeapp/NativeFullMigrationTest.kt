package tw.searchbefore.nativeapp

import android.content.Context
import android.content.ContextWrapper
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.time.Instant

/** Generated from the web backup reader. Test APK asset + isolated synthetic storage only. */
class NativeFullMigrationTest {
    private fun isolated(): Context {
        val target = InstrumentationRegistry.getInstrumentation().targetContext
        val root = File(target.cacheDir, "native-validation/migration-${System.nanoTime()}").apply { check(mkdirs()) }
        return object : ContextWrapper(target) {
            override fun getFilesDir() = File(root, "files").apply { mkdirs() }
            override fun getNoBackupFilesDir() = File(root, "no-backup").apply { mkdirs() }
        }
    }
    private fun golden(): JSONObject = InstrumentationRegistry.getInstrumentation().context.assets
        .open("synthetic-migration.json").bufferedReader().use { JSONObject(it.readText()) }

    private fun assertImported(expected: JSONObject, actual: JSONObject) {
        val stamped = JSONObject(expected.toString())
        // Explicit import is a local change. Only the three sync collections receive a newer
        // conflict-resolution timestamp; verify it rather than silently ignoring all metadata.
        NativeSync.collections.forEach { key ->
            val byId = NativeSync.rows(actual.getJSONArray(key)).associateBy { it.getString("id") }
            NativeSync.rows(stamped.getJSONArray(key)).forEach { row ->
                val stored = requireNotNull(byId[row.getString("id")])
                assertTrue(Instant.parse(stored.getString("updatedAt")).isAfter(Instant.parse(row.getString("updatedAt"))))
                row.put("updatedAt", stored.getString("updatedAt"))
            }
        }
        assertTrue(NativeSync.same(stamped, actual))
    }

    @Test fun cleanStoreRestoresAllWebCollectionsAndRecipesWithoutAdoptingIdentityOrConsent() {
        val context = isolated(); val store = NativeStore(context); val fixture = golden()
        val source = fixture.getJSONObject("input")
        source.getJSONObject("data").put("ownerUid", "TEST_FOREIGN_UID").put("syncEnabled", true)
            .put("remindersEnabled", true).put("displayPrefs", JSONObject().put("font", "xlarge"))
        val imported = Backup.parse(source.toString().toByteArray(Charsets.UTF_8))
        store.save(NativeDocument.replaceData(store.load(), imported, importing = true))
        val reopened = NativeStore(context).load(); val actual = reopened.getJSONObject("data")
        assertImported(fixture.getJSONObject("expected"), actual)
        assertEquals(2, actual.getJSONArray("fieldPlots").length())
        assertEquals(2, actual.getJSONArray("records").length())
        assertEquals(Farm.types.keys, Farm.records(actual).map { it.getString("type") }.toSet())
        val recipes = Recipes.rows(actual)
        assertEquals(3, recipes.size)
        assertEquals(listOf("mL", "g", null), recipes.map { Recipes.unit(it) })
        assertEquals(listOf("20", "20", null), recipes.map { Recipes.amount(it, "20") })
        assertTrue(Recipes.referenceOnly(recipes.last()))
        assertEquals("plot_1", actual.getString("activePlotId"))
        assertEquals("", reopened.getString("ownerUid"))
        assertFalse(reopened.getBoolean("syncEnabled")); assertFalse(reopened.getBoolean("remindersEnabled"))
        assertEquals(DisplayPreferences(), DisplayPreferences.read(reopened.getJSONObject("displayPrefs")))
        val export = Backup.encode(actual)
        assertTrue(NativeSync.same(actual, Backup.parse(export)))
        assertFalse(export.toString(Charsets.UTF_8).contains("TEST_FOREIGN_UID"))
        assertFalse(export.toString(Charsets.UTF_8).contains("displayPrefs"))
        // The application APK must never carry the generated backup test fixture.
        assertFalse(InstrumentationRegistry.getInstrumentation().targetContext.assets.list("")!!.contains("synthetic-migration.json"))
    }

    @Test fun replacingOwnedLocalDataKeepsRecoveryPreferencesAndIdentityButStopsSyncAndReminders() {
        val context = isolated(); val store = NativeStore(context)
        val original = Backup.empty().apply {
            getJSONArray("fieldPlots").put(JSONObject().put("id", "before_plot").put("crop", "TEST_BEFORE"))
        }
        val prefs = DisplayPreferences("xlarge", true, true)
        val before = NativeDocument.replaceData(store.load(), original).put("ownerUid", "TEST_LOCAL_OWNER")
            .put("syncEnabled", true).put("remindersEnabled", true).put("displayPrefs", prefs.encode())
        store.save(before); store.keepRecovery(before.getJSONObject("data"))
        val imported = Backup.parse(golden().getJSONObject("input").toString().toByteArray(Charsets.UTF_8))
        store.save(NativeDocument.replaceData(before, imported, importing = true))
        val reopened = NativeStore(context).load()
        assertEquals("TEST_LOCAL_OWNER", reopened.getString("ownerUid"))
        assertEquals(prefs, DisplayPreferences.read(reopened.getJSONObject("displayPrefs")))
        assertFalse(reopened.getBoolean("syncEnabled")); assertFalse(reopened.getBoolean("remindersEnabled"))
        assertEquals("", reopened.getString("lastSyncAt"))
        assertTrue(NativeSync.same(before.getJSONObject("data"), NativeStore(context).readRecovery()))
        assertImported(imported, reopened.getJSONObject("data"))
        assertEquals("before_plot", reopened.getJSONObject("tombstones").getJSONArray("fieldPlots").getJSONObject(0).getString("id"))
    }
}
