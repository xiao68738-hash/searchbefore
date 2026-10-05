package tw.searchbefore.nativeapp

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeRecipeReferenceTest {
    private fun row() = UsageRow(JSONObject().put("id", "TEST_SEED").put("crop", "豌豆").put("pest", "TEST_PEST")
        .put("name", "TEST_AGENT").put("formKind", "粉").put("phi", JSONObject.NULL).put("note", "TEST_NOTE")
        .put("bl", JSONArray(listOf("TEST_BRAND"))).put("usage", JSONObject().put("label", "用途").put("value", "種子處理")
            .put("detail", "TEST_DETAIL").put("canCalculateDilution", false)))
    private fun catalog(vararg rows: UsageRow) = Catalog(JSONObject().put("dataVersion", "TEST")
        .put("related", JSONObject()).put("rows", JSONArray(rows.map { it.json })).toString())
    @Test fun referencePreservesPurposeWithoutRatioWaterOrRecordAndRoundtrips() {
        val original = Backup.empty(); val source = row(); val before = source.json.toString()
        val data = Recipes.addReference(original, source); val reference = Recipes.rows(data).single()
        assertTrue(reference.getBoolean("nativeReference")); assertEquals(0, reference.getInt("dil")); assertEquals(0, reference.getInt("water"))
        assertEquals("種子處理", reference.getJSONObject("nativeUsage").getString("value"))
        assertEquals("TEST_NOTE", reference.getString("nativeRegistrationNote")); assertNull(Recipes.amount(reference, "20"))
        assertEquals(0, data.getJSONArray("records").length()); assertTrue(Recipes.rows(original).isEmpty())
        assertEquals(reference.toString(), Recipes.rows(Backup.parse(Backup.encode(data))).single().toString())
        assertEquals(before, source.json.toString())
    }
    @Test fun excludedOrCalculableRegistrationCannotUseReferenceSaveRoute() {
        val excluded = UsageRow(JSONObject(row().json.toString()).put("formCategory", "excluded"))
        assertTrue(runCatching { Recipes.addReference(Backup.empty(), excluded) }.isFailure)
        val normal = row().json.apply { getJSONObject("usage").put("canCalculateDilution", true) }
        assertTrue(runCatching { Recipes.addReference(Backup.empty(), UsageRow(normal)) }.isFailure)
    }
    @Test fun referenceEditsNeverCreateWaterOrRewriteRegistrationAndRejectStaleOrForeignBrand() {
        val data = Recipes.addReference(Backup.empty(), row()); val original = Recipes.rows(data).single()
        val stamp = NativeSync.canonical(original)
        val updated = Recipes.update(data, 0, stamp, "not a water value", "TEST_BRAND", "MY_NOTE")
        val result = Recipes.rows(updated).single()
        assertEquals(0, result.getInt("water")); assertEquals(0, result.getInt("dil")); assertEquals("MY_NOTE", result.getString("note"))
        assertEquals(original.getJSONObject("nativeUsage").toString(), result.getJSONObject("nativeUsage").toString())
        assertTrue(runCatching { Recipes.update(updated, 0, stamp, "", "", "stale") }.isFailure)
        assertTrue(runCatching { Recipes.update(data, 0, stamp, "", "OTHER_BRAND", "") }.isFailure)
    }
    @Test fun legacyZeroRatioIsReadOnlyReferenceNotAutomaticDose() {
        val legacy = JSONObject().put("crop", "豌豆").put("pest", "TEST_PEST").put("agent", "TEST_AGENT")
            .put("dil", 0).put("water", 20).put("unit", "g")
        assertTrue(Recipes.referenceOnly(legacy)); assertNull(Recipes.amount(legacy, "20"))
        assertEquals(1, RecipeUse.referenceOptions(legacy, catalog(row())).size)
        assertTrue(RecipeUse.options(legacy, catalog(row())).isEmpty())
    }
    @Test fun referenceFlagStillBlocksBatchAndLaunchWhenOldFieldsAreTampered() {
        val reference = Recipes.rows(Recipes.addReference(Backup.empty(), row())).single().put("unit", "g").put("dil", 1000).put("water", 20)
        assertNull(Recipes.amount(reference, "20")); assertNull(recipeBatchAmounts(reference, "20", "2"))
        val normal = row().json.put("dilution", "1000").apply { getJSONObject("usage").put("canCalculateDilution", true) }
        assertTrue(runCatching { RecipeUse.launch(reference, catalog(UsageRow(normal)), "TEST_SEED", "") }.isFailure)
    }
    @Test fun currentReferenceListIsExactAndDoesNotInferRelatedPestsOrCrops() {
        val reference = Recipes.rows(Recipes.addReference(Backup.empty(), row())).single()
        val otherCrop = UsageRow(JSONObject(row().json.toString()).put("id", "other").put("crop", "甜豌豆"))
        val otherPest = UsageRow(JSONObject(row().json.toString()).put("id", "related").put("pest", "RELATED_PEST"))
        assertEquals(listOf("TEST_SEED"), RecipeUse.referenceOptions(reference, catalog(row(), otherCrop, otherPest)).map { it.row.id })
    }
}
