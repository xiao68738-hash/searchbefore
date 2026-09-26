package tw.searchbefore.nativeapp

import com.google.firebase.firestore.FirebaseFirestoreException
import org.json.JSONException

/** Fixed diagnostic codes only: never expose exception messages, account IDs or document data. */
object NativeFailure {
    /** Emit only predeclared keywords, not any text from the upstream error. */
    fun markers(error: Exception): String {
        val message = error.message.orEmpty().lowercase(java.util.Locale.ROOT)
        return listOf("api key", "api_key", "package", "certificate", "database", "project", "limit", "query", "index", "timestamp", "token", "auth", "invalid", "resource", "parent", "document", "collection", "unsupported", "not found", "not exist", "missing", "expected", "client", "service_disabled", "api_key_invalid", "field", "value", "reserved", "empty", "target", "permission")
            .filter { it in message }.joinToString(",")
    }
    fun code(error: Exception): String = when (error) {
        is FirebaseFirestoreException -> "CLOUD_${error.code.name}"
        is JSONException -> "DATA_FORMAT"
        is IllegalArgumentException -> "DATA_VALIDATION"
        is IllegalStateException -> "STATE_CHECK"
        is java.io.IOException -> "IO_UNAVAILABLE"
        else -> "UNEXPECTED"
    }

    fun hint(error: Exception): String = when (error) {
        is FirebaseFirestoreException -> when (error.code) {
            FirebaseFirestoreException.Code.PERMISSION_DENIED -> "雲端拒絕存取，請核對帳號與存取設定；不應放寬資料庫規則。"
            FirebaseFirestoreException.Code.UNAUTHENTICATED -> "登入狀態已失效，請重新登入。"
            FirebaseFirestoreException.Code.UNAVAILABLE, FirebaseFirestoreException.Code.DEADLINE_EXCEEDED -> "請確認網路連線，稍後再試。"
            else -> ""
        }
        is JSONException, is IllegalArgumentException -> "資料格式尚未相容或未通過檢核，請勿清除原紀錄。"
        else -> ""
    }

    // Debug-only caller may log application source locations, never Throwable.toString/message/cause.
    fun locations(error: Exception): String = error.stackTrace
        .filter { it.className.startsWith("tw.searchbefore.nativeapp.") }
        .take(6).joinToString(" > ") { "${it.className.substringAfterLast('.')}.${it.methodName}:${it.lineNumber}" }
}
