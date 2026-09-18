package tw.searchbefore.nativeapp

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.Density

/** Local, deterministic brand UI. No network fonts, analytics or new permissions. */
internal fun nativeColors(preferences: DisplayPreferences): ColorScheme {
    val colors = if(preferences.dark) darkColorScheme(
        primary = Color(0xFFA4D5A7), onPrimary = Color(0xFF12351C),
        primaryContainer = Color(0xFF243D2C), onPrimaryContainer = Color(0xFFCEEFD1),
        secondary = Color(0xFFF0C69C), onSecondary = Color(0xFF452A10),
        secondaryContainer = Color(0xFF44341F), onSecondaryContainer = Color(0xFFFFDBAF),
        background = Color(0xFF151C17), onBackground = Color(0xFFE6EDE3),
        surface = Color(0xFF1E2821), onSurface = Color(0xFFE6EDE3),
        surfaceContainerLowest = Color(0xFF121914), surfaceContainerLow = Color(0xFF1A231D),
        surfaceContainer = Color(0xFF263128), surfaceContainerHigh = Color(0xFF303D32),
        surfaceContainerHighest = Color(0xFF3A493D), surfaceTint = Color(0xFFA4D5A7),
        surfaceVariant = Color(0xFF303D32), onSurfaceVariant = Color(0xFFC7D3C5),
        outline = Color(0xFF97A894), outlineVariant = Color(0xFF52634F),
        error = Color(0xFFFFB5A9), onError = Color(0xFF571A12),
        errorContainer = Color(0xFF512820), onErrorContainer = Color(0xFFFFDAD3)
    ) else lightColorScheme(
            primary = Color(0xFF2E6B3F), onPrimary = Color.White,
            primaryContainer = Color(0xFFE7EFE4), onPrimaryContainer = Color(0xFF183528),
            secondary = Color(0xFF52634F), onSecondary = Color.White,
            secondaryContainer = Color(0xFFFCEAD8), onSecondaryContainer = Color(0xFF85420F),
            background = Color(0xFFF7F4EB), onBackground = Color(0xFF22301F),
            surface = Color.White, onSurface = Color(0xFF22301F),
            surfaceContainerLowest = Color.White, surfaceContainerLow = Color(0xFFFAF9F4),
            surfaceContainer = Color(0xFFF5F2E9), surfaceContainerHigh = Color(0xFFEEF1E9),
            surfaceContainerHighest = Color.White, surfaceTint = Color(0xFF2E6B3F),
            surfaceVariant = Color(0xFFEEF1E9), onSurfaceVariant = Color(0xFF52634F),
            outline = Color(0xFF7B8578), outlineVariant = Color(0xFFE1DDCF),
            error = Color(0xFF9E3026), onError = Color.White,
            errorContainer = Color(0xFFFFEDE6), onErrorContainer = Color(0xFF75271F)
        )
    return if(!preferences.highContrast) colors else if(preferences.dark) colors.copy(
        background = Color.Black, surface = Color(0xFF0B120D), onBackground = Color.White, onSurface = Color.White,
        onSurfaceVariant = Color.White, primary = Color(0xFFB8F5BA), outline = Color.White, outlineVariant = Color(0xFFB5C4B2)
    ) else colors.copy(background = Color.White, onBackground = Color.Black, onSurface = Color.Black,
        onSurfaceVariant = Color(0xFF172713), primary = Color(0xFF154626), outline = Color(0xFF253820), outlineVariant = Color(0xFF596D53))
}

@Composable fun SearchBeforeTheme(preferences: DisplayPreferences = DisplayPreferences(), content: @Composable () -> Unit) {
    val density = LocalDensity.current
    val scale = preferences.fontScale(density.fontScale)
    // Preserve Android's platform font scaling when no app-specific enlargement is needed.
    CompositionLocalProvider(LocalDensity provides if(scale == density.fontScale) density else Density(density.density, scale)) {
    MaterialTheme(
        colorScheme = nativeColors(preferences),
        shapes = Shapes(
            extraSmall = RoundedCornerShape(8.dp), small = RoundedCornerShape(12.dp),
            medium = RoundedCornerShape(12.dp), large = RoundedCornerShape(16.dp), extraLarge = RoundedCornerShape(24.dp)
        ),
        typography = Typography(
            headlineMedium = androidx.compose.ui.text.TextStyle(fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 36.sp),
            headlineSmall = androidx.compose.ui.text.TextStyle(fontWeight = FontWeight.Bold, fontSize = 24.sp, lineHeight = 32.sp),
            titleLarge = androidx.compose.ui.text.TextStyle(fontWeight = FontWeight.Bold, fontSize = 22.sp, lineHeight = 30.sp),
            titleMedium = androidx.compose.ui.text.TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 18.sp, lineHeight = 26.sp),
            bodyLarge = androidx.compose.ui.text.TextStyle(fontSize = 16.sp, lineHeight = 26.sp),
            bodyMedium = androidx.compose.ui.text.TextStyle(fontSize = 15.sp, lineHeight = 24.sp),
            labelLarge = androidx.compose.ui.text.TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 22.sp)
        ), content = content
    )
    }
}

@Composable fun BrandHeader(enabled: Boolean, migration: () -> Unit) {
    Row(Modifier.fillMaxWidth().testTag("brandHeader").background(Color(0xFF17331F)).padding(horizontal = 18.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(Modifier.weight(1f)) {
            Text(if(LocalDensity.current.fontScale > 1.25f) "噴前查" else "噴前查 SearchBefore", color = Color.White, fontFamily = FontFamily.Serif,
                fontSize = 21.sp, lineHeight = 29.sp, fontWeight = FontWeight.Bold)
            Text("查詢 × 計算 × 田間紀錄", color = Color(0xFFD2DECF), fontSize = 12.sp)
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(if (BuildConfig.DEBUG) "原生開發預覽" else "內部測試版", color = Color(0xFFD2DECF), fontSize = 11.sp)
            OutlinedButton(enabled = enabled, onClick = migration, contentPadding = PaddingValues(horizontal = 10.dp),
                border = BorderStroke(1.dp, Color(0xFFABBFA8)), colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White)) {
                Text("舊版資料移轉", fontSize = 12.sp)
            }
        }
    }
}

/** Simple code-native outline icons; labels on NavigationBarItem supply accessibility text. */
@Composable fun NativeTabIcon(index: Int) {
    val ink = LocalContentColor.current
    Canvas(Modifier.size(24.dp)) {
        val u = size.minDimension / 24f
        val stroke = Stroke(1.8f * u, cap = StrokeCap.Round)
        fun line(x1: Float, y1: Float, x2: Float, y2: Float) =
            drawLine(ink, Offset(x1*u, y1*u), Offset(x2*u, y2*u), 1.8f*u, StrokeCap.Round)
        when (index) {
            0 -> { drawCircle(ink, 6.5f*u, Offset(10*u,10*u), style=stroke); line(15f,15f,21f,21f) }
            1 -> { drawRoundRect(ink, Offset(5*u,2*u), Size(14*u,20*u), androidx.compose.ui.geometry.CornerRadius(2*u), style=stroke)
                line(8f,7f,16f,7f); for(y in listOf(12f,17f)) { line(8f,y,9f,y); line(15f,y,16f,y) } }
            2 -> { val book = Path().apply { moveTo(12*u,5*u); quadraticTo(7*u,1*u,2*u,4*u); lineTo(2*u,20*u); quadraticTo(7*u,17*u,12*u,21*u); quadraticTo(17*u,17*u,22*u,20*u); lineTo(22*u,4*u); quadraticTo(17*u,1*u,12*u,5*u) }
                drawPath(book,ink,style=stroke); line(12f,5f,12f,21f) }
            3 -> { drawCircle(ink,8*u,Offset(12*u,14*u),style=stroke); line(9f,2f,15f,2f); line(12f,6f,12f,2f); line(12f,14f,12f,9f); line(12f,14f,16f,17f) }
            4 -> { drawRoundRect(ink, Offset(5*u,3*u), Size(14*u,19*u), androidx.compose.ui.geometry.CornerRadius(2*u), style=stroke)
                line(9f,2f,15f,2f); line(9f,9f,15f,9f); line(9f,13f,15f,13f); line(9f,17f,13f,17f) }
            else -> { drawCircle(ink,4*u,Offset(12*u,6*u),style=stroke)
                drawArc(ink,180f,180f,false,Offset(4*u,13*u),Size(16*u,16*u),style=stroke) }
        }
    }
}

/** Same six destinations as the TWA; each target remains at least 48dp tall. */
@Composable internal fun TwaNavigation(selected: Int, enabled: Boolean, select: (Int) -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 2.dp) {
        Column {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Row(Modifier.fillMaxWidth().selectableGroup()) {
                listOf("查詢", "計算", "配方", "倒數", "紀錄", "個人").forEachIndexed { index, title ->
                    val active = selected == index
                    Column(Modifier.weight(1f).heightIn(min = 64.dp)
                        .selectable(active, enabled = enabled, role = Role.Tab, onClick = { select(index) })
                        .padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        CompositionLocalProvider(LocalContentColor provides if(active) MaterialTheme.colorScheme.onSecondaryContainer else MaterialTheme.colorScheme.onSurfaceVariant) {
                            Box(Modifier.background(if(active) MaterialTheme.colorScheme.secondaryContainer else Color.Transparent, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp, vertical = 5.dp)) { NativeTabIcon(index) }
                            Text(title, fontSize = 12.sp, lineHeight = 18.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}

@Composable internal fun QueryModeSwitch(mode: Int, change: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf("以作物找藥", "以藥劑找作物").forEachIndexed { index, title ->
            Surface(Modifier.weight(1f).selectable(mode == index, role = Role.Tab, onClick = { change(index) }),
                shape = RoundedCornerShape(12.dp), color = if(mode == index) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                border = BorderStroke(if(mode == index) 1.5.dp else 1.dp, if(mode == index) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant)) {
                Box(Modifier.padding(horizontal = 8.dp, vertical = 14.dp), contentAlignment = Alignment.Center) {
                    Text(title, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = if(mode == index) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable internal fun SafetyNotice() {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.secondaryContainer, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)) {
        Text("安全提醒：本工具是查詢與自主紀錄輔助。實際用藥、稀釋倍數及安全採收期，請以產品標示與主管機關最新公告為準。",
            Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSecondaryContainer, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
    }
}

@Composable internal fun QueryStep(number: Int, title: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("$number", color = MaterialTheme.colorScheme.primary, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
    }
}

@Composable fun BrandCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Card(modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}

@Composable fun SearchChoice(label: String, onClick: () -> Unit) {
    Surface(onClick = onClick, modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surface, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Row(Modifier.padding(horizontal = 18.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
            Text("›", modifier = Modifier.padding(start = 10.dp), color = MaterialTheme.colorScheme.primary, fontSize = 24.sp)
        }
    }
}

@Composable fun UsageFacts(label: String, value: String, harvest: String) {
    val largeText = LocalDensity.current.fontScale > 1.25f
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        if (maxWidth < 260.dp || largeText) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                UsageFact(label, value, Modifier.fillMaxWidth())
                UsageFact("安全採收期", harvest, Modifier.fillMaxWidth())
            }
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                UsageFact(label, value, Modifier.weight(1f))
                UsageFact("安全採收期", harvest, Modifier.weight(1f))
            }
        }
    }
}

@Composable private fun UsageFact(label: String, value: String, modifier: Modifier) {
    Surface(modifier, color = Color.Transparent) {
        Column(Modifier.padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            val numeric = value.any { it.isDigit() }
            Text(value, fontSize = if(numeric) 25.sp else 18.sp, lineHeight = if(numeric) 34.sp else 27.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable internal fun RegistrationTags(kind: String, moa: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if(kind.isNotBlank()) Surface(shape = RoundedCornerShape(6.dp), color = MaterialTheme.colorScheme.secondaryContainer, contentColor = MaterialTheme.colorScheme.onSecondaryContainer) {
            Text(kind, Modifier.padding(horizontal = 8.dp, vertical = 3.dp), fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
        if(moa.isNotBlank() && moa != "-") Surface(shape = RoundedCornerShape(6.dp), color = MaterialTheme.colorScheme.primaryContainer, contentColor = MaterialTheme.colorScheme.onPrimaryContainer) {
            Text(moa, Modifier.padding(horizontal = 8.dp, vertical = 3.dp), fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
    }
}

@Composable fun ResidueNotice(text: String) {
    Surface(Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.errorContainer, contentColor = MaterialTheme.colorScheme.onErrorContainer) {
        Text(text, Modifier.padding(12.dp), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
}
