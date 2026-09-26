package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth

class NativeCountdownTest {
    private fun record(id: String, plot: String, date: String, phi: Any) = JSONObject()
        .put("id", id).put("plotId", plot).put("date", date).put("phi", phi)

    @Test fun plotUsesLatestDateAndUnknownSuppressesOnlyItsOwnGroup() {
        val records = listOf(record("a", "A", "2026-09-01", 3), record("b", "A", "2026-09-02", 7),
            record("c", "B", "2026-09-01", 1), record("d", "B", "2026-09-02", JSONObject.NULL))
        val before = records.map { it.toString() }
        val groups = countdownGroups(records)
        assertEquals(LocalDate.of(2026, 9, 10), groups[0].date)
        assertNull(groups[1].date)
        val events = countdownEvents(records)
        assertEquals(4, events.count { it.spray })
        assertEquals(1, events.count { !it.spray })
        assertEquals(2, events.single { !it.spray }.records.size)
        assertEquals(before, records.map { it.toString() })
    }

    @Test fun unassignedRecordsNeverMergeWithEachOtherOrPlotIds() {
        val groups = countdownGroups(listOf(record("same", "", "2026-09-01", 0),
            record("b", "same", "2026-09-01", JSONObject.NULL), record("c", "", "2026-09-01", 3)))
        assertEquals(3, groups.size)
        assertEquals(LocalDate.of(2026, 9, 2), groups[0].date)
        assertNull(groups[1].date)
        assertEquals(LocalDate.of(2026, 9, 5), groups[2].date)
    }

    @Test fun invalidIntervalDoesNotGenerateDueEventAndLeapMonthIsComplete() {
        listOf(-1, 366, "invalid", JSONObject.NULL).forEach { value ->
            assertFalse(countdownEvents(listOf(record("r", "P", "2026-09-01", value))).any { !it.spray })
        }
        val cells = monthCells(YearMonth.of(2024, 2))
        assertEquals(0, cells.size % 7)
        assertTrue(cells.take(4).all { it == null })
        assertEquals(29, cells.filterNotNull().size)
        assertEquals(LocalDate.of(2024, 2, 29), cells.filterNotNull().last())
        assertTrue(countdownEvents(emptyList()).isEmpty())
    }

    @Test fun unknownIsNotZeroAndElapsedIsNotAnApproval() {
        val unknown = JSONObject().put("date", "2026-09-18").put("phi", JSONObject.NULL)
        assertEquals("採收期未確認，請查產品標示", countdownLabel(unknown, LocalDate.of(2026, 9, 18)))
        val record = JSONObject().put("date", "2026-09-18").put("phi", 3)
        val safeDate = LocalDate.parse(Backup.harvestDate(record))
        assertEquals("尚差 2 天", countdownLabel(record, safeDate.minusDays(2)))
        assertEquals("等待期已到，仍需核對", countdownLabel(record, safeDate))
        assertEquals("等待期已到，仍需核對", countdownLabel(record, safeDate.plusDays(1)))
    }
}
