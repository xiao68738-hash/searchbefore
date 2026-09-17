package tw.searchbefore.nativeapp

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.test.platform.app.InstrumentationRegistry
import android.graphics.Bitmap
import java.io.File
import org.junit.Rule
import org.junit.Test

/** Read-only smoke tests. Never click login, sync, import, save or delete on a connected device. */
class NativeNavigationTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private fun ready() {
        compose.waitUntil(timeoutMillis = 60000) { compose.onAllNodesWithText("按作物查").fetchSemanticsNodes().isNotEmpty() }
    }
    private fun capturePublicQuery(name: String) {
        val folder = File(InstrumentationRegistry.getInstrumentation().targetContext.cacheDir, "native-validation/public-query").apply { mkdirs() }
        val bitmap = compose.onRoot().captureToImage().asAndroidBitmap()
        File(folder, name).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
    @Test fun exactRegistrationAndRelatedLinkRemainSeparate() {
        ready()
        compose.onNodeWithText("作物名稱，例如：蔥").performTextInput("蔥")
        compose.onNodeWithText("作物名稱，例如：蔥").performImeAction()
        compose.onNodeWithTag("queryList").performScrollToNode(hasText("蔥") and hasClickAction() and !hasSetTextAction())
        compose.onNode(hasText("蔥") and hasClickAction() and !hasSetTextAction()).performClick()
        compose.onNodeWithTag("queryList").performScrollToNode(hasText("甜菜夜蛾　1 筆登記用法"))
        compose.onNodeWithText("甜菜夜蛾　1 筆登記用法").performClick()
        compose.onNodeWithText("蔥 × 甜菜夜蛾").assertIsDisplayed()
        capturePublicQuery("beet-armyworm.png")
        compose.onNodeWithTag("queryList").performScrollToNode(hasText("也要看看蔥 × 夜蛾類用藥嗎？"))
        compose.onNodeWithText("也要看看蔥 × 夜蛾類用藥嗎？").performClick()
        compose.onNodeWithText("蔥 × 夜蛾類").assertIsDisplayed()
        capturePublicQuery("armyworm-group.png")
    }
    @Test fun fiveNativeTabsAndActivityRecreationWorkWithoutLogin() {
        ready()
        capturePublicQuery("home.png")
        compose.onNodeWithText("農務", useUnmergedTree = true).performClick()
        compose.onNodeWithText("新增農務紀錄").assertExists()
        compose.onNodeWithText("配方", useUnmergedTree = true).performClick()
        compose.onNodeWithText("常用配方").assertExists()
        compose.onNodeWithText("個人", useUnmergedTree = true).performClick()
        compose.onNodeWithText("你的資料").assertExists()
        compose.activityRule.scenario.recreate()
        compose.waitUntil(timeoutMillis = 60000) { compose.onAllNodesWithText("你的資料").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("紀錄", useUnmergedTree = true).performClick()
        compose.onNodeWithText("新增田區／種植批次").assertExists()
    }
    @Test fun migrationGuideIsOptionalAndNeverStartsLoginOrImportByItself() {
        ready()
        compose.onNodeWithText("舊版資料移轉").performClick()
        compose.onNodeWithText("把舊版紀錄帶過來").assertIsDisplayed()
        compose.onNodeWithText("前往個人頁").performScrollTo()
        compose.onNodeWithText("前往個人頁").performClick()
        compose.onNodeWithText("你的資料").assertExists()
        compose.onNodeWithText("同意合併雲端紀錄？").assertDoesNotExist()
        compose.onNodeWithText("確認匯入備份").assertDoesNotExist()
        compose.onNodeWithText("舊版資料移轉").performClick()
        compose.onNodeWithText("先繼續使用").performClick()
        compose.onNodeWithText("把舊版紀錄帶過來").assertDoesNotExist()
    }
}
