package tw.searchbefore.nativeapp

import org.json.JSONObject
import java.text.Normalizer
import java.util.Locale

data class SearchHit(val value: String, val label: String, val score: Int)
/** Suggestions require an explicit click. They never establish registration or select a pesticide. */
class NativeSearch(private val readings: JSONObject, private val characters: JSONObject) {
    companion object {
        fun normalize(value: String) = Normalizer.normalize(value, Normalizer.Form.NFKC).lowercase(Locale.ROOT)
            .replace(Regex("[\\s·‧・,，.。()（）【】\\[\\]{}「」『』'\"_\\-–—/\\\\]"), "")
        fun distance(a: String, b: String): Int {
            if(a.length > 120 || b.length > 120) return 121
            val d = Array(a.length + 1) { IntArray(b.length + 1) }
            for(i in 0..a.length) d[i][0] = i
            for(j in 0..b.length) d[0][j] = j
            for(i in 1..a.length) for(j in 1..b.length) {
                d[i][j] = minOf(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+if(a[i-1] == b[j-1]) 0 else 1)
                if(i>1 && j>1 && a[i-1] == b[j-2] && a[i-2] == b[j-1]) d[i][j] = minOf(d[i][j],d[i-2][j-2]+1)
            }
            return d[a.length][b.length]
        }
        private val initials = mapOf('ㄅ' to "b",'ㄆ' to "p",'ㄇ' to "m",'ㄈ' to "f",'ㄉ' to "d",'ㄊ' to "t",'ㄋ' to "n",'ㄌ' to "l",'ㄍ' to "g",'ㄎ' to "k",'ㄏ' to "h",'ㄐ' to "j",'ㄑ' to "q",'ㄒ' to "x",'ㄓ' to "zh",'ㄔ' to "ch",'ㄕ' to "sh",'ㄖ' to "r",'ㄗ' to "z",'ㄘ' to "c",'ㄙ' to "s")
        private val finals = mapOf("ㄚ" to "a","ㄛ" to "o","ㄜ" to "e","ㄝ" to "e","ㄞ" to "ai","ㄟ" to "ei","ㄠ" to "ao","ㄡ" to "ou","ㄢ" to "an","ㄣ" to "en","ㄤ" to "ang","ㄥ" to "eng","ㄦ" to "er","ㄧ" to "i","ㄧㄚ" to "ia","ㄧㄝ" to "ie","ㄧㄠ" to "iao","ㄧㄡ" to "iu","ㄧㄢ" to "ian","ㄧㄣ" to "in","ㄧㄤ" to "iang","ㄧㄥ" to "ing","ㄨ" to "u","ㄨㄚ" to "ua","ㄨㄛ" to "uo","ㄨㄞ" to "uai","ㄨㄟ" to "ui","ㄨㄢ" to "uan","ㄨㄣ" to "un","ㄨㄤ" to "uang","ㄨㄥ" to "ong","ㄩ" to "v","ㄩㄝ" to "ve","ㄩㄢ" to "van","ㄩㄣ" to "vn","ㄩㄥ" to "iong")
        private val zero = mapOf("i" to "yi","ia" to "ya","ie" to "ye","iao" to "yao","iu" to "you","ian" to "yan","in" to "yin","iang" to "yang","ing" to "ying","u" to "wu","ua" to "wa","uo" to "wo","uai" to "wai","ui" to "wei","uan" to "wan","un" to "wen","uang" to "wang","ong" to "weng","v" to "yu","ve" to "yue","van" to "yuan","vn" to "yun","iong" to "yong")
        fun bopomofo(value: String): String {
            val parts = mutableListOf<String>(); var part = ""
            for(c in value.filterNot { it.isWhitespace() }) {
                if(c in "ˊˇˋ˙") { if(part.isNotEmpty()) parts.add(part); part = "" }
                else if(c in initials && part.isNotEmpty()) { parts.add(part); part = c.toString() }
                else part += c
            }
            if(part.isNotEmpty()) parts.add(part)
            return parts.joinToString("") { syllable ->
                val initial = initials[syllable[0]].orEmpty()
                val tail = if(initial.isEmpty()) syllable else syllable.drop(1)
                val final = finals[tail] ?: if(tail.isEmpty() && initial in listOf("zh","ch","sh","r","z","c","s")) "i" else ""
                if(initial.isEmpty()) zero[final] ?: final else initial + if(initial in listOf("j","q","x")) final.replace('v','u') else final
            }
        }
    }
    private fun reading(value: String): String {
        readings.optJSONObject(value)?.optString("full")?.takeIf { it.isNotEmpty() }?.let { return it }
        if(value.any { it in 'ㄅ'..'ㄩ' }) return bopomofo(value)
        if(value.matches(Regex("[a-zA-ZüÜvV\\s'\\-]+"))) return Normalizer.normalize(value,Normalizer.Form.NFD).replace(Regex("\\p{M}"), "").lowercase().replace(Regex("[^a-zv]"), "")
        return value.map { characters.optString(it.toString()) }.takeIf { pieces -> pieces.isNotEmpty() && pieces.all { it.isNotEmpty() } }?.joinToString("").orEmpty()
    }
    fun suggestions(query: String, candidates: List<String>, limit: Int = 12): List<SearchHit> {
        val q = normalize(query.take(120)); if(q.isEmpty()) return emptyList()
        val qr = reading(query)
        return candidates.asSequence().distinct().mapNotNull { candidate ->
            val c = normalize(candidate)
            val score: Pair<Int,String> = when {
                q == c || c.contains(q) -> return@mapNotNull null
                c.length >= 2 && q.contains(c) -> 94 to "從輸入內容辨識，請確認"
                q.length > 1 && q.length == c.length && q.toList().sorted() == c.toList().sorted() -> 91 to "字序可能顛倒"
                qr.isNotEmpty() && qr == reading(candidate) -> 90 to "讀音／注音相同，請確認"
                q.length >= 2 && kotlin.math.abs(q.length-c.length)<=2 && distance(q,c) <= if(maxOf(q.length,c.length)>=6) 2 else 1 -> 77 to "可能有錯字，請確認"
                else -> return@mapNotNull null
            }
            SearchHit(candidate,score.second,score.first)
        }.sortedWith(compareByDescending<SearchHit> { it.score }.thenBy { it.value.length }).take(limit).toList()
    }
}
