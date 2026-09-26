package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.util.zip.ZipInputStream
import javax.xml.parsers.DocumentBuilderFactory

class NativeReportsTest {
    @Test fun xlsxContainsWellFormedTextCellsWithoutFormulasOrExternalLinks() {
        val source = Backup.empty()
        source.getJSONArray("records").put(JSONObject().put("id", "r1").put("crop", "蔥").put("agent", "=HYPERLINK(\"external\")")
            .put("date", "2026-01-01").put("notes", "甲<&>乙\n第二行").put("dil", 0))
        val entries = mutableMapOf<String, String>()
        ZipInputStream(ByteArrayInputStream(NativeReports.xlsx(source))).use { zip ->
            while(true) { val entry = zip.nextEntry ?: break; entries[entry.name] = zip.readBytes().toString(Charsets.UTF_8) }
        }
        assertEquals(6, entries.size)
        val factory = DocumentBuilderFactory.newInstance().apply {
            setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
            setFeature("http://xml.org/sax/features/external-general-entities", false)
            setFeature("http://xml.org/sax/features/external-parameter-entities", false)
        }
        entries.values.forEach { factory.newDocumentBuilder().parse(ByteArrayInputStream(it.toByteArray())) }
        val sheet = requireNotNull(entries["xl/worksheets/sheet1.xml"])
        assertTrue(sheet.contains("t=\"inlineStr\""))
        assertTrue(sheet.contains("customHeight=\"1\""))
        assertTrue(requireNotNull(entries["xl/styles.xml"]).contains("wrapText=\"1\""))
        assertTrue(sheet.contains("=HYPERLINK")) // Text, not a formula tag.
        assertFalse(sheet.contains("<f>"))
        assertFalse(sheet.contains("<hyperlink"))
        assertFalse(sheet.contains("倍數：0"))
        assertTrue(sheet.contains("甲&lt;&amp;&gt;乙"))
        assertFalse(entries.values.any { it.contains("TargetMode=\"External\"") })
    }
    @Test fun reportsDoNotContainAccountOrSyncMetadata() {
        val source = NativeDocument.empty().put("ownerUid", "private_uid").put("syncEnabled", true)
        val rows = Farm.table(source.getJSONObject("data"))
        assertEquals(1, rows.size)
        assertFalse(rows.toString().contains("private_uid"))
        assertFalse(Farm.csv(source.getJSONObject("data")).toString(Charsets.UTF_8).contains("syncEnabled"))
    }
}
