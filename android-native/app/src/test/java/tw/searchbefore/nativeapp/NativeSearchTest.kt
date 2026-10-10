package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeSearchTest {
    private val search = NativeSearch(JSONObject("""{"蔥":{"full":"cong"},"番茄":{"full":"fanqie"},"蘇力菌":{"full":"sulijun"}}"""), JSONObject())
    @Test fun normalizedExactMatchesAreNotPresentedAsFuzzy() {
        assertEquals("abc123", NativeSearch.normalize("ＡＢＣ（１２３）"))
        assertTrue(search.suggestions("蔥", listOf("蔥", "珠蔥")).isEmpty())
    }
    @Test fun bopomofoAndPinyinOnlyReturnSuggestions() {
        assertEquals("cong", NativeSearch.bopomofo("ㄘㄨㄥ"))
        assertEquals("fanqie", NativeSearch.bopomofo("ㄈㄢ ㄑㄧㄝˊ"))
        assertEquals("sulijun", NativeSearch.bopomofo("ㄙㄨ ㄌㄧˋ ㄐㄩㄣ"))
        assertEquals("蔥", search.suggestions("ㄘㄨㄥ", listOf("蔥", "番茄")).single().value)
        assertEquals("蘇力菌", search.suggestions("sulijun", listOf("蘇力菌")).single().value)
    }
    @Test fun typoReorderAndSentenceCandidatesNeverInventNames() {
        val candidates = listOf("蘇力菌", "番茄")
        assertEquals("蘇力菌", search.suggestions("蘇利菌", candidates).first().value)
        assertEquals("番茄", search.suggestions("茄番", candidates).first().value)
        assertEquals("番茄", search.suggestions("想查番茄", candidates).first().value)
        assertTrue(search.suggestions("不存在的完全不同作物", candidates).isEmpty())
        assertEquals(1, NativeSearch.distance("abc", "acb"))
    }
}
