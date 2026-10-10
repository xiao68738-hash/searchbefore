package tw.searchbefore.nativeapp

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Rule
import org.junit.Test
import org.junit.Assert.*

/** Isolated component only: never saves a user's app record. */
class NativeApplicationUiTest {
    @get:Rule val compose = createComposeRule()
    @Test fun actualAmountRequiresUnitAndDoesNotAutofillWater() {
        var saved: ApplicationDetails? = null
        compose.setContent { MaterialTheme { Column(Modifier.verticalScroll(rememberScrollState())) {
            var details by remember { mutableStateOf(ApplicationDetails()) }
            ApplicationFields(details) { details=it }
            Button(enabled=runCatching { details.validate() }.isSuccess,onClick={saved=details}) { Text("確認測試資料") }
        } } }
        compose.onNodeWithText("本次製品總用量（不是有效成分量）").performTextInput("1.25")
        compose.onNodeWithText("確認測試資料").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("g",substring=false).performScrollTo().performClick()
        compose.onNodeWithText("確認測試資料").performScrollTo().assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals("1.25",saved?.amount); assertEquals("g",saved?.unit); assertEquals("",saved?.water); assertEquals("",saved?.totalWater) }
    }
}
