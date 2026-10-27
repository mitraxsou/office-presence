// Merge into com.pwc.officepresence.ui.theme/Theme.kt.
// Important: dynamic color (Material You) stays OFF, or Android 12+ wallpaper colors replace the brand.
package com.pwc.officepresence.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

val LocalOpPalette = staticCompositionLocalOf { OpLight }

/** Access brand neutrals that Material 3 has no slot for: OpTheme.palette.ink2 etc. */
object OpTheme {
    val palette: OpPalette
        @Composable @ReadOnlyComposable get() = LocalOpPalette.current
}

// Replace FontFamily.Default with the bundled Helvetica Neue family if it is licensed for the app.
private val OpFont = FontFamily.Default

val OpTypography = Typography(
    displayLarge = TextStyle(fontFamily = OpFont, fontSize = 112.sp, lineHeight = 96.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.045).em),   // status word
    displayMedium = TextStyle(fontFamily = OpFont, fontSize = 56.sp, lineHeight = 56.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.03).em, fontFeatureSettings = "tnum"), // days number
    displaySmall = TextStyle(fontFamily = OpFont, fontSize = 44.sp, lineHeight = 44.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.03).em, fontFeatureSettings = "tnum"),
    headlineSmall = TextStyle(fontFamily = OpFont, fontSize = 28.sp, lineHeight = 32.sp, fontWeight = FontWeight.Bold),      // screen title
    titleLarge = TextStyle(fontFamily = OpFont, fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold),     // heading, office name uses 24
    bodyLarge = TextStyle(fontFamily = OpFont, fontSize = 16.sp, lineHeight = 23.sp),
    bodyMedium = TextStyle(fontFamily = OpFont, fontSize = 14.sp, lineHeight = 20.sp),
    labelLarge = TextStyle(fontFamily = OpFont, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium),
    labelMedium = TextStyle(fontFamily = OpFont, fontSize = 12.5.sp, lineHeight = 17.sp),                                   // meta
    labelSmall = TextStyle(fontFamily = OpFont, fontSize = 11.sp, lineHeight = 14.sp, fontWeight = FontWeight.SemiBold),    // FYI tag
)

val OpShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),   // FYI tag
    small = RoundedCornerShape(12.dp),       // inputs
    medium = RoundedCornerShape(16.dp),      // list cards, office card
    large = RoundedCornerShape(20.dp),       // main cards
    extraLarge = RoundedCornerShape(24.dp),  // bottom sheet
)

private fun scheme(p: OpPalette, dark: Boolean): ColorScheme {
    val base = if (dark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = OpColor.Accent, onPrimary = OpColor.OnAccent,
        primaryContainer = OpColor.AccentWash, onPrimaryContainer = p.ink,
        secondary = p.ink, onSecondary = p.bg,
        secondaryContainer = OpColor.AccentWash, onSecondaryContainer = p.ink, // NavigationBar indicator
        tertiary = OpColor.Ok, onTertiary = OpColor.OnAccent,
        background = p.bg, onBackground = p.ink,
        surface = p.surface, onSurface = p.ink,
        surfaceVariant = p.sunk, onSurfaceVariant = p.ink2,
        surfaceTint = Color.Transparent, // no tonal tint on elevated surfaces
        surfaceContainerLowest = p.surface, surfaceContainerLow = p.surface, surfaceContainer = p.surface,
        surfaceContainerHigh = p.surface, surfaceContainerHighest = p.sunk,
        outline = p.lineStrong, outlineVariant = p.line,
        // No red in this product: errors use the accent wash plus words.
        error = OpColor.Accent, onError = OpColor.OnAccent,
        errorContainer = OpColor.AccentWash, onErrorContainer = p.ink,
        scrim = p.scrim,
    )
}

@Composable
fun OfficePresenceTheme(
    darkTheme: Boolean = isSystemInDarkTheme(), // wire to the You > Theme setting (System, Light, Dark)
    content: @Composable () -> Unit,
) {
    val palette = if (darkTheme) OpDark else OpLight
    CompositionLocalProvider(LocalOpPalette provides palette) {
        MaterialTheme(
            colorScheme = scheme(palette, darkTheme),
            typography = OpTypography,
            shapes = OpShapes,
            content = content,
        )
    }
}
