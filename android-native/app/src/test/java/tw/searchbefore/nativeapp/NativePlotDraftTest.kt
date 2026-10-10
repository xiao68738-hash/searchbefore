package tw.searchbefore.nativeapp

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativePlotDraftTest {
    @Test fun customNameNeedsExplicitChoiceAndNeverBecomesSimilarRegisteredCrop() {
        val before = Backup.empty()
        assertTrue(runCatching { Backup.addPlot(before, "TEST_CUSTOM", "", "", listOf("蔥")) }.isFailure)
        val after = Backup.addPlot(before, " TEST_CUSTOM ", "", "", listOf("蔥"), " TEST_VARIETY ", true)
        val plot = Backup.plots(after).single()
        assertEquals("TEST_CUSTOM", plot.getString("crop")); assertEquals("custom", plot.getString("cropSource"))
        assertEquals("TEST_VARIETY", plot.getString("variety")); assertEquals("", plot.getString("plantDate"))
        assertEquals("TEST_CUSTOM / TEST_VARIETY", Backup.plotLabel(plot))
        assertEquals(0, Backup.plots(before).size)
        assertEquals(plot.toString(), Backup.plots(Backup.parse(Backup.encode(after))).single().toString())
    }
    @Test fun exactRegisteredCropStaysRegisteredEvenWhenCustomWasChecked() {
        val after = Backup.addPlot(Backup.empty(), " 蔥 ", "", "", listOf("蔥"), custom = true)
        assertEquals("registered", Backup.plots(after).single().getString("cropSource"))
        assertEquals("蔥", Backup.plotLabel(Backup.plots(after).single()))
    }
    @Test fun unknownCropNeverAcceptsAnotherCropsUseRecord() {
        val data = Backup.addPlot(Backup.empty(), "TEST_CUSTOM", "", "", listOf("蔥"), custom = true)
        val row = UsageRow(JSONObject().put("id", "u").put("crop", "蔥").put("pest", "夜蛾類").put("name", "TEST_AGENT")
            .put("phi", JSONObject.NULL).put("usage", JSONObject()))
        assertTrue(runCatching { Backup.appendRecord(data, row, "2026-01-01", Backup.plots(data).single().getString("id")) }.isFailure)
        assertEquals(0, data.getJSONArray("records").length())
    }
    @Test fun editingVarietyKeepsIdentitySourceUnknownFieldsAndStaleWriteGuard() {
        val data = Backup.addPlot(Backup.empty(), "TEST_CUSTOM", "OLD", "", emptyList(), "FIRST", true)
        val plot = Backup.plots(data).single().put("extra", JSONObject().put("keep", true))
        val before = data.toString(); val id = plot.getString("id"); val stamp = plot.getString("updatedAt")
        val after = Backup.updatePlot(data, id, stamp, "", "", " SECOND ")
        val updated = Backup.plots(after).single()
        assertEquals("SECOND", updated.getString("variety")); assertEquals("", updated.getString("tag"))
        for(key in listOf("id", "crop", "name", "cropSource", "extra")) assertEquals(plot.get(key).toString(), updated.get(key).toString())
        assertTrue(runCatching { Backup.updatePlot(after, id, stamp, "STALE", "", "THIRD") }.isFailure)
        assertEquals(before, data.toString())
    }
    @Test fun inputBoundsAndFutureDatesAreRejectedWithoutWrites() {
        val invalid = listOf(PlotDraft("", "", "", custom = true), PlotDraft("x".repeat(121), "", "", custom = true),
            PlotDraft("TEST", "bad\nname", "", custom = true), PlotDraft("TEST", "", "", "v".repeat(121), true),
            PlotDraft("TEST", "", "2026-02-30", custom = true), PlotDraft("TEST", "", java.time.LocalDate.now().plusDays(1).toString(), custom = true))
        invalid.forEach { assertTrue(runCatching { it.validate(emptyList()) }.isFailure) }
    }
    @Test fun defaultPlotIsExplicitExactCropOnlyAndNeverReassignsExistingRecords() {
        val data = Backup.addPlot(Backup.empty(), "蔥", "", "", listOf("蔥"))
        val id = Backup.plots(data).single().getString("id")
        assertEquals(id, Backup.defaultPlot(data, "蔥"))
        assertEquals("", Backup.defaultPlot(data, "洋蔥"))
        val before = data.toString()
        val cleared = Backup.selectDefaultPlot(data, "")
        assertEquals("", Backup.defaultPlot(cleared))
        assertEquals(id, Backup.defaultPlot(Backup.selectDefaultPlot(cleared, id)))
        assertTrue(runCatching { Backup.selectDefaultPlot(data, "deleted") }.isFailure)
        assertEquals(before, data.toString())
        assertEquals(data.getJSONArray("records").toString(), cleared.getJSONArray("records").toString())
    }
}
