// Reference implementations of the shared components. Move into the app's ui/components package.
// Screens compose these; they should not restyle them.
package com.pwc.officepresence.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pwc.officepresence.ui.theme.OpColor
import com.pwc.officepresence.ui.theme.OpTheme

private val OpEase = CubicBezierEasing(0.2f, 0.7f, 0.2f, 1f)
private val Pill = RoundedCornerShape(999.dp)

/* ---------- Badges ---------- */

enum class OpBadge(val label: String) {
    In("In"), Out("Out"), GoalMet("Goal met"), NoRecentSync("No recent sync"),
    Pending("Pending review"), Approved("Approved"), NotApproved("Not approved"), Cancelled("Cancelled"),
}

@Composable
fun StatusBadge(kind: OpBadge, modifier: Modifier = Modifier, small: Boolean = true) {
    val p = OpTheme.palette
    val (bg, fg, dot) = when (kind) {
        OpBadge.In -> Triple(OpColor.OkWash, p.ink, OpColor.Ok)
        OpBadge.Out -> Triple(p.sunk, p.ink2, p.ink3)
        OpBadge.GoalMet -> Triple(OpColor.Ok, OpColor.OnAccent, null)
        OpBadge.NoRecentSync, OpBadge.Pending -> Triple(OpColor.AccentWash, p.ink, OpColor.Accent)
        OpBadge.Approved -> Triple(p.sunk, p.ink, null)
        OpBadge.NotApproved, OpBadge.Cancelled -> Triple(p.sunk, p.ink2, null)
    }
    Row(
        modifier.height(if (small) 24.dp else 28.dp).clip(Pill).background(bg).padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (dot != null) Box(Modifier.size(8.dp).clip(CircleShape).background(dot))
        if (kind == OpBadge.GoalMet || kind == OpBadge.Approved)
            Icon(Icons.Filled.Check, contentDescription = null, tint = fg, modifier = Modifier.size(14.dp))
        Text(kind.label, color = fg, fontSize = if (small) 12.sp else 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun FyiTag(text: String = "FYI") {
    val p = OpTheme.palette
    Text(
        text, style = MaterialTheme.typography.labelSmall, color = p.ink2,
        modifier = Modifier.border(1.dp, p.lineStrong, MaterialTheme.shapes.extraSmall).padding(horizontal = 6.dp, vertical = 1.dp),
    )
}

/* ---------- Status hero (Today) ---------- */

@Composable
fun StatusHero(isIn: Boolean, place: String, sinceText: String, modifier: Modifier = Modifier, note: String? = null) {
    val p = OpTheme.palette
    Column(modifier) {
        // Quiet status change: fade plus 6 dp rise, 320 ms. No loop.
        AnimatedContent(
            targetState = isIn,
            transitionSpec = {
                (fadeIn(tween(320, easing = OpEase)) + slideInVertically(tween(320, easing = OpEase)) { 18 }) togetherWith fadeOut(tween(160))
            },
            label = "status",
        ) { inNow ->
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(if (inNow) "In" else "Out", style = MaterialTheme.typography.displayLarge, color = p.ink)
                Box(Modifier.padding(bottom = 14.dp).size(16.dp).clip(CircleShape).background(if (inNow) OpColor.Ok else p.ink3))
            }
        }
        Spacer(Modifier.height(18.dp))
        Text(place, fontSize = 24.sp, fontWeight = FontWeight.SemiBold, color = p.ink)
        Text(sinceText, style = MaterialTheme.typography.bodyLarge, color = p.ink2, modifier = Modifier.padding(top = 4.dp))
        if (note != null) Text(note, style = MaterialTheme.typography.labelMedium, color = p.ink2)
    }
}

/* ---------- Days meter ---------- */

enum class MeterSize { Large, Medium }

@Composable
fun DaysMeter(
    days: Int, target: Int, modifier: Modifier = Modifier,
    size: MeterSize = MeterSize.Large, caption: String? = null,
) {
    val p = OpTheme.palette
    val met = days >= target
    val fraction = if (target <= 0) 0f else (days.toFloat() / target).coerceIn(0f, 1f)
    var started by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { started = true }
    // Fills once on first show, 900 ms. Recomposition with a new value animates from the old value.
    val fill by animateFloatAsState(if (started) fraction else 0f, tween(900, delayMillis = 120, easing = OpEase), label = "days")

    Column(modifier.semantics { contentDescription = "$days of $target days" + if (met) ", goal met" else ", ${target - days} to go" }) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.SpaceBetween) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text("$days", style = if (size == MeterSize.Large) MaterialTheme.typography.displayMedium else MaterialTheme.typography.displaySmall, color = p.ink)
                Text("/ $target days", fontSize = if (size == MeterSize.Large) 18.sp else 16.sp, fontWeight = FontWeight.Medium,
                    color = p.ink2, modifier = Modifier.padding(start = 6.dp, bottom = 4.dp))
            }
            if (met) StatusBadge(OpBadge.GoalMet, small = false)
            else Text("${target - days} to go", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = p.ink2, modifier = Modifier.padding(bottom = 6.dp))
        }
        Spacer(Modifier.height(14.dp))
        // One accent bar, always accent, even when the goal is met.
        Box(Modifier.fillMaxWidth().height(10.dp).clip(Pill).background(p.sunk).border(1.dp, p.line, Pill)) {
            Box(Modifier.fillMaxWidth(fill).fillMaxHeight().clip(Pill).background(OpColor.Accent))
        }
        if (caption != null) Text(caption, style = MaterialTheme.typography.labelMedium, color = p.ink2, modifier = Modifier.padding(top = 10.dp))
    }
}

/* ---------- Hours FYI row ---------- */

@Composable
fun HoursFyiRow(value: String, modifier: Modifier = Modifier, caption: String = "Suggested 5 h a day. Does not affect days.") {
    val p = OpTheme.palette
    Column(modifier) {
        HorizontalDivider(color = p.line)
        Row(Modifier.fillMaxWidth().padding(vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Hours today", style = MaterialTheme.typography.labelLarge, color = p.ink)
                    FyiTag()
                }
                Text(caption, style = MaterialTheme.typography.labelMedium, color = p.ink2)
            }
            // Never colored, never bold, never a bar.
            Text(value, fontSize = 17.sp, fontWeight = FontWeight.Medium, color = p.ink2, maxLines = 1)
        }
    }
}

/* ---------- Buttons ---------- */

@Composable
fun OpPrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, loading: Boolean = false) {
    Button(
        onClick = onClick, enabled = enabled && !loading, shape = Pill,
        modifier = modifier.heightIn(min = 48.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = OpColor.Accent, contentColor = OpColor.OnAccent,
            disabledContainerColor = OpColor.Accent.copy(alpha = 0.4f), disabledContentColor = OpColor.OnAccent.copy(alpha = 0.6f),
        ),
        elevation = null,
    ) {
        if (loading) { CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = OpColor.OnAccent); Spacer(Modifier.width(8.dp)) }
        Text(text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun OpSecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: ImageVector? = null) {
    val p = OpTheme.palette
    OutlinedButton(
        onClick = onClick, shape = Pill, modifier = modifier.heightIn(min = 36.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, p.lineStrong),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = p.surface, contentColor = p.ink),
    ) {
        if (icon != null) { Icon(icon, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)) }
        Text(text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

/* ---------- Bottom bar ---------- */

data class OpNavItem(val route: String, val label: String, val icon: ImageVector)

/** Today, Month, Colleagues, You. Pass icons from the app's icon set. */
@Composable
fun OpBottomBar(items: List<OpNavItem>, selectedRoute: String, onSelect: (OpNavItem) -> Unit) {
    val p = OpTheme.palette
    Column {
        HorizontalDivider(color = p.line)
        NavigationBar(containerColor = p.surface, tonalElevation = 0.dp) {
            items.forEach { item ->
                NavigationBarItem(
                    selected = item.route == selectedRoute,
                    onClick = { onSelect(item) },
                    icon = { Icon(item.icon, contentDescription = null) },
                    label = { Text(item.label, fontWeight = if (item.route == selectedRoute) FontWeight.Bold else FontWeight.Medium) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = OpColor.Accent, selectedTextColor = p.ink,
                        indicatorColor = OpColor.AccentWash,
                        unselectedIconColor = p.ink2, unselectedTextColor = p.ink2,
                    ),
                )
            }
        }
    }
}
