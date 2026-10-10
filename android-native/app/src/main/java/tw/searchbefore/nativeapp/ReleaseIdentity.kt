package tw.searchbefore.nativeapp

/** Describes the build, never claims its Play track or production acceptance. */
internal fun releaseIdentityLabel(debug: Boolean, versionName: String): String = when {
    debug -> "原生開發預覽"
    versionName.contains("internal", ignoreCase = true) -> "內部測試版"
    else -> "版本 $versionName"
}
