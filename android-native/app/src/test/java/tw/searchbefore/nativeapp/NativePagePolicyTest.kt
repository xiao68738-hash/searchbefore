package tw.searchbefore.nativeapp

import org.junit.Assert.*
import org.junit.Test

class NativePagePolicyTest {
    @Test fun everyQueryIsSmallEvenForLargeLocalLimits() {
        assertEquals(500L, NativePagePolicy.requestSize(0))
        assertEquals(500L, NativePagePolicy.requestSize(500))
        assertEquals(500L, NativePagePolicy.requestSize(44000))
    }
    @Test fun exactLimitProbesForOneMoreRowInsteadOfSilentlyTruncating() {
        assertEquals(2L, NativePagePolicy.requestSize(44999))
        assertEquals(1L, NativePagePolicy.requestSize(45000))
        NativePagePolicy.validatePage(45000, 0)
        assertTrue(runCatching { NativePagePolicy.validatePage(45000, 1) }.isFailure)
    }
    @Test fun invalidAndOversizedPagesFailClosed() {
        for ((downloaded, received) in listOf(-1 to 0, 45001 to 0, 0 to -1, 0 to 501, 44999 to 2)) {
            assertTrue(runCatching { NativePagePolicy.validatePage(downloaded, received) }.isFailure)
        }
    }
    @Test fun zeroShortAndFullPagesAreAcceptedWithinLimit() {
        for (size in listOf(0, 1, 499, 500)) NativePagePolicy.validatePage(500, size)
        NativePagePolicy.validatePage(44500, 500)
    }
}
