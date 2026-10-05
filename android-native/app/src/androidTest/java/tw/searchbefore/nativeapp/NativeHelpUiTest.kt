package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.junit4.StateRestorationTester
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class NativeHelpUiTest {
    @get:Rule val compose = createComposeRule()
    @Test fun feedbackRequiresExplicitActionAndDraftRestoresWithoutSending() {
        val copies = mutableListOf<String>(); var mails = 0; var dismisses = 0
        val restoration = StateRestorationTester(compose)
        restoration.setContent { SearchBeforeTheme { FeedbackDialog("TEST_DATA", true, { dismisses++ }, { copies += it }, true, { _, _ -> mails++ }) } }
        compose.onNodeWithText("開啟郵件草稿").assertIsNotEnabled()
        compose.onNodeWithText("問題描述（最多 2,000 字）").performScrollTo().performTextInput("TEST_DESCRIPTION")
        restoration.emulateSavedInstanceStateRestore()
        compose.runOnIdle { assertTrue(copies.isEmpty()); assertEquals(0, mails) }
        compose.onNodeWithText("複製回饋內容").performClick()
        compose.runOnIdle { assertTrue(copies.single().contains("TEST_DESCRIPTION")); assertEquals(0, mails) }
        compose.onNodeWithText("取消").performClick()
        compose.runOnIdle { assertEquals(1, dismisses); assertEquals(0, mails) }
    }
    @Test fun unavailableMailConfigurationDoesNotExposeSendAction() {
        compose.setContent { SearchBeforeTheme { FeedbackDialog("TEST", true, {}, {}, false, { _, _ -> error("must not send") }) } }
        compose.onNodeWithText("開啟郵件草稿").assertDoesNotExist()
        compose.onNodeWithText("複製回饋內容").assertIsNotEnabled()
    }
    @Test fun bundledGuideCanBeReadAndClosedWithoutNetworkAction() {
        val guide = JSONObject().put("id", "test").put("title", "TEST_GUIDE").put("sourceUrl", "https://searchbefore.tw/guide-phi.html")
            .put("blocks", JSONArray(listOf("TEST_OFFLINE_BODY", "安全界線 TEST_BOUNDARY")))
        val catalog = Catalog(JSONObject().put("dataVersion", "TEST").put("rows", JSONArray()).put("related", JSONObject()).put("guides", JSONArray().put(guide)).toString())
        compose.setContent { SearchBeforeTheme { Box(Modifier.fillMaxSize()) { NativeHelpCard(catalog, true) } } }
        compose.onNodeWithText("TEST_GUIDE").performClick()
        compose.onNodeWithText("TEST_OFFLINE_BODY").assertIsDisplayed()
        compose.onNodeWithText("關閉指南").performClick()
        compose.onNodeWithTag("offlineGuide").assertDoesNotExist()
    }
}
