package tw.searchbefore.nativeapp

import org.junit.Assert.*
import org.junit.Test

class NativeFeedbackTest {
    @Test fun registrationContextUsesOnlyBoundedPublicFields() {
        val json = org.json.JSONObject().put("id", "TEST_ID").put("crop", "TEST_CROP").put("pest", "TEST_PEST")
            .put("name", "TEST_AGENT").put("notes", "PRIVATE_SENTINEL").put("operator", "PRIVATE_SENTINEL")
            .put("content", "x".repeat(2000)).put("form", "SC").put("selectedHarvestForm", "TEST_FORM")
        val before = json.toString(); val context = NativeFeedback.registrationContext(UsageRow(json))
        assertTrue(context.contains("登記識別：TEST_ID")); assertTrue(context.contains("TEST_CROP"))
        assertFalse(context.contains("PRIVATE_SENTINEL")); assertTrue(context.length <= 1000)
        assertEquals(before, json.toString())
    }
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
    @Test fun optionalPublicContextIsBoundedAndNotAddedByDefault() {
        assertFalse(NativeFeedback.body("其他", "TEST", "1", "1").contains("公開查詢條件"))
        assertTrue(NativeFeedback.body("其他", "TEST", "1", "1", "作物：TEST_CROP").contains("公開查詢條件：\n作物：TEST_CROP"))
        assertTrue(runCatching { NativeFeedback.body("其他", "TEST", "1", "1", "x".repeat(1001)) }.isFailure)
    }
}
