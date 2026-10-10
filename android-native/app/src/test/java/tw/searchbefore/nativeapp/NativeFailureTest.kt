package tw.searchbefore.nativeapp

import org.junit.Assert.*
import org.junit.Test
import org.json.JSONException

class NativeFailureTest {
    @Test fun diagnosticsNeverExposeExceptionMessages() {
        val secret = "private@example.com /users/private/token=secret"
        for (failure in listOf(IllegalArgumentException(secret), JSONException(secret), IllegalStateException(secret), java.io.IOException(secret), Exception(secret))) {
            val output = NativeFailure.code(failure) + NativeFailure.hint(failure) + NativeFailure.locations(failure) + NativeFailure.markers(failure)
            assertFalse(output.contains(secret))
            assertFalse(output.contains("private@example.com"))
            assertFalse(output.contains("token="))
        }
        assertEquals("DATA_VALIDATION", NativeFailure.code(IllegalArgumentException(secret)))
        assertEquals("DATA_FORMAT", NativeFailure.code(JSONException(secret)))
    }
    @Test fun upstreamMarkersAreFixedVocabularyOnly() {
        assertEquals("api key,invalid", NativeFailure.markers(Exception("Invalid API key: private@example.com")))
        assertEquals("", NativeFailure.markers(Exception("private@example.com 0123456789")))
    }
}
