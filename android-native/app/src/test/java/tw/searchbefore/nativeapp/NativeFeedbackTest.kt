package tw.searchbefore.nativeapp

import org.junit.Assert.*
import org.junit.Test

class NativeFeedbackTest {
    @Test fun draftContainsOnlyExplicitDescriptionAndPublicVersions() {
        assertEquals("【操作問題】\nTEST_DESCRIPTION\n———\n原生 App vTEST_APP · 資料 TEST_DATA",
            NativeFeedback.body("操作問題", " TEST_DESCRIPTION ", "TEST_APP", "TEST_DATA"))
    }
    @Test fun emptyOverlongOrUnknownCategoryCannotBeSubmitted() {
        for(description in listOf("", "  ", "x".repeat(2001))) assertTrue(runCatching {
            NativeFeedback.body("操作問題", description, "1", "1") }.isFailure)
        assertTrue(runCatching { NativeFeedback.body("HEADER\nCC", "TEST", "1", "1") }.isFailure)
        assertEquals(2000, NativeFeedback.body("其他", "x".repeat(2000), "1", "1").substringAfter('\n').substringBefore("\n———").length)
    }
    @Test fun publicEmailCannotContainAdditionalRecipientsHeadersOrQueryParameters() {
        assertTrue(NativeFeedback.validEmail("feedback@example.org"))
        for(email in listOf("", "feedback@example.org?bcc=other@example.org", "a@example.org,b@example.org", "a@example.org\nCC:b@example.org", "a@example.org "))
            assertFalse(NativeFeedback.validEmail(email))
    }
}
