package com.pwc.officepresence.ui.compose

import android.text.format.DateFormat
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.ui.draw.alpha
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TimeInput
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.ui.theme.LocalOpPalette
import com.pwc.officepresence.ui.theme.OpColor
import com.pwc.officepresence.ui.theme.OpShape
import com.pwc.officepresence.ui.theme.OpType
import org.json.JSONObject
import kotlin.concurrent.thread

private val DAY_LETTERS = listOf("M", "T", "W", "T", "F", "S", "S")
private val DAY_NAMES = listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
private val START_PICKS = listOf("20:00", "21:00", "22:00", "23:00")
private val END_PICKS = listOf("06:00", "07:00", "08:00", "09:00")

@Composable
fun QuietHoursScreen(
    repo: PresenceRepository,
    prefs: AppPrefs,
    onBack: () -> Unit,
) {
    val p = LocalOpPalette.current
    val readonly = prefs.isViewAsReadonly
    var enabled by remember { mutableStateOf(prefs.quietHoursEnabled) }
    var start by remember { mutableStateOf(shownStart(prefs)) }
    var end by remember { mutableStateOf(shownEnd(prefs)) }
    var days by remember { mutableStateOf(normalizeDays(prefs.quietHoursDays)) }
    var custom by remember { mutableStateOf(prefs.quietHoursCustomDays.ifBlank { "1,2,3,4,5" }) }
    var alertTracking by remember { mutableStateOf(prefs.quietAlertTracking) }
    var alertCorrections by remember { mutableStateOf(prefs.quietAlertCorrections) }
    var picking by remember { mutableStateOf<String?>(null) }

    fun persist(
        nextEnabled: Boolean = enabled,
        nextStart: String = start,
        nextEnd: String = end,
        nextDays: String = days,
        nextCustom: String = custom,
        nextTracking: Boolean = alertTracking,
        nextCorrections: Boolean = alertCorrections,
    ) {
        prefs.quietHoursStartKept = nextStart
        prefs.quietHoursEndKept = nextEnd
        prefs.quietHoursDays = nextDays
        prefs.quietHoursCustomDays = nextCustom
        prefs.quietAlertTracking = nextTracking
        prefs.quietAlertCorrections = nextCorrections
        if (nextEnabled) {
            prefs.quietHoursStart = nextStart
            prefs.quietHoursEnd = nextEnd
        } else {
            prefs.quietHoursStart = ""
            prefs.quietHoursEnd = ""
        }
        val body = JSONObject()
            .put("quietHoursStart", if (nextEnabled) nextStart else JSONObject.NULL)
            .put("quietHoursEnd", if (nextEnabled) nextEnd else JSONObject.NULL)
            .put("quietHoursDays", nextDays)
            .put("quietHoursCustomDays", nextCustom)
            .put("quietAlertTracking", nextTracking)
            .put("quietAlertCorrections", nextCorrections)
        thread { runCatching { repo.api.patchNotificationPrefs(body) } }
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back", tint = p.ink)
            }
            Text("Quiet hours", style = OpType.Title, color = p.ink)
        }
        Text(
            "Notifications arrive silently during these hours. They still show in the app.",
            style = OpType.Body,
            color = p.ink2,
            modifier = Modifier.padding(top = 8.dp, bottom = 16.dp),
        )
        OpCard {
            QuietSwitchRow(
                title = "Use quiet hours",
                checked = enabled,
                enabled = !readonly,
                onCheckedChange = { on ->
                    enabled = on
                    if (on) {
                        if (start.isBlank()) start = "21:00"
                        if (end.isBlank()) end = "08:00"
                    }
                    persist(nextEnabled = on)
                },
            )
        }
        Spacer(Modifier.height(20.dp))
        Text("Time", style = OpType.Meta, color = p.ink3, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Column(Modifier.alpha(if (enabled) 1f else 0.4f)) {
            OpCard {
                SettingsRow(
                    title = "Start",
                    value = OpFormat.formatClockHm(start),
                    onClick = if (enabled && !readonly) ({ picking = "start" }) else null,
                )
                DividerLine()
                val endLabel = buildString {
                    append(OpFormat.formatClockHm(end))
                    if (OpFormat.quietEndIsNextDay(start, end)) append(", next day")
                }
                SettingsRow(
                    title = "End",
                    value = endLabel,
                    onClick = if (enabled && !readonly) ({ picking = "end" }) else null,
                )
            }
        }
        Spacer(Modifier.height(20.dp))
        Text("Days", style = OpType.Meta, color = p.ink3, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Column(Modifier.alpha(if (enabled) 1f else 0.4f)) {
            OpCard {
                DayModeRow(
                    days = days,
                    enabled = enabled && !readonly,
                    onSelect = { mode ->
                        if (mode == "custom" && days != "custom") {
                            custom = if (days == "weekdays") "1,2,3,4,5" else "1,2,3,4,5,6,7"
                        }
                        days = mode
                        persist(nextDays = mode, nextCustom = custom)
                    },
                )
                Spacer(Modifier.height(14.dp))
                DayCircleRow(
                    selected = shownDays(days, custom),
                    enabled = enabled && !readonly && days == "custom",
                    onToggle = { day ->
                        val set = customDays(custom).toMutableSet()
                        if (day in set) {
                            if (set.size <= 1) return@DayCircleRow
                            set.remove(day)
                        } else {
                            set.add(day)
                        }
                        custom = set.sorted().joinToString(",")
                        persist(nextCustom = custom)
                    },
                )
            }
        }
        Spacer(Modifier.height(20.dp))
        Text("Still alert me for", style = OpType.Meta, color = p.ink3, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Column(Modifier.alpha(if (enabled) 1f else 0.4f)) {
            OpCard {
                QuietSwitchRow(
                    title = "Tracking problems",
                    subtitle = "So missed days are caught early",
                    recommended = true,
                    checked = alertTracking,
                    enabled = enabled && !readonly,
                    onCheckedChange = {
                        alertTracking = it
                        persist(nextTracking = it)
                    },
                )
                DividerLine()
                QuietSwitchRow(
                    title = "Correction decisions",
                    checked = alertCorrections,
                    enabled = enabled && !readonly,
                    onCheckedChange = {
                        alertCorrections = it
                        persist(nextCorrections = it)
                    },
                )
            }
        }
        Text(
            OpFormat.quietFooter(start, end, days, custom),
            style = OpType.Meta,
            color = p.ink2,
            modifier = Modifier.padding(top = 16.dp),
        )
    }

    val which = picking
    if (which != null) {
        QuietTimeSheet(
            title = if (which == "start") "Start time" else "End time",
            confirmLabel = if (which == "start") "Set start time" else "Set end time",
            initialHm = if (which == "start") start else end,
            picks = if (which == "start") START_PICKS else END_PICKS,
            onDismiss = { picking = null },
            onConfirm = { hm ->
                if (which == "start") start = hm else end = hm
                picking = null
                persist(
                    nextStart = if (which == "start") hm else start,
                    nextEnd = if (which == "end") hm else end,
                )
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun QuietTimeSheet(
    title: String,
    confirmLabel: String,
    initialHm: String,
    picks: List<String>,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    val p = LocalOpPalette.current
    val ctx = LocalContext.current
    val is24 = DateFormat.is24HourFormat(ctx)
    var seedHm by remember { mutableStateOf(initialHm) }
    var seedKey by remember { mutableIntStateOf(0) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = p.surface,
        shape = OpShape.Sheet,
    ) {
        key(seedKey) {
            val (hour, minute) = splitHm(seedHm)
            val state = rememberTimePickerState(initialHour = hour, initialMinute = minute, is24Hour = is24)
            Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
                Text(title, style = OpType.Heading, color = p.ink)
                Spacer(Modifier.height(12.dp))
                TimeInput(state = state)
                Spacer(Modifier.height(16.dp))
                Text("Quick picks", style = OpType.Meta, color = p.ink3, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    picks.forEach { pick ->
                        val (ph, pm) = splitHm(pick)
                        val selected = state.hour == ph && state.minute == pm
                        Text(
                            OpFormat.formatClockHm(pick),
                            color = if (selected) p.bg else p.ink,
                            style = OpType.Label,
                            modifier = Modifier
                                .clip(OpShape.Pill)
                                .background(if (selected) p.ink else p.surface)
                                .border(1.dp, if (selected) p.ink else p.line, OpShape.Pill)
                                .clickable {
                                    seedHm = pick
                                    seedKey++
                                }
                                .padding(horizontal = 14.dp, vertical = 8.dp),
                        )
                    }
                }
                Spacer(Modifier.height(20.dp))
                Row(Modifier.fillMaxWidth()) {
                    OpSecondaryButton(
                        label = "Cancel",
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(10.dp))
                    OpPrimaryButton(
                        label = confirmLabel,
                        onClick = { onConfirm("%02d:%02d".format(state.hour, state.minute)) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun DayModeRow(
    days: String,
    enabled: Boolean,
    onSelect: (String) -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf("all" to "Every day", "weekdays" to "Weekdays", "custom" to "Custom").forEach { (id, label) ->
            val selected = days == id
            val p = LocalOpPalette.current
            Text(
                label,
                color = if (selected) p.bg else p.ink,
                style = OpType.Label,
                modifier = Modifier
                    .clip(OpShape.Pill)
                    .background(if (selected) p.ink else p.surface)
                    .border(1.dp, if (selected) p.ink else p.line, OpShape.Pill)
                    .clickable(enabled = enabled) { onSelect(id) }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
            )
        }
    }
}

@Composable
private fun DayCircleRow(
    selected: Set<Int>,
    enabled: Boolean,
    onToggle: (Int) -> Unit,
) {
    val p = LocalOpPalette.current
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        DAY_LETTERS.forEachIndexed { index, letter ->
            val day = index + 1
            val on = day in selected
            Text(
                letter,
                color = if (on) p.bg else p.ink2,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(if (on) p.ink else p.surface)
                    .border(1.dp, if (on) p.ink else p.line, CircleShape)
                    .clickable(enabled = enabled, onClickLabel = DAY_NAMES[index]) { onToggle(day) }
                    .semantics {
                        role = Role.Switch
                        contentDescription = DAY_NAMES[index]
                    }
                    .padding(top = 8.dp),
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun QuietSwitchRow(
    title: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    subtitle: String? = null,
    recommended: Boolean = false,
) {
    val p = LocalOpPalette.current
    Row(
        Modifier.fillMaxWidth().padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            FlowRow(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, style = OpType.Label.copy(fontWeight = FontWeight.SemiBold), color = p.ink)
                if (recommended) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "Recommended",
                        fontSize = 11.sp,
                        color = p.ink2,
                        maxLines = 1,
                        modifier = Modifier
                            .clip(OpShape.Pill)
                            .background(p.sunk)
                            .padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
            }
            if (!subtitle.isNullOrBlank()) {
                Text(subtitle, style = OpType.Meta, color = p.ink2, modifier = Modifier.padding(top = 2.dp))
            }
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            enabled = enabled,
            colors = SwitchDefaults.colors(
                checkedThumbColor = p.surface,
                checkedTrackColor = OpColor.Accent,
                uncheckedThumbColor = p.surface,
                uncheckedTrackColor = p.ink3,
                disabledCheckedTrackColor = OpColor.Accent.copy(alpha = 0.35f),
                disabledUncheckedTrackColor = p.ink3.copy(alpha = 0.4f),
            ),
        )
    }
}

private fun shownStart(prefs: AppPrefs): String =
    prefs.quietHoursStart.ifBlank { prefs.quietHoursStartKept.ifBlank { "21:00" } }

private fun shownEnd(prefs: AppPrefs): String =
    prefs.quietHoursEnd.ifBlank { prefs.quietHoursEndKept.ifBlank { "08:00" } }

private fun normalizeDays(raw: String): String = if (raw == "weekdays" || raw == "custom") raw else "all"

private fun customDays(raw: String): Set<Int> =
    raw.split(",").mapNotNull { it.trim().toIntOrNull() }.filter { it in 1..7 }.toSet()

private fun shownDays(days: String, custom: String): Set<Int> = when (days) {
    "weekdays" -> setOf(1, 2, 3, 4, 5)
    "custom" -> customDays(custom).ifEmpty { setOf(1, 2, 3, 4, 5) }
    else -> setOf(1, 2, 3, 4, 5, 6, 7)
}

private fun splitHm(hm: String): Pair<Int, Int> {
    val parts = hm.split(":")
    val h = parts.getOrNull(0)?.toIntOrNull()?.coerceIn(0, 23) ?: 21
    val m = parts.getOrNull(1)?.toIntOrNull()?.coerceIn(0, 59) ?: 0
    return h to m
}
