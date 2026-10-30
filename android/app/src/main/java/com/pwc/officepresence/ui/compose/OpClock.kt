package com.pwc.officepresence.ui.compose

import android.app.TimePickerDialog
import android.view.HapticFeedbackConstants
import android.widget.Toast
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pwc.officepresence.data.DebugTrace
import com.pwc.officepresence.ui.theme.LocalOpPalette
import com.pwc.officepresence.ui.theme.OpColor
import com.pwc.officepresence.ui.theme.OpShape
import com.pwc.officepresence.ui.theme.OpType
import java.time.ZonedDateTime
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

fun parseHm(value: String): Pair<Int, Int> {
    val parsed = parseHmStrict(value)
    if (parsed != null) return parsed
    val parts = value.split(":")
    val h = parts.getOrNull(0)?.trim()?.toIntOrNull()?.coerceIn(0, 23) ?: 9
    val m = parts.getOrNull(1)?.trim()?.takeWhile { it.isDigit() }?.toIntOrNull()?.coerceIn(0, 59) ?: 0
    return h to m
}

fun formatHm(hour: Int, minute: Int): String = "%02d:%02d".format(hour, minute)

private fun prettyHm(value: String): String {
    val (h, m) = parseHm(value)
    val ap = if (h >= 12) "pm" else "am"
    val hr = if (h % 12 == 0) 12 else h % 12
    return "$hr:${"%02d".format(m)} $ap"
}

@Composable
fun ClockTimeField(
    label: String,
    value: String,
    onClick: () -> Unit,
) {
    val p = LocalOpPalette.current
    val (h, m) = parseHm(value)
    Column(Modifier.fillMaxWidth()) {
        Text(label, style = OpType.Meta, color = p.ink3)
        Spacer(Modifier.height(6.dp))
        Row(
            Modifier
                .fillMaxWidth()
                .clip(OpShape.Input)
                .background(p.surface)
                .border(1.dp, p.lineStrong, OpShape.Input)
                .clickable(onClick = onClick)
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ClockGlyph(h, m, Modifier.size(18.dp))
            Text(prettyHm(value), color = p.ink, style = OpType.Body)
        }
    }
}

@Composable
fun OpClockDialog(
    title: String,
    initialHm: String,
    confirmLabel: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
    previousHm: String? = null,
    blockFuture: Boolean = false,
) {
    val context = LocalContext.current
    DisposableEffect(title, initialHm, blockFuture) {
        val (hour, minute) = parseHm(initialHm)
        var finished = false
        val dialog = TimePickerDialog(
            context,
            { _, pickedHour, pickedMinute ->
                if (finished) return@TimePickerDialog
                val now = ZonedDateTime.now()
                val picked = pickedHour * 60 + pickedMinute
                val future = blockFuture && picked > now.hour * 60 + now.minute
                val selected = formatHm(pickedHour, pickedMinute)
                // #region agent log
                DebugTrace.write(
                    "H4",
                    "OpClock.kt:picker",
                    "system clock picker result",
                    mapOf(
                        "title" to title,
                        "initialHm" to initialHm,
                        "selectedHm" to selected,
                        "blockFuture" to blockFuture,
                        "previousHm" to previousHm,
                        "rejectedFuture" to future,
                    ),
                )
                // #endregion
                if (future) {
                    Toast.makeText(context, "Choose a time that is not later than now", Toast.LENGTH_SHORT).show()
                    finished = true
                    onDismiss()
                    return@TimePickerDialog
                }
                finished = true
                onConfirm(selected)
            },
            hour,
            minute,
            false,
        )
        dialog.setTitle(title)
        dialog.setOnCancelListener {
            if (!finished) {
                finished = true
                onDismiss()
            }
        }
        dialog.show()
        dialog.getButton(android.content.DialogInterface.BUTTON_POSITIVE)?.text = confirmLabel
        onDispose {
            dialog.setOnCancelListener(null)
            dialog.dismiss()
        }
    }
}

private fun deltaWords(fromMin: Int, toMin: Int): String {
    var d = toMin - fromMin
    if (d > 12 * 60) d -= 24 * 60
    if (d < -12 * 60) d += 24 * 60
    val abs = kotlin.math.abs(d)
    val h = abs / 60
    val m = abs % 60
    val bits = listOfNotNull(if (h > 0) "$h h" else null, if (m > 0) "$m m" else null).joinToString(" ")
    if (bits.isBlank() || d == 0) return "Same time"
    return if (d < 0) "$bits earlier" else "$bits later"
}

@Composable
private fun ClockGlyph(
    hour: Int,
    minute: Int,
    modifier: Modifier = Modifier,
    ghostHour: Int? = null,
    ghostMinute: Int? = null,
) {
    val ink = LocalOpPalette.current.ink
    val ghost = LocalOpPalette.current.ink3
    Canvas(modifier) {
        val c = Offset(size.width / 2f, size.height / 2f)
        val r = size.minDimension / 2f
        drawCircle(color = ink.copy(alpha = 0.35f), radius = r, center = c, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2f))
        if (ghostHour != null && ghostMinute != null) {
            val gh = Math.toRadians((((ghostHour % 12) + ghostMinute / 60f) * 30 - 90).toDouble())
            val gm = Math.toRadians((ghostMinute * 6 - 90).toDouble())
            drawLine(ghost, c, Offset(c.x + cos(gh).toFloat() * r * 0.45f, c.y + sin(gh).toFloat() * r * 0.45f), strokeWidth = 3f, cap = StrokeCap.Round)
            drawLine(ghost, c, Offset(c.x + cos(gm).toFloat() * r * 0.7f, c.y + sin(gm).toFloat() * r * 0.7f), strokeWidth = 2f, cap = StrokeCap.Round)
            var delta = minute - ghostMinute
            if (delta > 30) delta -= 60
            if (delta < -30) delta += 60
            if (delta != 0) {
                val start = ghostMinute * 6f - 90f
                drawArc(
                    color = OpColor.Accent.copy(alpha = 0.28f),
                    startAngle = if (delta > 0) start else start + delta * 6f,
                    sweepAngle = kotlin.math.abs(delta) * 6f,
                    useCenter = true,
                    topLeft = Offset(c.x - r * 0.72f, c.y - r * 0.72f),
                    size = androidx.compose.ui.geometry.Size(r * 1.44f, r * 1.44f),
                )
            }
        }
        val hourAngle = Math.toRadians((((hour % 12) + minute / 60f) * 30 - 90).toDouble())
        val minuteAngle = Math.toRadians((minute * 6 - 90).toDouble())
        drawLine(
            OpColor.Accent,
            c,
            Offset(c.x + cos(hourAngle).toFloat() * r * 0.45f, c.y + sin(hourAngle).toFloat() * r * 0.45f),
            strokeWidth = 4f,
            cap = StrokeCap.Round,
        )
        drawLine(
            OpColor.Accent,
            c,
            Offset(c.x + cos(minuteAngle).toFloat() * r * 0.7f, c.y + sin(minuteAngle).toFloat() * r * 0.7f),
            strokeWidth = 3f,
            cap = StrokeCap.Round,
        )
    }
}
