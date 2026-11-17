package com.pwc.officepresence.ui.compose

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pwc.officepresence.ui.PointsFormat
import com.pwc.officepresence.ui.theme.LocalOpPalette
import com.pwc.officepresence.ui.theme.OpColor
import com.pwc.officepresence.ui.theme.OpShape
import com.pwc.officepresence.ui.theme.OpType
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.YearMonth

data class LeaveRecord(val dayKey: String, val kind: String, val note: String?, val source: String)

data class ExceptionRecord(
    val dayKey: String,
    val points: Int,
    val officeName: String,
    val homeOffice: Boolean,
    val reason: String,
    val grantedBy: String?,
    val grantedAt: String?,
)

/** Holidays, leave and HR exception days for one month. Records only, except exceptions which count. */
data class MonthRecords(
    val holidays: Map<String, String> = emptyMap(),
    val leave: Map<String, LeaveRecord> = emptyMap(),
    val exceptions: Map<String, ExceptionRecord> = emptyMap(),
    val allowSelfLeave: Boolean = false,
) {
    val isEmpty get() = holidays.isEmpty() && leave.isEmpty() && exceptions.isEmpty()

    companion object {
        private fun JSONObject.str(key: String): String? =
            if (isNull(key)) null else optString(key).takeIf { it.isNotBlank() && it != "null" }

        private fun JSONArray?.objects(): List<JSONObject> =
            if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

        /** Fields missing on an older server give empty records. Never throws. */
        fun parse(report: JSONObject?): MonthRecords {
            if (report == null) return MonthRecords()
            return runCatching {
                MonthRecords(
                    holidays = report.optJSONArray("holidays").objects()
                        .mapNotNull { o -> o.str("dayKey")?.let { it to (o.str("name") ?: "Holiday") } }
                        .toMap(),
                    leave = report.optJSONArray("leaveDays").objects().mapNotNull { o ->
                        val day = o.str("dayKey") ?: return@mapNotNull null
                        day to LeaveRecord(day, o.str("kind") ?: "leave", o.str("note"), o.str("source") ?: "self")
                    }.toMap(),
                    exceptions = report.optJSONArray("exceptionDays").objects().mapNotNull { o ->
                        val day = o.str("dayKey") ?: return@mapNotNull null
                        day to ExceptionRecord(
                            dayKey = day,
                            points = o.optInt("points", 0).coerceAtLeast(0),
                            officeName = o.str("officeName") ?: "Office",
                            homeOffice = o.optBoolean("homeOffice", false),
                            reason = o.str("reason") ?: "",
                            grantedBy = o.str("grantedBy"),
                            grantedAt = o.str("grantedAt"),
                        )
                    }.toMap(),
                    allowSelfLeave = report.optBoolean("allowSelfLeave", false),
                )
            }.getOrDefault(MonthRecords())
        }

        fun parseToday(holidaysJson: String, leaveJson: String, todayKey: String): Pair<String?, LeaveRecord?> {
            val holidays = runCatching { parse(JSONObject().put("holidays", JSONArray(holidaysJson))).holidays }
                .getOrDefault(emptyMap())
            val leave = runCatching { parse(JSONObject().put("leaveDays", JSONArray(leaveJson))).leave }
                .getOrDefault(emptyMap())
            return holidays[todayKey] to leave[todayKey]
        }
    }
}

object MonthLeaveRules {
    fun leaveLabel(kind: String) = if (kind == "other_duty") "Other duty" else "Leave"

    fun includesExceptions(n: Int): String? =
        if (n <= 0) null else "Includes $n HR exception ${if (n == 1) "day" else "days"}"

    /** Server checks the same rules and the month lock. */
    fun canMarkLeave(
        dayKey: String,
        records: MonthRecords,
        hasVisit: Boolean,
        currentMonth: String,
        readonly: Boolean,
    ): Boolean {
        if (!records.allowSelfLeave || readonly || hasVisit) return false
        if (dayKey in records.holidays || dayKey in records.exceptions) return false
        val leave = records.leave[dayKey]
        if (leave != null && leave.source != "self") return false
        val date = runCatching { LocalDate.parse(dayKey) }.getOrNull() ?: return false
        if (date.dayOfWeek.value > 5) return false
        val month = dayKey.take(7)
        val current = runCatching { YearMonth.parse(currentMonth) }.getOrNull() ?: return false
        return month == current.toString() || month == current.minusMonths(1).toString()
    }

    fun exceptionOffice(e: ExceptionRecord) = if (e.homeOffice) "${e.officeName} home office" else e.officeName
}

enum class DayMark { Exception, Holiday, Leave }

fun MonthRecords.markFor(dayKey: String): DayMark? = when {
    dayKey in exceptions -> DayMark.Exception
    dayKey in holidays -> DayMark.Holiday
    dayKey in leave -> DayMark.Leave
    else -> null
}

/** Drawn behind the day number when the day has no visit chip. */
@Composable
fun DayMarkBackdrop(mark: DayMark) {
    val p = LocalOpPalette.current
    val ink2 = p.ink2
    val accent = OpColor.Accent
    when (mark) {
        DayMark.Exception -> Box(
            Modifier.size(36.dp).clip(CircleShape).background(OpColor.AccentWash).border(2.dp, accent, CircleShape),
        )
        DayMark.Holiday -> Box(Modifier.size(36.dp).clip(CircleShape).background(p.sunk))
        DayMark.Leave -> Canvas(Modifier.size(36.dp)) {
            drawRoundRect(
                color = ink2,
                style = Stroke(width = 1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 5f))),
                cornerRadius = CornerRadius(size.minDimension / 2),
            )
        }
    }
}

@Composable
fun MonthRecordsLegend(records: MonthRecords) {
    if (records.isEmpty) return
    Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        if (records.exceptions.isNotEmpty()) LegendItem(DayMark.Exception, "HR exception")
        if (records.holidays.isNotEmpty()) LegendItem(DayMark.Holiday, "Holiday (info)")
        if (records.leave.isNotEmpty()) LegendItem(DayMark.Leave, "Leave (info)")
    }
}

@Composable
private fun LegendItem(mark: DayMark, label: String) {
    val p = LocalOpPalette.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(12.dp), contentAlignment = Alignment.Center) {
            when (mark) {
                DayMark.Exception -> Box(
                    Modifier.size(12.dp).clip(CircleShape).background(OpColor.AccentWash).border(1.5.dp, OpColor.Accent, CircleShape),
                )
                DayMark.Holiday -> Box(Modifier.size(12.dp).clip(CircleShape).background(p.sunk))
                DayMark.Leave -> Box(Modifier.size(12.dp).clip(CircleShape).border(1.dp, p.ink2, CircleShape))
            }
        }
        Spacer(Modifier.width(6.dp))
        Text(label, style = OpType.Meta, color = p.ink3)
    }
}

/** Frame 1.6. Information only; tracking keeps running. */
@Composable
fun TodayRecordNotice(holiday: String?, leave: LeaveRecord?, target: Int) {
    if (holiday == null && leave == null) return
    val p = LocalOpPalette.current
    val title = when {
        holiday != null -> "Holiday: $holiday"
        leave?.kind == "other_duty" -> "On other duty today"
        else -> "On leave today"
    }
    val body = if (holiday != null) {
        "Your target stays ${target.coerceAtLeast(1)} points."
    } else {
        "Your target stays ${target.coerceAtLeast(1)} points. If you come in, the visit still counts."
    }
    OpCard {
        Text(title, style = OpType.Label.copy(fontWeight = FontWeight.SemiBold), color = p.ink)
        Text(body, style = OpType.Meta, color = p.ink2, modifier = Modifier.padding(top = 4.dp))
    }
    Spacer(Modifier.height(12.dp))
}

/** Read only. Frame 1.5 b. */
@Composable
fun ExceptionDayDetail(dayKey: String, e: ExceptionRecord, tz: String) {
    val p = LocalOpPalette.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 28.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(OpFormat.fmtDayTitle(dayKey), style = OpType.Heading, color = p.ink, modifier = Modifier.weight(1f))
            NeutralBadge("HR exception")
        }
        Spacer(Modifier.height(12.dp))
        Text(
            "HR exception. ${PointsFormat.countsAs(e.points)} (${MonthLeaveRules.exceptionOffice(e)}).",
            style = OpType.Body,
            color = p.ink2,
        )
        Spacer(Modifier.height(12.dp))
        KeyValue("Counts as", if (e.points == 1) "1 point" else "${e.points} points")
        KeyValue("Office", if (e.homeOffice) "${e.officeName}, home office" else e.officeName)
        if (e.reason.isNotBlank()) KeyValue("Reason", e.reason)
        val granted = listOfNotNull(e.grantedBy, e.grantedAt?.let { OpFormat.fmtShortDate(it, tz) })
            .filter { it.isNotBlank() }
            .joinToString(", ")
        if (granted.isNotBlank()) KeyValue("Granted by", granted)
        Text("Ask HR to change it.", style = OpType.Meta, color = p.ink3, modifier = Modifier.padding(top = 12.dp))
    }
}

@Composable
private fun KeyValue(key: String, value: String) {
    val p = LocalOpPalette.current
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(key, style = OpType.Meta, color = p.ink2)
        Spacer(Modifier.width(12.dp))
        Text(value, style = OpType.Label.copy(fontWeight = FontWeight.SemiBold), color = p.ink)
    }
    DividerLine()
}

/** Holiday and leave lines plus the leave action for a day without a visit. Frame 1.5 c. */
@Composable
fun LeaveSection(
    holiday: String?,
    leave: LeaveRecord?,
    canMark: Boolean,
    target: Int,
    busy: Boolean,
    error: String?,
    onSave: (kind: String, note: String) -> Unit,
    onRemove: () -> Unit,
) {
    val p = LocalOpPalette.current
    var editing by remember { mutableStateOf(false) }
    var kind by remember { mutableStateOf(leave?.kind ?: "leave") }
    var note by remember { mutableStateOf(leave?.note ?: "") }
    val keepNote = "Leave is recorded for your records. Your target stays $target points."
    Column(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
        if (holiday != null) {
            Text("Holiday: $holiday. Info only.", style = OpType.Body, color = p.ink2)
            Spacer(Modifier.height(8.dp))
        }
        if (leave != null && !editing) {
            NeutralBadge(MonthLeaveRules.leaveLabel(leave.kind))
            leave.note?.let { Text(it, style = OpType.Body, color = p.ink2, modifier = Modifier.padding(top = 6.dp)) }
            Text(
                (if (leave.source == "self") "Marked by you. " else "Marked by an admin. ") + keepNote,
                style = OpType.Meta,
                color = p.ink3,
                modifier = Modifier.padding(top = 6.dp),
            )
            Spacer(Modifier.height(12.dp))
            if (canMark) OpSecondaryButton("Remove leave", onClick = onRemove, enabled = !busy)
        } else if (canMark && editing) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("leave" to "Leave", "other_duty" to "Other duty").forEach { (k, label) ->
                    val on = kind == k
                    Text(
                        label,
                        style = OpType.Label.copy(fontWeight = FontWeight.SemiBold),
                        color = if (on) p.surface else p.ink,
                        modifier = Modifier
                            .clip(OpShape.Pill)
                            .background(if (on) p.ink else p.sunk)
                            .clickable { kind = k }
                            .padding(horizontal = 14.dp, vertical = 8.dp),
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            TextField(
                value = note,
                onValueChange = { note = it.take(200) },
                label = { Text("Note (optional)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = p.sunk,
                    unfocusedContainerColor = p.sunk,
                    focusedIndicatorColor = p.ink,
                    unfocusedIndicatorColor = p.line,
                ),
            )
            Text(keepNote, style = OpType.Meta, color = p.ink3, modifier = Modifier.padding(top = 8.dp))
            Spacer(Modifier.height(12.dp))
            OpPrimaryButton("Save leave", onClick = { onSave(kind, note) }, loading = busy, enabled = !busy)
            Spacer(Modifier.height(8.dp))
            OpSecondaryButton("Cancel", onClick = { editing = false }, enabled = !busy)
        } else if (canMark) {
            Text(keepNote, style = OpType.Meta, color = p.ink3)
            Spacer(Modifier.height(10.dp))
            OpSecondaryButton("Mark as leave", onClick = { editing = true })
        }
        if (error != null) Text(error, style = OpType.Meta, color = p.ink2, modifier = Modifier.padding(top = 8.dp))
    }
}
