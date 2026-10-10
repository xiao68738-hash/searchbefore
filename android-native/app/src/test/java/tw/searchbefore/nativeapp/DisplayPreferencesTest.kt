package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class DisplayPreferencesTest {
    @Test fun defaultsAndMalformedSettingsAreSafe() {
        assertEquals(DisplayPreferences(), DisplayPreferences.read(null))
        assertEquals(DisplayPreferences(), DisplayPreferences.read(JSONObject("""{"font":"huge","dark":"true","highContrast":1,"ownerUid":"fake"}""")))
        val chosen = DisplayPreferences("large", true, true)
        assertEquals(chosen, DisplayPreferences.read(chosen.encode()))
        assertEquals(3, chosen.encode().length())
    }
    @Test fun accessibilityFontIsNeverReduced() {
        assertEquals(1.3f, DisplayPreferences("xlarge").fontScale(1f), 0f)
        assertEquals(1.5f, DisplayPreferences("large").fontScale(1.5f), 0f)
        assertEquals(2f, DisplayPreferences().fontScale(2f), 0f)
    }
    @Test fun importsRetainDevicePreferencesButCannotGrantCloudConsent() {
        val prefs = DisplayPreferences("xlarge", true, true)
        val initial = NativeDocument.empty().put("displayPrefs", prefs.encode()).put("ownerUid", "test_owner").put("syncEnabled", true)
        val imported = NativeDocument.replaceData(initial, Backup.empty().put("displayPrefs", JSONObject().put("dark", false)), importing = true)
        assertEquals(prefs, DisplayPreferences.read(imported.getJSONObject("displayPrefs")))
        assertEquals("test_owner", imported.getString("ownerUid"))
        assertFalse(imported.getBoolean("syncEnabled"))
        val exported = Backup.encode(imported.getJSONObject("data")).toString(Charsets.UTF_8)
        assertFalse(exported.contains("displayPrefs"))
        assertFalse(exported.contains("test_owner"))
        assertTrue(NativeSync.same(Backup.empty(), imported.getJSONObject("data")))
    }
    @Test fun recordSearchUsesOnlyVisibleRecordFields() {
        val record = JSONObject().put("agent", "TEST 藥劑").put("crop", "蔥").put("pest", "夜蛾類").put("date", "2026-09-18").put("notes", "後院試填").put("privateKey", "secret")
        for(query in listOf("", " test ", "蔥", "夜蛾", "09-18", "後院")) assertTrue(query, recordMatches(record, query))
        assertFalse(recordMatches(record, "secret"))
        assertFalse(recordMatches(record, "不存在"))
    }
}
