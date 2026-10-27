// Office Presence theme (Compose). If the app uses XML views instead, see colors.xml.
package com.pwc.officepresence.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

val LocalOpPalette = staticCompositionLocalOf { OpLight }

object OpType {
    // Bundle Helvetica Neue if licensed; otherwise the system sans (Roboto) is the fallback.
    val Status = TextStyle(fontSize = 112.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.045).em, lineHeight = 96.sp)
    val Number = TextStyle(fontSize = 56.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.03).em)
    val Title = TextStyle(fontSize = 28.sp, fontWeight = FontWeight.Bold)
    val Heading = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
    val Body = TextStyle(fontSize = 16.sp)
    val Label = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium)
    val Meta = TextStyle(fontSize = 12.5.sp)
}

object OpShape {
    val Input = RoundedCornerShape(12.dp)
    val Card = RoundedCornerShape(20.dp)
    val Sheet = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
    val Pill = RoundedCornerShape(999.dp)
}

@Composable
fun OfficePresenceTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val p = if (dark) OpDark else OpLight
    val scheme = (if (dark) darkColorScheme() else lightColorScheme()).copy(
        primary = OpColor.Accent, onPrimary = OpColor.OnAccent,
        background = p.bg, surface = p.surface, onBackground = p.ink, onSurface = p.ink,
        surfaceVariant = p.sunk, outline = p.lineStrong, outlineVariant = p.line,
        secondaryContainer = OpColor.AccentWash, // bottom bar selected pill
    )
    CompositionLocalProvider(LocalOpPalette provides p) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
