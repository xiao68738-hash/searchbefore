package tw.searchbefore.nativeapp

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Local, deterministic brand UI. No network fonts, analytics or new permissions. */
@Composable fun SearchBeforeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Color(0xFF2E6B3F), onPrimary = Color.White,
            primaryContainer = Color(0xFFE7EFE4), onPrimaryContainer = Color(0xFF183528),
            secondary = Color(0xFF52634F), onSecondary = Color.White,
            secondaryContainer = Color(0xFFFCEAD8), onSecondaryContainer = Color(0xFF85420F),
            background = Color(0xFFF5F2E9), onBackground = Color(0xFF183528),
            surface = Color.White, onSurface = Color(0xFF183528),
            surfaceContainerLowest = Color.White, surfaceContainerLow = Color(0xFFFAF9F4),
            surfaceContainer = Color(0xFFF5F2E9), surfaceContainerHigh = Color(0xFFEEF1E9),
            surfaceContainerHighest = Color.White, surfaceTint = Color(0xFF2E6B3F),
            surfaceVariant = Color(0xFFEEF1E9), onSurfaceVariant = Color(0xFF52634F),
            outline = Color(0xFF7B8578), outlineVariant = Color(0xFFDDD8CA),
            error = Color(0xFF9E3026), onError = Color.White,
            errorContainer = Color(0xFFFFEDE6), onErrorContainer = Color(0xFF75271F)
        ),
        shapes = Shapes(
            extraSmall = RoundedCornerShape(8.dp), small = RoundedCornerShape(12.dp),
            medium = RoundedCornerShape(18.dp), large = RoundedCornerShape(24.dp), extraLarge = RoundedCornerShape(28.dp)
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

@Composable fun BrandHeader(enabled: Boolean, migration: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Image(painterResource(R.drawable.native_logo), contentDescription = null, modifier = Modifier.size(42.dp))
        Column(Modifier.weight(1f)) {
            Text("噴前查", style = MaterialTheme.typography.titleLarge)
            Text(if (BuildConfig.DEBUG) "原生開發預覽" else "內部測試版", style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        TextButton(enabled = enabled, onClick = migration, contentPadding = PaddingValues(horizontal = 8.dp)) {
            Text("舊版資料移轉", style = MaterialTheme.typography.labelMedium)
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
            1 -> { drawRoundRect(ink, Offset(5*u,3*u), Size(14*u,19*u), androidx.compose.ui.geometry.CornerRadius(2*u), style=stroke)
                line(9f,2f,15f,2f); line(9f,9f,15f,9f); line(9f,13f,15f,13f); line(9f,17f,13f,17f) }
            2 -> { line(12f,22f,12f,12f)
                val leaf = Path().apply { moveTo(12*u,15*u); cubicTo(2*u,16*u,2*u,6*u,3*u,5*u); cubicTo(12*u,5*u,12*u,9*u,12*u,15*u)
                    moveTo(12*u,12*u); cubicTo(12*u,4*u,18*u,3*u,22*u,3*u); cubicTo(22*u,10*u,18*u,13*u,12*u,12*u) }
                drawPath(leaf,ink,style=stroke) }
            3 -> { line(5f,3f,19f,3f); line(9f,3f,9f,9f); line(15f,3f,15f,9f)
                val flask = Path().apply { moveTo(9*u,9*u); lineTo(3*u,20*u); lineTo(21*u,20*u); lineTo(15*u,9*u) }
                drawPath(flask,ink,style=stroke); line(7f,15f,17f,15f) }
            else -> { drawCircle(ink,4*u,Offset(12*u,6*u),style=stroke)
                drawArc(ink,180f,180f,false,Offset(4*u,13*u),Size(16*u,16*u),style=stroke) }
        }
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
        if (maxWidth < 320.dp || largeText) {
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
    Surface(modifier, shape = MaterialTheme.shapes.small, color = MaterialTheme.colorScheme.primaryContainer) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium)
            Text(value, style = MaterialTheme.typography.titleLarge)
        }
    }
}

@Composable fun ResidueNotice(text: String) {
    Surface(Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.errorContainer, contentColor = MaterialTheme.colorScheme.onErrorContainer) {
        Text(text, Modifier.padding(12.dp), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
}
