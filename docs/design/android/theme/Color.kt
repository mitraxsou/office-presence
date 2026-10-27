// Merge into com.pwc.officepresence.ui.theme/Color.kt. Keep any existing names the app already uses
// and point them at these values instead of deleting them.
package com.pwc.officepresence.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

object OpColor {
    val Accent = Color(0xFFFD5108)       // primary action, days bar, wordmark, selected nav
    val AccentHover = Color(0xFFE04A07)  // pressed state on accent
    val AccentWash = Color(0x26FD5108)   // 15%: nav indicator, banners, pending
    val OnAccent = Color(0xFF1A1A1A)     // text and icons on accent and on Ok
    val Ok = Color(0xFF2ECC71)           // In dot and Goal met only
    val OkWash = Color(0x292ECC71)       // 16%: In badge fill
}

@Immutable
data class OpPalette(
    val bg: Color, val surface: Color, val sunk: Color,
    val line: Color, val lineStrong: Color,
    val ink: Color, val ink2: Color, val ink3: Color,
    val scrim: Color,
)

val OpLight = OpPalette(
    bg = Color(0xFFF4F4F4), surface = Color(0xFFFFFFFF), sunk = Color(0xFFECECEC),
    line = Color(0x1A1A1A1A), lineStrong = Color(0x2E1A1A1A),
    ink = Color(0xFF1A1A1A), ink2 = Color(0xFF5E5E5E), ink3 = Color(0xFF8C8C8C),
    scrim = Color(0x521A1A1A),
)

val OpDark = OpPalette(
    bg = Color(0xFF1A1A1A), surface = Color(0xFF2D2D2D), sunk = Color(0xFF242424),
    line = Color(0x1AFFFFFF), lineStrong = Color(0x2EFFFFFF),
    ink = Color(0xFFF4F4F4), ink2 = Color(0xFFB3B3B3), ink3 = Color(0xFF808080),
    scrim = Color(0x80000000),
)
