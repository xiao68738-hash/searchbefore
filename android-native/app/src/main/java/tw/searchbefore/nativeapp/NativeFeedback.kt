package tw.searchbefore.nativeapp

object NativeFeedback {
    val categories = listOf("資料錯誤", "操作問題", "功能建議", "其他")
    fun body(category: String, description: String, version: String, dataVersion: String, publicContext: String = ""): String {
        require(category in categories && description.trim().isNotEmpty() && description.length <= 2000) { "請填寫 1～2,000 字的問題描述" }
        require(version.length <= 100 && dataVersion.length <= 100)
        require(publicContext.length <= 1000)
        val context = publicContext.takeIf { it.isNotBlank() }?.let { "\n公開查詢條件：\n$it" }.orEmpty()
        return "【$category】\n${description.trim()}$context\n———\n原生 App v$version · 資料 $dataVersion"
    }
    fun validEmail(value: String) = Regex("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}").matches(value)
}
