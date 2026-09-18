package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate

class NativeCountdownTest {
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
