package tw.searchbefore.nativeapp

import org.json.JSONObject

/** Device-only allowlist. Never imported from a backup, uploaded or treated as account consent. */
data class DisplayPreferences(val font: String = "normal", val dark: Boolean = false, val highContrast: Boolean = false) {
    fun encode(): JSONObject = JSONObject().put("font", font).put("dark", dark).put("highContrast", highContrast)
    fun fontScale(system: Float): Float = maxOf(system, when(font) { "large" -> 1.15f; "xlarge" -> 1.3f; else -> 1f })
    companion object {
        fun read(value: JSONObject?): DisplayPreferences = DisplayPreferences(
            value?.optString("font").takeIf { it in setOf("normal", "large", "xlarge") } ?: "normal",
            value?.opt("dark") == true, value?.opt("highContrast") == true)
    }
}
