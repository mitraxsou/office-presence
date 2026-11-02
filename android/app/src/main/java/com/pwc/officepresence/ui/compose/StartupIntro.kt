package com.pwc.officepresence.ui.compose

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.ui.theme.LocalOpPalette
import kotlinx.coroutines.delay

/** One wordmark intro per process, skipped when Startup animation is off. */
object StartupGate {
    var shown: Boolean = false
}

@Composable
fun StartupOverlay(prefs: AppPrefs, content: @Composable () -> Unit) {
    val play = remember { prefs.startupAnimationEnabled && !StartupGate.shown }
    var show by remember { mutableStateOf(play) }
    var risen by remember { mutableStateOf(false) }
    LaunchedEffect(play) {
        if (!play) return@LaunchedEffect
        StartupGate.shown = true
        risen = true
        delay(1200)
        show = false
    }
    Box(Modifier.fillMaxSize()) {
        content()
        if (show) {
            val p = LocalOpPalette.current
            val alpha by animateFloatAsState(
                targetValue = if (risen) 1f else 0f,
                animationSpec = tween(320),
                label = "startup",
            )
            Box(
                Modifier
                    .fillMaxSize()
                    .background(p.bg)
                    .clickable { show = false },
                contentAlignment = Alignment.Center,
            ) {
                Wordmark(
                    Modifier.graphicsLayer {
                        this.alpha = alpha
                        translationY = (1f - alpha) * 18f
                    },
                )
            }
        }
    }
}
