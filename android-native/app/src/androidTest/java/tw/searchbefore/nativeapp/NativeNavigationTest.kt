package tw.searchbefore.nativeapp

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import android.graphics.Bitmap
import java.io.File
import org.junit.Rule
import org.junit.Test

/** Disposable-emulator navigation tests. The theme test restores its local preference.
 * Never click login, sync, import, record save or delete; never run on a user's phone. */
class NativeNavigationTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private fun ready() {
        compose.waitUntil(timeoutMillis = 60000) { compose.onAllNodesWithTag("queryList").fetchSemanticsNodes().isNotEmpty() }
    }
    private fun capturePublicQuery(name: String) {
        val folder = File(InstrumentationRegistry.getInstrumentation().targetContext.cacheDir, "native-validation/public-query").apply { mkdirs() }
        compose.waitForIdle()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        instrumentation.waitForIdleSync()
        // Capture the real window after its frame is presented, including fixed header/navigation.
        android.os.SystemClock.sleep(250)
        val bitmap = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
        compose.onNodeWithTag("brandHeader").assertIsDisplayed()
        compose.onNodeWithText("個人", useUnmergedTree = true).assertIsDisplayed()
        val header = compose.onNodeWithTag("brandHeader").fetchSemanticsNode().boundsInRoot
        org.junit.Assert.assertEquals("Scrolled results must not paint over the fixed brand header",
            android.graphics.Color.rgb(23, 51, 31), bitmap.getPixel(header.left.toInt() + 4, header.center.y.toInt()))
        File(folder, name).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
    @Test fun darkSystemBarsHaveDarkBackgroundAndLightIcons() {
        ready()
        compose.onNodeWithText("個人", useUnmergedTree = true).performClick()
        val list = compose.onNode(hasScrollToIndexAction())
        val toggle = compose.onNodeWithText("深色模式")
        list.performScrollToNode(hasText("深色模式"))
        // This setting is inside a tall, lazily composed card. Scroll the actual list
        // first, then use real swipes to expose its lower controls at 1.5x fonts.
        for (attempt in 0 until 8) {
            if (runCatching { toggle.assertIsDisplayed() }.isSuccess) break
            list.performTouchInput { swipeUp(startY = height * .75f, endY = height * .45f) }
        }
        toggle.assertIsDisplayed().performClick()
        try {
            compose.waitForIdle()
            val instrumentation = InstrumentationRegistry.getInstrumentation()
            instrumentation.waitForIdleSync()
            android.os.SystemClock.sleep(250)
            val bitmap = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
            val background = android.graphics.Color.rgb(21, 28, 23)
            org.junit.Assert.assertEquals("Status-bar inset must use the selected dark background", background, bitmap.getPixel(4, 4))
            org.junit.Assert.assertEquals("Gesture inset must use the selected dark background", background, bitmap.getPixel(4, bitmap.height - 4))
            compose.runOnIdle {
                val window = compose.activity.window
                val controller = androidx.core.view.WindowCompat.getInsetsController(window, window.decorView)
                org.junit.Assert.assertFalse(controller.isAppearanceLightStatusBars)
                org.junit.Assert.assertFalse(controller.isAppearanceLightNavigationBars)
            }
        } finally {
            // Only the disposable emulator suite runs this test. Restore the default
            // through the actual UI so following navigation tests retain their baseline.
            toggle.assertIsDisplayed().performClick()
        }
    }
    @Test fun exactRegistrationAndRelatedLinkRemainSeparate() {
        ready()
        compose.onNodeWithTag("queryList").performScrollToNode(hasText("作物名稱，例如：蔥"))
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
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val firstName = Catalog(context.assets.open("catalog.json").bufferedReader().use { it.readText() }).exact("蔥", "夜蛾類").first().name
        compose.onNodeWithTag("queryList").performScrollToNode(hasText(firstName))
        compose.onNodeWithTag("queryList").performScrollToIndex(5)
        compose.onNodeWithText(firstName).assertIsDisplayed()
        capturePublicQuery("registered-use.png")
    }
    @Test fun sixTwaTabsAndActivityRecreationWorkWithoutLogin() {
        ready()
        capturePublicQuery("home.png")
        compose.onNodeWithText("計算", useUnmergedTree = true).performClick()
        compose.onNodeWithText("先選擇一筆登記用法").assertExists()
        compose.onNodeWithText("倒數", useUnmergedTree = true).performClick()
        compose.onNodeWithText("安全採收期倒數").assertExists()
        compose.onNodeWithText("紀錄", useUnmergedTree = true).performClick()
        compose.onNodeWithText("農務", useUnmergedTree = true).performClick()
        compose.onNodeWithText("新增農務紀錄").assertExists()
        compose.onNodeWithText("配方", useUnmergedTree = true).performClick()
        compose.onNodeWithText("常用配方").assertExists()
        compose.onNodeWithText("個人", useUnmergedTree = true).performClick()
        compose.onNodeWithText("你的資料").assertExists()
        compose.activityRule.scenario.recreate()
        compose.waitUntil(timeoutMillis = 60000) { compose.onAllNodesWithText("你的資料").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("紀錄", useUnmergedTree = true).performClick()
        compose.onNodeWithText("用藥與田區").performClick()
        compose.onNodeWithText("新增田區／種植批次").assertExists()
    }
    @Test fun queryScopeSurvivesTabSwitchAndCalculatorUsesExactRegistration() {
        ready()
        compose.onNodeWithTag("queryList").performScrollToNode(hasText("作物名稱，例如：蔥"))
        compose.onNodeWithText("作物名稱，例如：蔥").performTextInput("蔥")
        compose.onNodeWithText("作物名稱，例如：蔥").performImeAction()
        compose.onNodeWithTag("queryList").performScrollToNode(hasText("蔥") and hasClickAction() and !hasSetTextAction())
        compose.onNode(hasText("蔥") and hasClickAction() and !hasSetTextAction()).performClick()
        compose.onNodeWithTag("queryList").performScrollToNode(hasText("甜菜夜蛾　1 筆登記用法"))
        compose.onNodeWithText("甜菜夜蛾　1 筆登記用法").performClick()
        compose.onNodeWithTag("queryList").performScrollToNode(hasText("配藥計算"))
        compose.onNodeWithText("配藥計算").performClick()
        compose.onNodeWithText("蔥 × 甜菜夜蛾").assertExists()
        compose.activityRule.scenario.recreate()
        compose.waitUntil(timeoutMillis = 60000) { compose.onAllNodesWithText("蔥 × 甜菜夜蛾").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("查詢", useUnmergedTree = true).performClick()
        compose.onNodeWithText("配藥計算").assertIsDisplayed()
        compose.onNodeWithTag("queryList").performScrollToNode(hasText("蔥 × 甜菜夜蛾"))
        compose.onNodeWithText("蔥 × 甜菜夜蛾").assertIsDisplayed()
        compose.onNodeWithText("確認匯入備份").assertDoesNotExist()
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
