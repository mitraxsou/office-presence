package com.pwc.officepresence.ui.compose

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.ui.theme.OpDark
import com.pwc.officepresence.ui.theme.OpLight
import com.pwc.officepresence.ui.theme.OpShape
import com.pwc.officepresence.ui.theme.OpType
import kotlinx.coroutines.delay

private val BannerBg = OpDark.bg
private val BannerInk = OpDark.ink
private val BannerInk2 = OpDark.ink2
private val EndBtnBg = OpLight.surface
private val EndBtnInk = OpLight.ink
private val AvatarBg = OpDark.surface

@Composable
fun ViewAsBanner(
    prefs: AppPrefs,
    onEnd: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!prefs.isViewAsActive) return
    var tick by remember { mutableIntStateOf(0) }
    LaunchedEffect(prefs.viewAsSessionId) {
        while (true) {
            delay(30_000)
            tick += 1
            if (!prefs.isViewAsActive) {
                onEnd()
                break
            }
        }
    }
    @Suppress("UNUSED_EXPRESSION")
    tick
    val mins = prefs.minutesLeftInViewAs()
    val modeLabel = if (prefs.isViewAsReadonly) "Read only" else "Test account"
    val name = prefs.viewAsTargetName.ifBlank { "user" }
    Row(
        modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(BannerBg)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(AvatarBg),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                OpFormat.initials(name),
                color = BannerInk,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(
                "Viewing as $name",
                color = BannerInk,
                style = OpType.Label.copy(fontWeight = FontWeight.Bold),
            )
            Text(
                "$modeLabel, $mins min left",
                color = BannerInk2,
                style = OpType.Meta,
            )
        }
        Text(
            "End",
            color = EndBtnInk,
            fontWeight = FontWeight.SemiBold,
            fontSize = 14.sp,
            modifier = Modifier
                .clip(OpShape.Pill)
                .background(EndBtnBg)
                .clickable(onClick = onEnd)
                .padding(horizontal = 16.dp, vertical = 8.dp),
        )
    }
}
