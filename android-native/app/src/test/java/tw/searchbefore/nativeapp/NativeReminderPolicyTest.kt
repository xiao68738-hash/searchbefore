package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate

class NativeReminderPolicyTest {
    private val today=LocalDate.parse("2026-09-16")
    private fun data(vararg days: Int?): JSONObject = Backup.empty().apply {
        days.forEachIndexed { i, phi -> getJSONArray("records").put(JSONObject().put("id","r$i").put("plotId","p1").put("date","2026-09-10").put("phi",phi ?: JSONObject.NULL)) }
    }
    @Test fun noRecordsNeverMeansSafe() { assertFalse(ReminderPolicy.needsReview(Backup.empty(),today)) }
    @Test fun tomorrowAndDueTriggerReviewButLaterBatchWins() {
        assertTrue(ReminderPolicy.needsReview(data(6),today)); assertTrue(ReminderPolicy.needsReview(data(5),today))
        assertFalse(ReminderPolicy.needsReview(data(5,20),today))
    }
    @Test fun unknownBatchTriggersReviewWithoutIgnoringOtherRecords() { assertTrue(ReminderPolicy.needsReview(data(null,20),today)) }
    @Test fun oldRecordsDoNotNotifyIndefinitely() { assertFalse(ReminderPolicy.needsReview(data(1), today.plusDays(50))); assertFalse(ReminderPolicy.needsReview(data(null),today.plusDays(50))) }
    @Test fun unassignedRowsAreIndependentAndTrackCannotHideSafety() {
        val d=data(5,20); d.getJSONArray("records").getJSONObject(0).put("plotId", "").put("track",false).put("notify",false)
        assertTrue(ReminderPolicy.needsReview(d,today))
    }
}
