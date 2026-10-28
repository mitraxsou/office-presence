package com.pwc.officepresence.ui.compose

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pwc.officepresence.ui.theme.LocalOpPalette
import com.pwc.officepresence.ui.theme.OfficePresenceTheme
import com.pwc.officepresence.ui.theme.OpColor
import com.pwc.officepresence.ui.theme.OpLight
import com.pwc.officepresence.ui.theme.OpShape
import com.pwc.officepresence.ui.theme.OpType

private val OpEase = CubicBezierEasing(0.2f, 0.7f, 0.2f, 1f)

@Composable
fun OpCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val p = LocalOpPalette.current
    Column(
        modifier
            .fillMaxWidth()
            .clip(OpShape.Card)
            .background(p.surface)
            .border(1.dp, p.line, OpShape.Card)
            .padding(16.dp),
    ) { content() }
}

@Composable
fun OpPrimaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier.fillMaxWidth(),
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        colors = ButtonDefaults.buttonColors(
            containerColor = OpColor.Accent,
            contentColor = OpColor.OnAccent,
            disabledContainerColor = OpColor.Accent.copy(alpha = 0.35f),
            disabledContentColor = LocalOpPalette.current.ink3,
        ),
        shape = OpShape.Pill,
        modifier = modifier.height(48.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                color = OpColor.OnAccent,
                strokeWidth = 2.dp,
            )
            Spacer(Modifier.width(10.dp))
        }
        Text(label, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun OpSecondaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier.fillMaxWidth(),
    enabled: Boolean = true,
    leadingIcon: ImageVector? = null,
) {
    val p = LocalOpPalette.current
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        border = BorderStroke(1.dp, p.lineStrong),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = p.ink),
        shape = OpShape.Pill,
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
        modifier = modifier.height(48.dp),
    ) {
        if (leadingIcon != null) {
            Icon(
                leadingIcon,
                contentDescription = null,
                tint = if (enabled) p.ink else p.ink3,
                modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.width(8.dp))
        }
        Text(label, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
fun OpGhostLink(label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Text(
        label,
        color = LocalOpPalette.current.ink,
        style = OpType.Label,
        fontWeight = FontWeight.SemiBold,
        textDecoration = TextDecoration.Underline,
        // Accent underline: Compose uses text color for underline; keep ink text + accent feel via OpColor.Accent.
        modifier = modifier
            .clickable(onClick = onClick)
            .padding(8.dp),
    )
}

@Composable
fun Wordmark(modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(16.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(OpColor.Accent),
        )
        Spacer(Modifier.width(8.dp))
        Text(
            "Office Presence",
            style = OpType.Heading.copy(fontSize = 15.sp),
            color = LocalOpPalette.current.ink,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun StatusHero(
    inOffice: Boolean,
    officeName: String?,
    forSinceLabel: String?,
    lastInOffice: String? = null,
    updatedLabel: String? = null,
    fenceRadiusMeters: Int = 100,
) {
    val p = LocalOpPalette.current
    Column(Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
        AnimatedStatus(
            isIn = inOffice,
            word = { inNow ->
                Text(
                    if (inNow) "In" else "Out",
                    style = OpType.Status.copy(
                        platformStyle = PlatformTextStyle(includeFontPadding = false),
                    ),
                    color = p.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            },
            dot = { inNow ->
                Box(
                    Modifier
                        .size(16.dp)
                        .clip(CircleShape)
                        .background(if (inNow) OpColor.Ok else p.ink3),
                )
            },
        )
        Text(
            if (inOffice) officeName?.takeIf { it.isNotBlank() } ?: "Office" else "Not at an office",
            style = OpType.Heading.copy(fontSize = 24.sp),
            color = p.ink,
            modifier = Modifier.padding(top = 18.dp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (!forSinceLabel.isNullOrBlank()) {
            Text(
                forSinceLabel,
                style = OpType.Body,
                color = p.ink2,
                modifier = Modifier.padding(top = 4.dp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (inOffice) {
            if (!updatedLabel.isNullOrBlank()) {
                Text(
                    updatedLabel,
                    style = OpType.Meta,
                    color = p.ink2,
                    modifier = Modifier.padding(top = 2.dp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        } else {
            // Frame 13: "Last In at Gurugram, Tower B. Updated 1 min ago"
            val last = lastInOffice?.takeIf { it.isNotBlank() }?.let { "Last In at $it" }
            val meta = listOfNotNull(last, updatedLabel?.takeIf { it.isNotBlank() }).joinToString(". ")
            if (meta.isNotBlank()) {
                Text(
                    meta,
                    style = OpType.Meta,
                    color = p.ink3,
                    modifier = Modifier.padding(top = 4.dp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        OfficeAreaDiagram(
            inOffice = inOffice,
            radiusMeters = fenceRadiusMeters,
            modifier = Modifier
                .padding(top = 20.dp)
                .fillMaxWidth(),
        )
    }
}

/**
 * Simple drawing of the office fence with you inside or outside.
 * Explains how detection works; no real map or coordinates.
 */
@Composable
fun OfficeAreaDiagram(
    inOffice: Boolean,
    radiusMeters: Int = 100,
    modifier: Modifier = Modifier,
) {
    val p = LocalOpPalette.current
    val density = LocalDensity.current
    val measurer = rememberTextMeasurer()
    val radiusLabel = "$radiusMeters m"
    val youLabel = "You"
    val labelStyle = TextStyle(
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        color = p.ink,
        platformStyle = PlatformTextStyle(includeFontPadding = false),
    )
    val youStyle = TextStyle(
        fontSize = 11.sp,
        fontWeight = FontWeight.Medium,
        color = p.ink2,
        platformStyle = PlatformTextStyle(includeFontPadding = false),
    )
    val radiusLayout = measurer.measure(radiusLabel, labelStyle)
    val youLayout = measurer.measure(youLabel, youStyle)
    val dash = with(density) { floatArrayOf(6.dp.toPx(), 5.dp.toPx()) }
    val strokeW = with(density) { 1.5.dp.toPx() }
    val youR = with(density) { 7.dp.toPx() }
    val gridStep = with(density) { 18.dp.toPx() }
    val youGap = with(density) { 3.dp.toPx() }
    val labelGap = with(density) { 8.dp.toPx() }

    Box(
        modifier
            .aspectRatio(1.55f)
            .clip(OpShape.Card)
            .background(p.sunk)
            .border(1.dp, p.line, OpShape.Card),
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            val cx = w * 0.52f
            val cy = h * 0.48f
            val r = minOf(w, h) * 0.36f

            // Soft grid (no real map).
            var x = 0f
            while (x <= w) {
                drawLine(p.line, Offset(x, 0f), Offset(x, h), strokeWidth = 1f)
                x += gridStep
            }
            var y = 0f
            while (y <= h) {
                drawLine(p.line, Offset(0f, y), Offset(w, y), strokeWidth = 1f)
                y += gridStep
            }

            if (inOffice) {
                drawCircle(color = OpColor.OkWash, radius = r, center = Offset(cx, cy))
            }

            drawCircle(
                color = p.ink3,
                radius = r,
                center = Offset(cx, cy),
                style = Stroke(
                    width = strokeW,
                    pathEffect = PathEffect.dashPathEffect(dash, 0f),
                ),
            )

            // Building silhouette at the fence centre.
            val bw = r * 0.42f
            val bh = r * 0.52f
            val left = cx - bw / 2f
            val top = cy - bh / 2f
            val building = Path().apply {
                moveTo(left, top + bh)
                lineTo(left, top + bh * 0.22f)
                lineTo(left + bw * 0.18f, top)
                lineTo(left + bw * 0.82f, top)
                lineTo(left + bw, top + bh * 0.22f)
                lineTo(left + bw, top + bh)
                close()
            }
            drawPath(building, p.ink)
            val win = bw * 0.14f
            val gap = bw * 0.1f
            for (col in 0..2) {
                for (row in 0..1) {
                    val wx = left + bw * 0.18f + col * (win + gap)
                    val wy = top + bh * 0.32f + row * (win + gap * 0.8f)
                    drawRect(p.sunk, Offset(wx, wy), Size(win, win))
                }
            }

            // "You" marker: inside when In, outside when Out.
            val you = if (inOffice) {
                Offset(cx - r * 0.38f, cy + r * 0.42f)
            } else {
                Offset(cx - r * 1.15f, cy + r * 0.72f)
            }
            drawCircle(
                color = if (inOffice) OpColor.Ok else p.ink3,
                radius = youR,
                center = you,
            )
            drawText(
                textLayoutResult = youLayout,
                topLeft = Offset(
                    you.x - youLayout.size.width / 2f,
                    you.y + youR + youGap,
                ),
            )

            // Radius label on the right of the dashed ring.
            drawText(
                textLayoutResult = radiusLayout,
                topLeft = Offset(
                    cx + r + labelGap,
                    cy - radiusLayout.size.height / 2f,
                ),
            )
        }
    }
}

/** Dark toast used for view-as ended and similar one-shot notices. */
@Composable
fun OpNoticeBanner(message: String, modifier: Modifier = Modifier) {
    // Always dark fill + light ink so the notice reads on light and dark themes.
    val fg = OpLight.bg
    Row(
        modifier
            .fillMaxWidth()
            .clip(OpShape.Card)
            .background(OpColor.OnAccent)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(Icons.Outlined.Check, contentDescription = null, tint = fg, modifier = Modifier.size(18.dp))
        Text(message, color = fg, style = OpType.Meta, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun DaysMeter(
    current: Int,
    target: Int,
    monthLabel: String? = null,
    footer: String? = null,
    compact: Boolean = false,
) {
    val p = LocalOpPalette.current
    val t = target.coerceAtLeast(1)
    val c = current.coerceAtLeast(0)
    val met = c >= t
    val side = if (met) "Goal met" else "${(t - c).coerceAtLeast(0)} to go"
    val pct = (c.toFloat() / t.toFloat()).coerceIn(0f, 1f)
    val animated = animatedFill(pct)
    Column(Modifier.fillMaxWidth()) {
        if (!monthLabel.isNullOrBlank()) {
            Text(monthLabel, style = OpType.Meta, color = p.ink3, modifier = Modifier.padding(bottom = 6.dp))
        }
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom,
        ) {
            Row(verticalAlignment = Alignment.Bottom) {
                CountUpText(
                    value = c,
                    style = if (compact) OpType.Number.copy(fontSize = 40.sp) else OpType.Number,
                )
                Text(
                    " / $t points",
                    style = OpType.Body.copy(fontWeight = FontWeight.Medium),
                    color = p.ink2,
                    modifier = Modifier.padding(bottom = 10.dp, start = 4.dp),
                )
            }
            if (met) {
                GoalMetBadge()
            } else {
                Text(side, color = p.ink2, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, modifier = Modifier.padding(bottom = 6.dp))
            }
        }
        Spacer(Modifier.height(10.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .height(10.dp)
                .clip(OpShape.Pill)
                .background(p.sunk),
        ) {
            Box(
                Modifier
                    .fillMaxWidth(animated)
                    .height(10.dp)
                    .clip(OpShape.Pill)
                    .background(OpColor.Accent),
            )
        }
        if (!footer.isNullOrBlank()) {
            Text(footer, style = OpType.Meta, color = p.ink3, modifier = Modifier.padding(top = 10.dp))
        }
    }
}

@Composable
fun HoursFyiRow(hours: Double, advised: Double) {
    val p = LocalOpPalette.current
    Column(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.line))
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column(Modifier.weight(1f)) {
                Text("Hours today", style = OpType.Label, color = p.ink)
                Text(
                    "Suggested ${advised.toInt()} h a day. Does not affect points.",
                    style = OpType.Meta,
                    color = p.ink3,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            Text(
                OpFormat.durationHm(hours),
                style = OpType.Body.copy(fontWeight = FontWeight.Medium),
                color = p.ink2,
            )
        }
    }
}

@Composable
fun MonthSummaryCard(
    monthLabel: String,
    current: Int,
    target: Int,
    hoursToday: Double,
    advised: Double,
    showHours: Boolean = true,
    footer: String? = null,
) {
    OpCard {
        DaysMeter(current, target, monthLabel = monthLabel, footer = footer)
        if (showHours) HoursFyiRow(hoursToday, advised)
    }
}

/** Compact month progress under Today card. Tappable to open Month (SPEC §21). */
@Composable
fun CompactMonthProgress(
    current: Int,
    target: Int,
    visitDays: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = LocalOpPalette.current
    val t = target.coerceAtLeast(1)
    val c = current.coerceAtLeast(0)
    val pct = (c.toFloat() / t.toFloat()).coerceIn(0f, 1f)
    val animated by animateFloatAsState(pct, tween(900), label = "compactMonth")
    Column(
        modifier
            .fillMaxWidth()
            .clip(OpShape.Card)
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "$c / $t points",
                style = OpType.Label.copy(fontWeight = FontWeight.SemiBold),
                color = p.ink,
            )
            Text(
                com.pwc.officepresence.ui.PointsFormat.visitDaysFyi(visitDays),
                style = OpType.Meta,
                color = p.ink3,
            )
        }
        Spacer(Modifier.height(8.dp))
        Box(
            Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(OpShape.Pill)
                .background(p.sunk),
        ) {
            Box(
                Modifier
                    .fillMaxWidth(animated)
                    .height(8.dp)
                    .clip(OpShape.Pill)
                    .background(OpColor.Accent),
            )
        }
    }
}

@Composable
fun AvatarCircle(name: String, size: Dp = 40.dp, wash: Boolean = false) {
    val p = LocalOpPalette.current
    Box(
        Modifier
            .size(size)
            .clip(CircleShape)
            .background(if (wash) OpColor.AccentWash else p.sunk),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            OpFormat.initials(name),
            color = if (wash) OpColor.Accent else p.ink2,
            fontWeight = FontWeight.Bold,
            fontSize = (size.value * 0.32f).sp,
        )
    }
}

@Composable
fun StatusBadge(inOffice: Boolean) {
    val p = LocalOpPalette.current
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .heightIn(min = 24.dp)
            .clip(OpShape.Pill)
            .background(if (inOffice) OpColor.OkWash else p.sunk)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(if (inOffice) OpColor.Ok else p.ink3),
        )
        // Green only on the dot / wash. Text stays ink (never color-only status).
        Text(
            if (inOffice) "In" else "Out",
            color = if (inOffice) p.ink else p.ink2,
            fontWeight = FontWeight.SemiBold,
            fontSize = 12.sp,
        )
    }
}

@Composable
fun GoalMetBadge() {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier
            .heightIn(min = 28.dp)
            .clip(OpShape.Pill)
            .background(OpColor.Ok)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Icon(Icons.Outlined.Check, contentDescription = null, tint = OpColor.OnAccent, modifier = Modifier.size(14.dp))
        Text("Goal met", color = OpColor.OnAccent, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
    }
}

@Composable
fun PendingBadge() {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier
            .heightIn(min = 24.dp)
            .clip(OpShape.Pill)
            .background(OpColor.AccentWash)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(OpColor.Accent))
        Text("Pending review", color = LocalOpPalette.current.ink, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
    }
}

@Composable
fun NeutralBadge(label: String, check: Boolean = false) {
    val p = LocalOpPalette.current
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .clip(OpShape.Pill)
            .background(p.sunk)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        if (check) {
            Icon(Icons.Outlined.Check, contentDescription = null, tint = p.ink2, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(4.dp))
        }
        Text(label, color = p.ink2, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
    }
}

@Composable
fun CorrectedTag() {
    Text(
        "Corrected",
        color = OpColor.Accent,
        fontWeight = FontWeight.SemiBold,
        fontSize = 12.sp,
        modifier = Modifier
            .border(1.dp, OpColor.Accent, OpShape.Pill)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
fun ColleagueRow(name: String, office: String?, since: String?, inOffice: Boolean) {
    val p = LocalOpPalette.current
    Row(
        Modifier.fillMaxWidth().padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarCircle(name)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(name, style = OpType.Label.copy(fontWeight = FontWeight.SemiBold), color = p.ink)
            if (!office.isNullOrBlank()) {
                Text(office, style = OpType.Meta, color = p.ink2)
            }
            if (!since.isNullOrBlank()) {
                Text(
                    if (inOffice) "In since $since" else since,
                    style = OpType.Meta,
                    color = p.ink2,
                )
            }
        }
        StatusBadge(inOffice)
    }
}

@Composable
fun SkeletonBar(modifier: Modifier = Modifier, height: Dp = 14.dp) {
    val p = LocalOpPalette.current
    Box(modifier.height(height).clip(OpShape.Pill).background(p.sunk))
}

@Composable
fun SettingsRow(
    title: String,
    value: String? = null,
    onClick: (() -> Unit)? = null,
    trailing: @Composable (() -> Unit)? = null,
) {
    val p = LocalOpPalette.current
    Row(
        Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = OpType.Body, color = p.ink, modifier = Modifier.weight(1f))
        if (trailing != null) {
            trailing()
        } else if (!value.isNullOrBlank()) {
            Text(value, style = OpType.Label, color = p.ink2)
            if (onClick != null) {
                Text("  >", color = p.ink3)
            }
        } else if (onClick != null) {
            Text(">", color = p.ink3)
        }
    }
}

@Composable
fun DividerLine() {
    Box(
        Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(LocalOpPalette.current.line),
    )
}

data class OfficeVisitSeg(
    val officeName: String,
    /** Minutes from local midnight. */
    val startMin: Int,
    val endMin: Int,
)

/** 8 am to 8 pm timeline bars (SPEC 13). Neutral tones only. */
@Composable
fun DayOfficeTimeline(
    segs: List<OfficeVisitSeg>,
    modifier: Modifier = Modifier,
) {
    if (segs.isEmpty()) return
    val p = LocalOpPalette.current
    val tones = listOf(p.ink, p.ink3, p.ink2)
    val officeOrder = segs.map { it.officeName }.distinct()
    var winStart = 8 * 60
    var winEnd = 20 * 60
    segs.forEach {
        if (it.startMin < winStart) winStart = (it.startMin / 60) * 60
        if (it.endMin > winEnd) winEnd = ((it.endMin + 59) / 60) * 60
    }
    if (winEnd <= winStart) winEnd = winStart + 60
    val span = (winEnd - winStart).coerceAtLeast(1).toFloat()
    val labels = listOf(winStart, winStart + span.toInt() / 4, winStart + span.toInt() / 2, winStart + 3 * span.toInt() / 4, winEnd)
        .distinct()
        .map { m ->
            val h = (m / 60) % 24
            when {
                h == 0 -> "12 am"
                h < 12 -> "$h am"
                h == 12 -> "12 pm"
                else -> "${h - 12} pm"
            }
        }
    Column(modifier.fillMaxWidth()) {
        BoxWithConstraints(
            Modifier
                .fillMaxWidth()
                .height(28.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(p.sunk),
        ) {
            val w = maxWidth
            segs.forEach { seg ->
                val tone = tones[officeOrder.indexOf(seg.officeName).coerceIn(0, tones.lastIndex)]
                val leftF = ((seg.startMin - winStart) / span).coerceIn(0f, 1f)
                val rightF = ((seg.endMin - winStart) / span).coerceIn(0f, 1f)
                val barW = ((rightF - leftF).coerceAtLeast(0.01f) * w.value).dp
                Box(
                    Modifier
                        .padding(start = (leftF * w.value).dp)
                        .width(barW)
                        .height(28.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(tone),
                )
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            labels.forEach { label ->
                Text(label, style = OpType.Meta.copy(fontSize = 11.sp), color = p.ink3)
            }
        }
    }
}

data class TodayOfficeRow(
    val name: String,
    val rangeLabel: String,
    val durationLabel: String,
)

/** "Today, N offices" card (frame 11). */
@Composable
fun TodayOfficesCard(
    offices: List<TodayOfficeRow>,
    hoursTodayLabel: String,
    modifier: Modifier = Modifier,
) {
    if (offices.size < 2) return
    val p = LocalOpPalette.current
    OpCard(modifier.fillMaxWidth()) {
        Text(
            "Today, ${offices.size} offices",
            style = OpType.Meta.copy(fontWeight = FontWeight.SemiBold),
            color = p.ink2,
        )
        offices.forEachIndexed { i, row ->
            if (i > 0) DividerLine()
            Row(
                Modifier.fillMaxWidth().padding(vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(Modifier.weight(1f).padding(end = 12.dp)) {
                    Text(row.name, style = OpType.Body, color = p.ink)
                    Text(row.rangeLabel, style = OpType.Meta, color = p.ink3)
                }
                Text(row.durationLabel, style = OpType.Meta, color = p.ink2)
            }
        }
        DividerLine()
        Row(
            Modifier.fillMaxWidth().padding(vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("Hours today", style = OpType.Label.copy(fontWeight = FontWeight.SemiBold), color = p.ink)
            Text(hoursTodayLabel, style = OpType.Meta.copy(fontWeight = FontWeight.SemiBold), color = p.ink2)
        }
    }
}

@Preview(name = "Components light", showBackground = true, backgroundColor = 0xFFF4F4F4)
@Composable
private fun OpComponentsPreviewLight() {
    OfficePresenceTheme(dark = false) {
        OpComponentsPreviewBody()
    }
}

@Preview(name = "Components dark", showBackground = true, backgroundColor = 0xFF1A1A1A, uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES)
@Composable
private fun OpComponentsPreviewDark() {
    OfficePresenceTheme(dark = true) {
        OpComponentsPreviewBody()
    }
}

@Preview(name = "Components font 1.3", showBackground = true, fontScale = 1.3f)
@Composable
private fun OpComponentsPreviewFontScale() {
    OfficePresenceTheme(dark = false) {
        OpComponentsPreviewBody()
    }
}

@Composable
private fun OpComponentsPreviewBody() {
    val p = LocalOpPalette.current
    Column(
        Modifier
            .background(p.bg)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Wordmark()
        StatusHero(
            inOffice = true,
            officeName = "Gurugram, Tower B",
            forSinceLabel = "For 2 h 32 m, since 9:42 am",
            updatedLabel = "Updated 1 min ago",
        )
        MonthSummaryCard(
            monthLabel = "October",
            current = 5,
            target = 8,
            hoursToday = 2.5,
            advised = 5.0,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatusBadge(true)
            StatusBadge(false)
            GoalMetBadge()
            PendingBadge()
        }
        ColleagueRow("Asha Rao", "Bengaluru", "9:15 am", true)
        OpPrimaryButton("Send code", onClick = {})
        OpSecondaryButton("Check now", onClick = {})
        OpGhostLink("Request a correction", onClick = {})
    }
}
