package tw.searchbefore.nativeapp

/** Bounded full download. The extra row detects overflow; never silently accept truncation. */
object NativePagePolicy {
    const val MAX_ROWS = 45000
    const val PAGE_SIZE = 500
    fun requestSize(downloaded: Int): Long {
        require(downloaded in 0..MAX_ROWS)
        return minOf(PAGE_SIZE, MAX_ROWS + 1 - downloaded).toLong()
    }
    fun validatePage(downloaded: Int, received: Int) {
        require(received >= 0 && received <= requestSize(downloaded))
        require(downloaded + received <= MAX_ROWS) { "雲端資料超出預覽版同步上限" }
    }
}
