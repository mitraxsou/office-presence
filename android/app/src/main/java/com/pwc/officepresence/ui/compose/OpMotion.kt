// Office Presence motion. See frame Motion and docs/design/Office-Presence-motion.mp4.
// Every animation plays once. No loops except a spinner while a request is open.
package com.pwc.officepresence.ui.compose

import android.provider.Settings
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import com.pwc.officepresence.ui.theme.LocalOpPalette
import com.pwc.officepresence.ui.theme.OpColor
import com.pwc.officepresence.ui.theme.OpType
import kotlinx.coroutines.delay

object OpMotion {
    val Emphasized = CubicBezierEasing(0.2f, 0.7f, 0.2f, 1f)
    const val FAST = 150
    const val BASE = 300
    const val SLOW = 420
    const val STAGGER = 50
    val SoftSpring = spring<Float>(dampingRatio = 0.8f, stiffness = Spring.StiffnessMediumLow)
}

/** True when the user turned animations off (Developer options or accessibility). */
@Composable
fun reducedMotion(): Boolean {
    val ctx = LocalContext.current
    return remember {
        Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
}

/** Shared fade (+ light rise) used for status and content refresh. Reduced = fades only. */
@Composable
fun <T> OpContentFade(
    targetState: T,
    label: String = "content",
    content: @Composable (T) -> Unit,
) {
    val reduced = reducedMotion()
    AnimatedContent(
        targetState = targetState,
        transitionSpec = {
            if (reduced) {
                fadeIn(tween(OpMotion.FAST)) togetherWith fadeOut(tween(OpMotion.FAST))
            } else {
                (fadeIn(tween(OpMotion.BASE, easing = OpMotion.Emphasized)) +
                    slideInVertically(tween(OpMotion.BASE, easing = OpMotion.Emphasized)) { it / 6 }) togetherWith
                    fadeOut(tween(OpMotion.FAST))
            }
        },
        label = label,
    ) { state ->
        content(state)
    }
}

/** Status word: rises and fades when In or Out changes. Dot pops once. Light haptic. */
@Composable
fun AnimatedStatus(
    isIn: Boolean,
    word: @Composable (Boolean) -> Unit,
    dot: @Composable (Boolean) -> Unit,
) {
    val haptic = LocalHapticFeedback.current
    var first by remember { mutableStateOf(true) }
    LaunchedEffect(isIn) {
        if (!first) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        first = false
    }
    val reduced = reducedMotion()
    OpContentFade(targetState = isIn, label = "status") { inNow ->
        Row(
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            word(inNow)
            val s = remember { Animatable(if (reduced) 1f else 0.6f) }
            LaunchedEffect(inNow) {
                if (!reduced) {
                    s.snapTo(0.6f)
                    s.animateTo(1.25f, tween(250))
                    s.animateTo(1f, OpMotion.SoftSpring)
                }
            }
            Box(Modifier.scale(s.value)) { dot(inNow) }
        }
    }
}

/** Points number counts up from the last shown value over 600 ms. */
@Composable
fun CountUpText(value: Int, style: TextStyle = OpType.Number) {
    val reduced = reducedMotion()
    var shown by rememberSaveable { mutableIntStateOf(value) }
    val anim = remember { Animatable(shown.toFloat()) }
    LaunchedEffect(value) {
        if (reduced) {
            shown = value
            anim.snapTo(value.toFloat())
        } else {
            anim.animateTo(value.toFloat(), tween(600, easing = OpMotion.Emphasized))
            shown = value
        }
    }
    Text(anim.value.toInt().toString(), style = style, color = LocalOpPalette.current.ink)
}

/** "+N" chip that rises and fades once when new points arrive. */
@Composable
fun PointsGainedChip(gained: Int?) {
    if (gained == null || gained <= 0) return
    if (reducedMotion()) return
    val density = LocalDensity.current.density
    val y = remember(gained) { Animatable(8f) }
    val a = remember(gained) { Animatable(0f) }
    LaunchedEffect(gained) {
        delay(300)
        a.animateTo(1f, tween(200))
        y.animateTo(-14f, tween(900, easing = LinearOutSlowInEasing))
        a.animateTo(0f, tween(250))
    }
    Text(
        "+$gained",
        color = OpColor.OnAccent,
        modifier = Modifier
            .graphicsLayer {
                translationY = y.value * density
                alpha = a.value
            }
            .clip(CircleShape)
            .background(OpColor.Accent)
            .padding(horizontal = 10.dp, vertical = 2.dp),
    )
}

/** Bar fill with a small overshoot. */
@Composable
fun animatedFill(target: Float): Float {
    val reduced = reducedMotion()
    if (reduced) return target
    var started by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { started = true }
    val f by animateFloatAsState(
        if (started) target else 0f,
        spring(dampingRatio = 0.7f, stiffness = Spring.StiffnessLow),
        label = "fill",
    )
    return f
}

/** First-open stagger for cards on a tab. */
@Composable
fun StaggerIn(index: Int, play: Boolean, content: @Composable () -> Unit) {
    val visible = remember { MutableTransitionState(!play) }.apply { targetState = true }
    AnimatedVisibility(
        visibleState = visible,
        enter = fadeIn(tween(OpMotion.SLOW, delayMillis = index * OpMotion.STAGGER)) +
            slideInVertically(
                tween(OpMotion.SLOW, delayMillis = index * OpMotion.STAGGER, easing = OpMotion.Emphasized),
            ) { 24 },
    ) { content() }
}

/** Goal met: badge scales in once with a success haptic. */
@Composable
fun GoalMetEntrance(firstTimeThisMonth: Boolean, content: @Composable () -> Unit) {
    val haptic = LocalHapticFeedback.current
    val reduced = reducedMotion()
    val s = remember { Animatable(if (firstTimeThisMonth && !reduced) 0.6f else 1f) }
    LaunchedEffect(firstTimeThisMonth) {
        if (firstTimeThisMonth && !reduced) {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            s.animateTo(1.06f, tween(280))
            s.animateTo(1f, OpMotion.SoftSpring)
        }
    }
    Box(Modifier.scale(s.value)) { content() }
}
