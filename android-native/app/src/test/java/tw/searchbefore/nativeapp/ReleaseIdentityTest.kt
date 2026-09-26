package tw.searchbefore.nativeapp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class ReleaseIdentityTest {
    @Test fun debugAlwaysIdentifiesPreview() {
        assertEquals("原生開發預覽", releaseIdentityLabel(true, "1.1.4-preview"))
        assertEquals("原生開發預覽", releaseIdentityLabel(true, "1.1.4-internal-preview"))
    }

    @Test fun archivedInternalVersionsKeepTheirLabel() {
        assertEquals("內部測試版", releaseIdentityLabel(false, "1.1.4-internal"))
        assertEquals("內部測試版", releaseIdentityLabel(false, "1.1.4-INTERNAL"))
    }

    @Test fun productionShapedCandidateDoesNotClaimItsDistributionTrack() {
        val label = releaseIdentityLabel(false, "1.1.4")
        assertEquals("版本 1.1.4", label)
        assertFalse(label.contains("正式"))
        assertFalse(label.contains("通過"))
    }
}
