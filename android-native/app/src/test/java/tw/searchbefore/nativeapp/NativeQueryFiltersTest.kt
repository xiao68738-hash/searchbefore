package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeQueryFiltersTest {
    private fun row(id: String, name: String, phi: Any? = null, special: Boolean = false, excluded: Boolean = false) =
        UsageRow(JSONObject().put("id", id).put("name", name).put("crop", "TEST_ONLY").put("pest", "TEST_ONLY")
            .put("phi", phi ?: JSONObject.NULL).put("usage", JSONObject().put("isSpecial", special))
            .put("formCategory", if(excluded) "excluded" else "unspecified"))

    @Test fun phiFilterNeverTreatsUnknownAsZeroOrRoundsDown() {
        val rows = listOf(row("unknown", "A"), row("zero", "A", 0), row("seven", "A", 7), row("fraction", "A", 7.5), row("long", "A", 14))
        assertEquals(listOf("zero", "seven"), QueryFilters.registrations(rows, maximumPhi = 7).map { it.id })
        assertEquals(rows, QueryFilters.registrations(rows))
        assertTrue(QueryFilters.registrations(rows, maximumPhi = 0).isEmpty())
        assertTrue(QueryFilters.registrations(rows, maximumPhi = 366).isEmpty())
        assertNull(rows.first().phi)
    }
    @Test fun explicitAgentScopeCannotLeakAnotherDrugOrExpandCandidates() {
        val rows = listOf(row("a", "A", 7), row("b", "AB", 7), row("c", "A", 14))
        assertEquals(listOf("a"), QueryFilters.registrations(rows, "A", 7).map { it.id })
        assertTrue(QueryFilters.registrations(rows, "unknown").isEmpty())
    }
    @Test fun specialAndExcludedSectionsAreDisjointAndKeepEveryOriginalId() {
        val rows = listOf(row("ordinary", "A"), row("special", "A", special = true),
            row("excluded", "A", excluded = true), row("both", "A", special = true, excluded = true))
        val before = rows.map { it.json.toString() }
        val groups = QueryFilters.sections(rows)
        assertEquals(listOf("ordinary"), groups.ordinary.map { it.id })
        assertEquals(listOf("special"), groups.special.map { it.id })
        assertEquals(listOf("excluded", "both"), groups.excluded.map { it.id })
        assertEquals(before, rows.map { it.json.toString() })
    }
    @Test fun customPhiRejectsDecimalsScientificNotationAndOutOfBounds() {
        for(bad in listOf("", "0", "366", "3650", "-3", "7.5", "1e2", "NaN", "３")) assertNull(bad, QueryFilters.phiLimit(bad))
        assertEquals(1, QueryFilters.phiLimit("1"))
        assertEquals(365, QueryFilters.phiLimit("365"))
    }
    @Test fun rangePresentationDoesNotChangeConservativeInterval() {
        val range = row("r", "A", 15).also { it.json.put("phiText", "7-15") }
        assertEquals("7-15 天", range.harvestLabel())
        assertTrue(QueryFilters.registrations(listOf(range), maximumPhi = 7).isEmpty())
        assertEquals(15.0, range.phi!!, 0.0)
        assertEquals("請查產品標示", row("u", "A").harvestLabel())
        assertEquals("不適用", row("s", "A").also { it.json.put("seed", true) }.harvestLabel())
    }
    @Test fun everyExportedPestQueryMatchesWebWithoutMergingRegistrations() {
        val fixture = JSONObject(requireNotNull(javaClass.classLoader?.getResourceAsStream("web-native-golden.json"))
            .bufferedReader().use { it.readText() }).getJSONObject("pestSearch")
        val search = PestSearch(fixture.getJSONObject("rules"))
        val queries = fixture.getJSONArray("queries"); val pests = fixture.getJSONArray("pests")
        assertTrue(queries.length() > 100); assertTrue(pests.length() > 100)
        for(i in 0 until queries.length()) for(j in 0 until pests.length()) {
            val expected = fixture.getJSONArray("labels").getJSONArray(i)
            assertEquals("${queries.getString(i)} / ${pests.getString(j)}",
                if(expected.isNull(j)) null else expected.getString(j), search.label(queries.getString(i), pests.getString(j)))
        }
        assertNotNull(search.label("夜蛾科", "大螟"))
        assertNull(search.label("夜蛾科", "二化螟蟲"))
        assertNull(search.label("螟蛾類", "甜菜白帶野螟蛾"))
        assertNull(search.label("甜菜夜蛾", "夜蛾類"))
    }
}
