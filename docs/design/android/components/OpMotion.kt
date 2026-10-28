// Office Presence motion, Jetpack Compose reference. See frame "Motion" and Office-Presence-motion.mp4.
// Every animation plays once. No loops except a spinner while a request is open.
package com.pwc.officepresence.ui.components

import android.provider.Settings
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.dp
import com.pwc.officepresence.ui.theme.OpColor
import kotlinx.coroutines.delay

object OpMotion {
    val Emphasized = CubicBezierEasing(0.2f, 0.7f, 0.2f, 1f)
    const val FAST = 150
    const val BASE = 300
    const val SLOW = 420
    const val STAGGER = 50
    val Spring = spring<Float>(dampingRatio = 0.8f, stiffness = Spring.StiffnessMediumLow)
}

/** True when the user turned animations off (Developer options or accessibility "Remove animations"). */
@Composable
fun reducedMotion(): Boolean {
    val ctx = LocalContext.current
    return remember { Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
}

/** Status word: rises 8 dp and fades in when In or Out changes. Dot pops once. Light haptic on change. */
@Composable
fun AnimatedStatus(isIn: Boolean, word: @Composable (Boolean) -> Unit, dot: @Composable (Boolean) -> Unit) {
    val haptic = LocalHapticFeedback.current
    var first by remember { mutableStateOf(true) }
    LaunchedEffect(isIn) { if (!first) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove); first = false }
    val reduced = reducedMotion()
    AnimatedContent(
        targetState = isIn,
        transitionSpec = {
            if (reduced) fadeIn(tween(OpMotion.FAST)) togetherWith fadeOut(tween(OpMotion.FAST))
            else (fadeIn(tween(OpMotion.BASE, easing = OpMotion.Emphasized)) +
                slideInVertically(tween(OpMotion.BASE, easing = OpMotion.Emphasized)) { it / 6 }) togetherWith
                fadeOut(tween(OpMotion.FAST))
        }, label = "status",
    ) { inNow ->
        Row(verticalAlignment = androidx.compose.ui.Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            word(inNow)
            val s = remember { Animatable(if (reduced) 1f else 0.6f) }
            LaunchedEffect(inNow) { if (!reduced) { s.snapTo(0.6f); s.animateTo(1.25f, tween(250)); s.animateTo(1f, OpMotion.Spring) } }
            Box(Modifier.padding(bottom = 14.dp).scale(s.value)) { dot(inNow) }
        }
    }
}

/** Points number counts up from the last shown value to the new one over 600 ms. */
@Composable
fun CountUpText(value: Int, style: androidx.compose.ui.text.TextStyle = MaterialTheme.typography.displayMedium) {
    var shown by rememberSaveable { mutableIntStateOf(value) }
    val anim = remember { Animatable(shown.toFloat()) }
    LaunchedEffect(value) { anim.animateTo(value.toFloat(), tween(600, easing = OpMotion.Emphasized)); shown = value }
    Text(anim.value.toInt().toString(), style = style)
}

/** "+4" chip that rises and fades once when new points arrive. Call with the points just earned. */
@Composable
fun PointsGainedChip(gained: Int?) {
    if (gained == null || gained <= 0) return
    val y = remember(gained) { Animatable(8f) }
    val a = remember(gained) { Animatable(0f) }
    LaunchedEffect(gained) {
        delay(300); a.animateTo(1f, tween(200)); y.animateTo(-14f, tween(900, easing = LinearOutSlowInEasing)); a.animateTo(0f, tween(250))
    }
    Text("+$gained", color = OpColor.OnAccent, modifier = Modifier
        .graphicsLayer { translationY = y.value * density; alpha = a.value }
        .clip(CircleShape).background(OpColor.Accent).padding(horizontal = 10.dp, vertical = 2.dp))
}

/** Bar fill with a small overshoot. Replace the tween in DaysMeter with this spring. */
@Composable
fun animatedFill(target: Float): Float {
    var started by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { started = true }
    val f by animateFloatAsState(if (started) target else 0f, spring(dampingRatio = 0.7f, stiffness = Spring.StiffnessLow), label = "fill")
    return f
}

/** First-open stagger for cards on a tab. Wrap each card; index 0..4. Skip on later returns to the tab. */
@Composable
fun StaggerIn(index: Int, play: Boolean, content: @Composable () -> Unit) {
    val visible = remember { MutableTransitionState(!play) }.apply { targetState = true }
    AnimatedVisibility(
        visibleState = visible,
        enter = fadeIn(tween(OpMotion.SLOW, delayMillis = index * OpMotion.STAGGER)) +
            slideInVertically(tween(OpMotion.SLOW, delayMillis = index * OpMotion.STAGGER, easing = OpMotion.Emphasized)) { 24 },
    ) { content() }
}

/** Goal met: badge scales in once (first time this month only) with a success haptic. */
@Composable
fun GoalMetEntrance(firstTimeThisMonth: Boolean, content: @Composable () -> Unit) {
    val haptic = LocalHapticFeedback.current
    val s = remember { Animatable(if (firstTimeThisMonth) 0.6f else 1f) }
    LaunchedEffect(firstTimeThisMonth) {
        if (firstTimeThisMonth) { haptic.performHapticFeedback(HapticFeedbackType.LongPress); s.animateTo(1.06f, tween(280)); s.animateTo(1f, OpMotion.Spring) }
    }
    Box(Modifier.scale(s.value)) { content() }
}

/* Other motion, using platform pieces:
 * - Day detail: ModalBottomSheet (Material 3) already springs and supports drag to close. Scrim fades by default.
 * - Calendar day press: Modifier.clickable with an Indication, plus animateFloatAsState(if (pressed) 0.9f else 1f, tween(150)).
 * - Tabs: NavigationBar indicator animates by default; for content use AnimatedContent with fade + 8 dp slide (BASE).
 * - Sync: rotate the icon with rememberInfiniteTransition ONLY while syncing; stop when the request ends, then show "Up to date".
 * - Reduced motion: when reducedMotion() is true, use fades of FAST and skip scale, slide, count up and chips.
 */
