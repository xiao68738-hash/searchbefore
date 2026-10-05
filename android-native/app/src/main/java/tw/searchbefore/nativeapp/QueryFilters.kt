package tw.searchbefore.nativeapp

/** Filters only narrow the supplied original registrations; they never expand a use. */
object QueryFilters {
    fun phiLimit(text: String): Int? = text.trim().takeIf { it.matches(Regex("[0-9]{1,3}")) }
        ?.toIntOrNull()?.takeIf { it in 1..365 }

    fun registrations(rows: List<UsageRow>, agent: String = "", maximumPhi: Int? = null): List<UsageRow> =
        rows.filter { row ->
            (agent.isEmpty() || row.name == agent) &&
                (maximumPhi == null || (maximumPhi in 1..365 && row.phi?.let { it <= maximumPhi } == true))
        }

    fun sections(rows: List<UsageRow>): RegistrationSections = RegistrationSections(
        rows.filter { !it.formExcluded && !it.usage.optBoolean("isSpecial") },
        rows.filter { !it.formExcluded && it.usage.optBoolean("isSpecial") },
        rows.filter { it.formExcluded }
    )
}

data class RegistrationSections(val ordinary: List<UsageRow>, val special: List<UsageRow>, val excluded: List<UsageRow>)

/** Preserve the printed interval, while all filtering/countdowns keep the conservative numeric value. */
fun UsageRow.harvestLabel(): String {
    val days = phi ?: return if(json.optBoolean("seed")) "不適用" else "請查產品標示"
    val range = json.optString("phiText").takeIf { it.matches(Regex("[0-9]+(?:\\.[0-9]+)?(?:-[0-9]+(?:\\.[0-9]+)?)+")) }
    return "${range ?: days.toBigDecimal().stripTrailingZeros().toPlainString()} 天"
}
