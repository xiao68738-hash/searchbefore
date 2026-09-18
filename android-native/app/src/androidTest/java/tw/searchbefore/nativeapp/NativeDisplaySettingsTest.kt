package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

/** Synthetic UI only; does not change installation preferences or access accounts. */
class NativeDisplaySettingsTest {
    @get:Rule val compose = createComposeRule()
    @Test fun settingsRemainOperableWithLargeSystemFonts() {
        var selected by mutableStateOf(DisplayPreferences())
        compose.setContent {
            SearchBeforeTheme(selected) {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    DisplaySettings(selected, true) { selected = it }
                }
            }
        }
        compose.onNodeWithText("特大").performScrollTo().performClick()
        compose.runOnIdle { assertEquals("xlarge", selected.font) }
        compose.onNodeWithText("深色模式").performScrollTo().performClick()
        compose.runOnIdle { assertTrue(selected.dark) }
        compose.onNodeWithText("高對比").performScrollTo().performClick()
        compose.runOnIdle { assertTrue(selected.highContrast) }
        compose.onNodeWithText("還原顯示預設值").performScrollTo().performClick()
        compose.runOnIdle { assertEquals(DisplayPreferences(), selected) }
    }
    @Test fun normalTextColorPairsMeetContrastInAllFourModes() {
        for(dark in listOf(false, true)) for(high in listOf(false, true)) {
            val c = nativeColors(DisplayPreferences(dark = dark, highContrast = high))
            for((foreground, background) in listOf(c.onSurface to c.surface, c.onBackground to c.background,
                c.onSurfaceVariant to c.surfaceVariant, c.onPrimary to c.primary,
                c.onSecondaryContainer to c.secondaryContainer)) {
                val a = foreground.luminance(); val b = background.luminance()
                val ratio = (maxOf(a,b) + .05f) / (minOf(a,b) + .05f)
                assertTrue("dark=$dark high=$high contrast=$ratio", ratio >= 4.5f)
            }
        }
    }
}
