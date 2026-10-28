package com.pwc.officepresence.ui.compose

import android.os.Handler
import android.os.Looper
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.Office
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.data.ok
import com.pwc.officepresence.ui.PointsFormat
import com.pwc.officepresence.ui.theme.LocalOpPalette
import com.pwc.officepresence.ui.theme.OpColor
import com.pwc.officepresence.ui.theme.OpShape
import com.pwc.officepresence.ui.theme.OpType
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.concurrent.thread

private data class DayInfo(
    val dayKey: String,
    val points: Int,
    val officeName: String?,
    val hours: Double,
    val intervals: List<JSONObject>,
    val firstIn: String?,
    val lastOut: String?,
    val corrected: Boolean = false,
)

private data class PendingCorrection(
    val id: String,
    val dayKey: String,
    val issue: String,
    val status: String,
    val recorded: JSONObject?,
    val requested: JSONObject?,
    val createdAt: String?,
    val decidedAt: String?,
    val decisionNote: String?,
)

private enum class CorrectionStep { Choose, Edit, Review, Sent }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MonthScreen(
    repo: PresenceRepository,
    prefs: AppPrefs,
    onOpenRequests: () -> Unit = {},
    initialMonthKey: String? = null,
    onInitialMonthConsumed: () -> Unit = {},
) {
    val p = LocalOpPalette.current
    val main = remember { Handler(Looper.getMainLooper()) }
    var monthKey by remember { mutableStateOf(initialMonthKey ?: YearMonth.now().toString()) }
    var requestedMonth by remember { mutableStateOf(initialMonthKey ?: YearMonth.now().toString()) }
    var report by remember { mutableStateOf<JSONObject?>(null) }
    var err by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var selectedDay by remember { mutableStateOf<String?>(null) }
    var corrections by remember { mutableStateOf<List<PendingCorrection>>(emptyList()) }
    var offices by remember { mutableStateOf(prefs.offices()) }
    var correcting by remember { mutableStateOf(false) }
    var correctionDay by remember { mutableStateOf<String?>(null) }
    var reportEpoch by remember { mutableIntStateOf(0) }

    fun reload(month: String? = monthKey) {
        val targetMonth = month ?: monthKey
        requestedMonth = targetMonth
        monthKey = targetMonth
        selectedDay = null
        err = null
        // Offices come from prefs (filled by Today/sync); skip a third network hop.
        offices = prefs.offices()
        val cached = prefs.cachedReportJson(targetMonth)
        val dirty = prefs.isMonthDirty(targetMonth)
        val syncedToday = repo.syncedToday()
        val currentMonth = targetMonth == YearMonth.now().toString()
        // Paint from disk immediately (Year-style); network refreshes in the background.
        if (cached != null) {
            report = cached
            loading = false
        } else {
            loading = true
        }
        // Current month after a sync today with no dirty flag: skip the reports round-trip.
        val skipNetwork = cached != null && currentMonth && syncedToday && !dirty
        if (!skipNetwork) {
            thread {
                val res = runCatching { repo.api.reports(targetMonth) }.getOrNull()
                main.post {
                    if (requestedMonth != targetMonth) return@post
                    if (res?.ok() == true) {
                        val hadVisible = report != null && report?.optString("month") == targetMonth
                        report = res
                        monthKey = res.optString("month", targetMonth)
                        prefs.storeReportJson(targetMonth, res.toString())
                        prefs.storeReportFetchedAt(targetMonth, System.currentTimeMillis())
                        prefs.clearMonthDirty(targetMonth)
                        loading = false
                        err = null
                        // Soft fade only when replacing already-shown cache (not first paint).
                        if (hadVisible) reportEpoch += 1
                    } else if (report == null || report?.optString("month") != targetMonth) {
                        err = res?.optString("error") ?: "Could not load"
                        loading = false
                    } else {
                        loading = false
                    }
                }
            }
        }
        thread {
            val corr = runCatching { repo.api.listCorrections(targetMonth) }.getOrNull()
            val pending = parseCorrections(corr)
            main.post {
                if (requestedMonth != targetMonth) return@post
                corrections = pending
            }
        }
    }

    LaunchedEffect(initialMonthKey) {
        val target = initialMonthKey ?: YearMonth.now().toString()
        if (repo.shouldRefreshOnOpen()) {
            thread { repo.refreshIfNeeded() }
        }
        reload(target)
        if (initialMonthKey != null) onInitialMonthConsumed()
    }

    if (correcting && correctionDay != null) {
        CorrectionFlow(
            dayKey = correctionDay!!,
            prefs = prefs,
            offices = offices,
            dayInfo = dayMap(report)[correctionDay],
            repo = repo,
            onClose = { correcting = false; correctionDay = null },
            onSent = {
                correcting = false
                correctionDay = null
                reload(monthKey)
                onOpenRequests()
            },
            onBackToMonth = {
                correcting = false
                correctionDay = null
                reload(monthKey)
            },
        )
        return
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = {
                reload(YearMonth.parse(monthKey).minusMonths(1).toString())
            }) {
                Icon(Icons.AutoMirrored.Outlined.KeyboardArrowLeft, contentDescription = "Previous month", tint = p.ink)
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(OpFormat.fmtMonthTitle(monthKey), style = OpType.Heading, color = p.ink)
                Text(
                    OpFormat.updatedAgo(prefs.lastSyncAtMs),
                    style = OpType.Meta,
                    color = p.ink3,
                )
            }
            val current = report?.optString("currentMonth")?.takeIf { it.isNotBlank() }
                ?: YearMonth.now().toString()
            IconButton(
                onClick = {
                    if (monthKey < current) {
                        reload(YearMonth.parse(monthKey).plusMonths(1).toString())
                    }
                },
                enabled = monthKey < current,
            ) {
                Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = "Next month", tint = if (monthKey < current) p.ink else p.ink3)
            }
        }
        Spacer(Modifier.height(12.dp))
        val reportMatches = report?.optString("month").orEmpty() == monthKey
        when {
            reportMatches && report != null -> {
                // Pair epoch with the report so outgoing fade keeps the previous snapshot.
                OpContentFade(
                    targetState = reportEpoch to report!!,
                    label = "monthReport",
                ) { (_, data) ->
                    val points = data.optInt("monthPoints")
                    val target = data.optInt("pointsTarget").coerceAtLeast(1)
                    val visitDays = data.optInt("monthVisitDays")
                    val days = dayMap(data)
                    val hasDoubleDay = days.values.any { it.points >= 2 }
                    val mk = data.optString("month", monthKey)
                    val pendingCount = corrections.count { it.status == "pending" && it.dayKey.startsWith(mk) }
                    val correctedCount = corrections.count { it.status == "approved" && it.dayKey.startsWith(mk) }
                    val footer = buildString {
                        append(PointsFormat.visitDaysFyi(visitDays))
                        if (pendingCount > 0) append(". $pendingCount day${if (pendingCount == 1) "" else "s"} pending review")
                        if (correctedCount > 0) append(". $correctedCount corrected")
                        append(".")
                    }
                    Column {
                        OpCard {
                            DaysMeter(points, target, footer = footer)
                        }
                        Spacer(Modifier.height(16.dp))
                        OpCard {
                            CalendarGrid(
                                monthKey = mk,
                                days = days,
                                pendingDays = corrections.filter { it.status == "pending" }.map { it.dayKey }.toSet(),
                                todayKey = LocalDate.now().toString(),
                                selectedDay = selectedDay,
                                onSelect = { selectedDay = it },
                            )
                            Spacer(Modifier.height(12.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(Modifier.size(10.dp).clip(CircleShape).background(OpColor.Accent))
                                    Spacer(Modifier.width(6.dp))
                                    Text("Visit day", style = OpType.Meta, color = p.ink3)
                                }
                                if (hasDoubleDay) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            "4+",
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = p.ink2,
                                            modifier = Modifier
                                                .clip(CircleShape)
                                                .background(p.sunk)
                                                .padding(horizontal = 6.dp, vertical = 2.dp),
                                        )
                                        Spacer(Modifier.width(6.dp))
                                        Text("Higher points day", style = OpType.Meta, color = p.ink3)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            loading || !reportMatches -> {
                Text("Loading month...", color = p.ink3, style = OpType.Body)
            }
            err != null -> Text(err!!, color = p.ink2)
        }
    }

    val day = selectedDay
    if (day != null && report != null && report?.optString("month").orEmpty() == monthKey) {
        val info = dayMap(report)[day]
        val pending = corrections.firstOrNull { it.dayKey == day && it.status == "pending" }
        val decided = corrections.firstOrNull { it.dayKey == day && it.status in setOf("approved", "rejected") }
        val approvedToast = if (decided?.status == "approved") {
            val pts = report?.optInt("monthPoints") ?: 0
            val tgt = report?.optInt("pointsTarget") ?: 8
            val mon = OpFormat.fmtMonthShort(monthKey)
            "Your correction for ${day.takeLast(2).toInt()} ${mon.take(3)} was approved. $mon is now $pts / $tgt points."
        } else {
            null
        }
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { selectedDay = null },
            sheetState = sheetState,
            containerColor = p.surface,
            shape = OpShape.Sheet,
        ) {
            DayDetailSheet(
                dayKey = day,
                info = info,
                pending = pending,
                decided = decided,
                approvedToast = approvedToast,
                tz = prefs.timezone,
                gapMinutes = prefs.gapMinutes,
                readonly = prefs.isViewAsReadonly,
                readonlyName = prefs.viewAsTargetName,
                onRequestCorrection = {
                    selectedDay = null
                    correctionDay = day
                    correcting = true
                },
                onCancelRequest = { id ->
                    thread {
                        repo.api.cancelCorrection(id)
                        main.post {
                            selectedDay = null
                            reload(monthKey)
                        }
                    }
                },
                onRequestAgain = {
                    selectedDay = null
                    correctionDay = day
                    correcting = true
                },
            )
        }
    }
}

@Composable
private fun DayStat(label: String, value: String) {
    val p = LocalOpPalette.current
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = OpType.Meta, color = p.ink3)
        Text(
            value,
            style = OpType.Label.copy(fontWeight = FontWeight.SemiBold),
            color = p.ink,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

@Composable
private fun DayDetailSheet(
    dayKey: String,
    info: DayInfo?,
    pending: PendingCorrection?,
    decided: PendingCorrection?,
    approvedToast: String? = null,
    tz: String,
    gapMinutes: Int,
    readonly: Boolean = false,
    readonlyName: String = "",
    onRequestCorrection: () -> Unit,
    onRequestAgain: () -> Unit,
    onCancelRequest: (String) -> Unit,
) {
    val p = LocalOpPalette.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 28.dp)) {
        if (approvedToast != null) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(OpShape.Card)
                    .background(p.ink)
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Outlined.Check, contentDescription = null, tint = p.surface, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(approvedToast, color = p.surface, style = OpType.Meta)
            }
            Spacer(Modifier.height(16.dp))
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column(Modifier.weight(1f)) {
                Text(OpFormat.fmtDayTitle(dayKey), style = OpType.Heading, color = p.ink)
                when {
                    pending != null -> Text("Recorded: ${recordedLabel(info)}", style = OpType.Meta, color = p.ink2)
                    decided?.status == "approved" -> Text(
                        listOfNotNull(
                            info?.officeName,
                            info?.points?.takeIf { it > 0 }?.let { PointsFormat.countsAs(it).replaceFirst("Counts as", "counts as") },
                        ).joinToString(", "),
                        style = OpType.Meta,
                        color = p.ink2,
                    )
                    info != null && info.points > 0 -> {
                        val officeCount = info.intervals.map {
                            it.optString("officeName").ifBlank { info.officeName ?: "Office" }
                        }.distinct().size
                        Text(
                            if (officeCount >= 2) "$officeCount offices, ${info.intervals.size} visits"
                            else info.officeName ?: "Office",
                            style = OpType.Meta,
                            color = p.ink2,
                        )
                    }
                    else -> Text("No visit", style = OpType.Meta, color = p.ink2)
                }
            }
            when {
                pending != null -> PendingBadge()
                decided?.status == "approved" -> NeutralBadge("Approved", check = true)
                decided?.status == "rejected" -> NeutralBadge("Not approved")
                info != null && info.points > 0 -> Text(
                    PointsFormat.countsAs(info.points),
                    color = OpColor.OnAccent,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 12.sp,
                    modifier = Modifier
                        .clip(OpShape.Pill)
                        .background(OpColor.Accent)
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                )
            }
        }
        Spacer(Modifier.height(16.dp))

        if (info != null && info.points > 0 && pending == null && decided?.status != "rejected") {
            val officeCount = info.intervals.map {
                it.optString("officeName").ifBlank { info.officeName ?: "Office" }
            }.distinct().size
            val visitCount = info.intervals.size.coerceAtLeast(1)
            Row(
                Modifier.fillMaxWidth().padding(bottom = 14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                DayStat("Visits", "$visitCount")
                if (officeCount >= 2) {
                    DayStat("Offices", "$officeCount")
                } else {
                    DayStat("Hours", OpFormat.durationHm(info.hours))
                }
                DayStat("First In", OpFormat.fmtTime(info.firstIn, tz))
                DayStat("Last Out", OpFormat.fmtTime(info.lastOut, tz))
            }
        }

        when {
            pending != null -> {
                Row(Modifier.fillMaxWidth().clip(OpShape.Input).border(1.dp, p.line, OpShape.Input)) {
                    Column(Modifier.weight(1f).padding(12.dp)) {
                        Text("Recorded", style = OpType.Meta, color = p.ink3)
                        Text(recordedLabel(info), style = OpType.Body, color = p.ink2, modifier = Modifier.padding(top = 4.dp))
                    }
                    Column(
                        Modifier
                            .weight(1f)
                            .background(OpColor.AccentWash)
                            .padding(12.dp),
                    ) {
                        Text("Requested", style = OpType.Meta, color = p.ink2)
                        val req = pending.requested
                        if (req?.optBoolean("remove") == true) {
                            Text("Should not count", style = OpType.Label.copy(fontWeight = FontWeight.Bold), color = p.ink)
                        } else {
                            Text(
                                officeNameFromId(req?.optString("office_id"), info?.officeName) ?: "Office",
                                style = OpType.Label.copy(fontWeight = FontWeight.Bold),
                                color = p.ink,
                            )
                            Text(
                                "${OpFormat.fmtTime(req?.optString("in_at"), tz)} to ${OpFormat.fmtTime(req?.optString("out_at"), tz)}",
                                style = OpType.Meta,
                                color = p.ink,
                                modifier = Modifier.padding(top = 2.dp),
                            )
                        }
                    }
                }
                Text(
                    "Sent ${relativeSent(pending.createdAt)}. Not counted until approved.",
                    style = OpType.Meta,
                    color = p.ink3,
                    modifier = Modifier.padding(top = 10.dp),
                )
                Spacer(Modifier.height(16.dp))
                OpSecondaryButton("Cancel request", onClick = { onCancelRequest(pending.id) })
            }
            decided?.status == "rejected" -> {
                Text(
                    decided.decisionNote?.takeIf { it.isNotBlank() } ?: "An admin did not approve this request.",
                    style = OpType.Body,
                    color = p.ink2,
                )
                Spacer(Modifier.height(16.dp))
                OpPrimaryButton("Request again", onClick = onRequestAgain)
            }
            else -> {
                val intervals = info?.intervals.orEmpty()
                val groups = linkedMapOf<String, MutableList<JSONObject>>()
                intervals.forEach { iv ->
                    val name = iv.optString("officeName").ifBlank { info?.officeName ?: "Office" }
                    groups.getOrPut(name) { mutableListOf() }.add(iv)
                }
                if (groups.size >= 2) {
                    val segs = intervals.mapNotNull { iv ->
                        val start = runCatching {
                            java.time.Instant.parse(iv.optString("startAt")).atZone(OpFormat.zone(tz))
                        }.getOrNull() ?: return@mapNotNull null
                        val end = runCatching {
                            java.time.Instant.parse(iv.optString("endAt")).atZone(OpFormat.zone(tz))
                        }.getOrNull() ?: return@mapNotNull null
                        OfficeVisitSeg(
                            officeName = iv.optString("officeName").ifBlank { info?.officeName ?: "Office" },
                            startMin = start.hour * 60 + start.minute,
                            endMin = (end.hour * 60 + end.minute).coerceAtLeast(start.hour * 60 + start.minute + 1),
                        )
                    }
                    DayOfficeTimeline(segs)
                    Spacer(Modifier.height(12.dp))
                }
                groups.entries.forEachIndexed { gi, (office, visits) ->
                    if (groups.size >= 2) {
                        val officeHours = visits.sumOf { it.optDouble("hours") }
                        Row(
                            Modifier.fillMaxWidth().padding(top = if (gi == 0) 0.dp else 12.dp, bottom = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    Modifier
                                        .size(10.dp)
                                        .clip(OpShape.Pill)
                                        .background(if (gi == 0) p.ink else if (gi == 1) p.ink3 else p.ink2),
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(office, style = OpType.Label.copy(fontWeight = FontWeight.SemiBold), color = if (gi == 0) p.ink else p.ink2)
                            }
                            Text(OpFormat.durationHm(officeHours), style = OpType.Meta, color = p.ink2)
                        }
                    }
                    visits.forEachIndexed { i, iv ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    "${OpFormat.fmtTime(iv.optString("startAt"), tz)} to ${OpFormat.fmtTime(iv.optString("endAt"), tz)}",
                                    style = OpType.Body,
                                    color = p.ink,
                                )
                                if (info?.corrected == true || decided?.status == "approved") {
                                    Spacer(Modifier.width(8.dp))
                                    CorrectedTag()
                                }
                            }
                            Text(OpFormat.durationHm(iv.optDouble("hours")), style = OpType.Label, color = p.ink2)
                        }
                        if (i < visits.lastIndex) DividerLine()
                    }
                }
                if (info != null && info.points > 0) {
                    DividerLine()
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(if (groups.size >= 2) "Total in office" else "Hours", style = OpType.Label, color = p.ink)
                        Text(OpFormat.durationHm(info.hours), style = OpType.Body.copy(fontWeight = FontWeight.SemiBold), color = p.ink)
                    }
                    Text(
                        when {
                            groups.size >= 2 -> {
                                val firstStart = intervals.minOfOrNull {
                                    runCatching { java.time.Instant.parse(it.optString("startAt")).toEpochMilli() }.getOrDefault(Long.MAX_VALUE)
                                } ?: 0L
                                val lastEnd = intervals.maxOfOrNull {
                                    runCatching { java.time.Instant.parse(it.optString("endAt")).toEpochMilli() }.getOrDefault(0L)
                                } ?: 0L
                                val spanH = if (lastEnd > firstStart) (lastEnd - firstStart) / 3_600_000.0 else info.hours
                                val travel = (spanH - info.hours).coerceAtLeast(0.0)
                                "${OpFormat.durationHm(travel)} between offices is not counted. The day counts once."
                            }
                            intervals.size <= 1 -> "One visit day. A gap of $gapMinutes min or more starts a new visit."
                            else -> "${intervals.size} visits, one visit day. A gap of $gapMinutes min or more starts a new visit."
                        },
                        style = OpType.Meta,
                        color = p.ink3,
                    )
                } else if (pending == null) {
                    Text("No visit recorded for this day.", style = OpType.Body, color = p.ink2)
                }
                if (decided?.status == "approved") {
                    Text(
                        "Approved. The original record is kept in history.",
                        style = OpType.Meta,
                        color = p.ink3,
                        modifier = Modifier.padding(top = 10.dp),
                    )
                }
                if (pending == null && decided?.status != "rejected") {
                    Spacer(Modifier.height(16.dp))
                    OpSecondaryButton(
                        "Request a correction",
                        onClick = onRequestCorrection,
                        enabled = !readonly,
                    )
                    if (readonly) {
                        Text(
                            "Not available while viewing as ${readonlyName.ifBlank { "another user" }}.",
                            style = OpType.Meta,
                            color = p.ink3,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CalendarGrid(
    monthKey: String,
    days: Map<String, DayInfo>,
    pendingDays: Set<String>,
    todayKey: String,
    selectedDay: String?,
    onSelect: (String) -> Unit,
) {
    val p = LocalOpPalette.current
    val ym = YearMonth.parse(monthKey)
    val lead = (ym.atDay(1).dayOfWeek.value + 6) % 7
    Column {
        Row(Modifier.fillMaxWidth()) {
            listOf("M", "T", "W", "T", "F", "S", "S").forEach {
                Text(
                    it,
                    modifier = Modifier.weight(1f),
                    textAlign = TextAlign.Center,
                    style = OpType.Meta,
                    color = p.ink3,
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        val cells = buildList {
            repeat(lead) { add(null as Int?) }
            for (d in 1..ym.lengthOfMonth()) add(d)
        }
        cells.chunked(7).forEach { week ->
            Row(Modifier.fillMaxWidth()) {
                week.forEach { dayNum ->
                    Box(Modifier.weight(1f).aspectRatio(1f), contentAlignment = Alignment.Center) {
                        if (dayNum != null) {
                            val key = "%s-%02d".format(monthKey, dayNum)
                            val info = days[key]
                            val points = info?.points ?: 0
                            val pending = key in pendingDays
                            val today = key == todayKey
                            val selected = key == selectedDay
                            DayCell(
                                day = dayNum,
                                points = points,
                                pending = pending,
                                today = today,
                                selected = selected,
                                onClick = { onSelect(key) },
                            )
                        }
                    }
                }
                repeat(7 - week.size) { Box(Modifier.weight(1f).aspectRatio(1f)) }
            }
        }
    }
}

@Composable
private fun DayCell(day: Int, points: Int, pending: Boolean, today: Boolean, selected: Boolean, onClick: () -> Unit) {
    val p = LocalOpPalette.current
    val accent = OpColor.Accent
    Box(
        Modifier
            .fillMaxSize()
            .padding(2.dp)
            .then(if (selected) Modifier.clip(OpShape.Input).background(p.sunk) else Modifier)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(36.dp), contentAlignment = Alignment.Center) {
            when {
                pending -> {
                    Canvas(Modifier.size(36.dp)) {
                        drawRoundRect(
                            color = accent,
                            style = Stroke(
                                width = 2.dp.toPx(),
                                pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 6f)),
                            ),
                            cornerRadius = CornerRadius(size.minDimension / 2),
                        )
                    }
                    Text("$day", color = p.ink, fontWeight = FontWeight.SemiBold)
                }
                points > 0 -> {
                    Box(Modifier.size(36.dp).clip(CircleShape).background(accent), contentAlignment = Alignment.Center) {
                        Text("$day", color = OpColor.OnAccent, fontWeight = FontWeight.Bold)
                    }
                    if (today || selected) {
                        Canvas(Modifier.size(40.dp)) {
                            drawCircle(color = p.ink, style = Stroke(width = 2.5.dp.toPx()))
                        }
                    }
                    if (points >= 2) {
                        Box(
                            Modifier
                                .align(Alignment.TopEnd)
                                .size(16.dp)
                                .clip(CircleShape)
                                .background(p.surface)
                                .border(1.dp, p.lineStrong, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("2", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = p.ink2)
                        }
                    }
                }
                else -> {
                    if (today) {
                        Canvas(Modifier.size(36.dp)) {
                            drawCircle(color = p.ink, style = Stroke(width = 2.dp.toPx()))
                        }
                    }
                    Text("$day", color = p.ink3)
                }
            }
        }
    }
}

@Composable
private fun CorrectionFlow(
    dayKey: String,
    prefs: AppPrefs,
    offices: List<Office>,
    dayInfo: DayInfo?,
    repo: PresenceRepository,
    onClose: () -> Unit,
    onSent: () -> Unit,
    onBackToMonth: () -> Unit,
) {
    val p = LocalOpPalette.current
    val main = remember { Handler(Looper.getMainLooper()) }
    var step by remember { mutableStateOf(CorrectionStep.Choose) }
    var issue by remember { mutableStateOf("missing_visit") }
    var officeId by remember { mutableStateOf(offices.firstOrNull()?.id.orEmpty()) }
    var inTime by remember { mutableStateOf("09:30") }
    var outTime by remember { mutableStateOf("18:00") }
    var reason by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var effectBefore by remember { mutableStateOf(0) }
    var effectAfter by remember { mutableStateOf(0) }
    var target by remember { mutableStateOf(prefs.monthlyPointsTarget) }
    var sentIssue by remember { mutableStateOf("") }

    val issues = listOf(
        "missing_visit" to ("A visit is missing" to "I was in the office, but no visit is shown"),
        "wrong_times" to ("Times are wrong" to "A visit started or ended at another time"),
        "wrong_office" to ("Wrong office" to "The visit was at a different office"),
        "should_not_count" to ("This day should not count" to "I was not in the office that day"),
    )

    fun loadPreview() {
        thread {
            val remove = issue == "should_not_count"
            val inIso = if (remove) null else localToIso(dayKey, inTime, prefs.timezone)
            val outIso = if (remove) null else localToIso(dayKey, outTime, prefs.timezone)
            val res = runCatching {
                repo.api.previewCorrection(dayKey, officeId.takeIf { it.isNotBlank() }, inIso, outIso, remove)
            }.getOrNull()
            val effect = res?.optJSONObject("effect")
            main.post {
                effectBefore = effect?.optInt("days_before") ?: effect?.optInt("pointsBefore") ?: 0
                effectAfter = effect?.optInt("days_after") ?: effect?.optInt("pointsAfter") ?: 0
                target = effect?.optInt("target") ?: prefs.monthlyPointsTarget
            }
        }
    }

    Column(Modifier.fillMaxSize().background(p.bg).padding(20.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = {
                when (step) {
                    CorrectionStep.Choose -> onClose()
                    CorrectionStep.Edit -> step = CorrectionStep.Choose
                    CorrectionStep.Review -> step = CorrectionStep.Edit
                    CorrectionStep.Sent -> onBackToMonth()
                }
            }) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back", tint = p.ink)
            }
            Text("Correct ${OpFormat.fmtDayTitle(dayKey)}", style = OpType.Heading, color = p.ink)
        }
        if (step != CorrectionStep.Sent) {
            StepBars(
                when (step) {
                    CorrectionStep.Choose -> 1
                    CorrectionStep.Edit -> 2
                    else -> 3
                },
            )
            Spacer(Modifier.height(20.dp))
        }

        when (step) {
            CorrectionStep.Choose -> {
                Text("What looks wrong?", style = OpType.Title, color = p.ink)
                Text(
                    "Recorded for this day: ${recordedLabel(dayInfo)}.",
                    style = OpType.Body,
                    color = p.ink2,
                    modifier = Modifier.padding(top = 6.dp, bottom = 16.dp),
                )
                issues.forEach { (id, labels) ->
                    val selected = issue == id
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(bottom = 10.dp)
                            .clip(OpShape.Input)
                            .border(if (selected) 2.dp else 1.dp, if (selected) p.ink else p.line, OpShape.Input)
                            .clickable { issue = id }
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(
                            selected = selected,
                            onClick = { issue = id },
                            colors = RadioButtonDefaults.colors(selectedColor = OpColor.Accent),
                        )
                        Column {
                            Text(labels.first, style = OpType.Label.copy(fontWeight = FontWeight.Bold), color = p.ink)
                            Text(labels.second, style = OpType.Meta, color = p.ink2)
                        }
                    }
                }
                Spacer(Modifier.weight(1f))
                OpPrimaryButton("Continue", onClick = {
                    if (issue == "should_not_count") {
                        loadPreview()
                        step = CorrectionStep.Review
                    } else step = CorrectionStep.Edit
                })
            }
            CorrectionStep.Edit -> {
                Text("What should it be?", style = OpType.Title, color = p.ink)
                Spacer(Modifier.height(16.dp))
                Text("Office", style = OpType.Meta, color = p.ink3)
                Spacer(Modifier.height(6.dp))
                // Simple cycle through offices on tap
                val office = offices.firstOrNull { it.id == officeId } ?: offices.firstOrNull()
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(OpShape.Input)
                        .background(p.surface)
                        .border(1.dp, p.lineStrong, OpShape.Input)
                        .clickable {
                            if (offices.isNotEmpty()) {
                                val idx = offices.indexOfFirst { it.id == officeId }.let { if (it < 0) 0 else it }
                                officeId = offices[(idx + 1) % offices.size].id
                            }
                        }
                        .padding(14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(office?.displayName ?: "No offices", color = p.ink)
                    Text(">", color = p.ink3)
                }
                Spacer(Modifier.height(14.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text("In", style = OpType.Meta, color = p.ink3)
                        TextField(
                            value = inTime,
                            onValueChange = { inTime = it },
                            singleLine = true,
                            colors = fieldColors(),
                            modifier = Modifier.fillMaxWidth().clip(OpShape.Input),
                        )
                    }
                    Column(Modifier.weight(1f)) {
                        Text("Out", style = OpType.Meta, color = p.ink3)
                        TextField(
                            value = outTime,
                            onValueChange = { outTime = it },
                            singleLine = true,
                            colors = fieldColors(),
                            modifier = Modifier.fillMaxWidth().clip(OpShape.Input),
                        )
                    }
                }
                Spacer(Modifier.height(14.dp))
                Text("Reason (admins see this)", style = OpType.Meta, color = p.ink3)
                TextField(
                    value = reason,
                    onValueChange = { reason = it.take(500) },
                    colors = fieldColors(),
                    modifier = Modifier.fillMaxWidth().height(120.dp).clip(OpShape.Input),
                    placeholder = { Text("My phone battery died at 9 am. I was at my desk all day.", color = p.ink3) },
                )
                Spacer(Modifier.weight(1f))
                OpPrimaryButton("Review request", onClick = {
                    loadPreview()
                    step = CorrectionStep.Review
                }, enabled = reason.isNotBlank())
            }
            CorrectionStep.Review -> {
                Text("Check your request", style = OpType.Title, color = p.ink)
                Spacer(Modifier.height(16.dp))
                Row(Modifier.fillMaxWidth().clip(OpShape.Input).border(1.dp, p.line, OpShape.Input)) {
                    Column(Modifier.weight(1f).padding(12.dp)) {
                        Text("Recorded", style = OpType.Meta, color = p.ink3)
                        Text(recordedLabel(dayInfo), style = OpType.Body, color = p.ink2, modifier = Modifier.padding(top = 4.dp))
                    }
                    Column(Modifier.weight(1f).background(OpColor.AccentWash).padding(12.dp)) {
                        Text("You are asking for", style = OpType.Meta, color = p.ink2)
                        if (issue == "should_not_count") {
                            Text("Should not count", style = OpType.Label.copy(fontWeight = FontWeight.Bold), color = p.ink)
                        } else {
                            val name = offices.firstOrNull { it.id == officeId }?.displayName ?: "Office"
                            Text(name, style = OpType.Label.copy(fontWeight = FontWeight.Bold), color = p.ink)
                            Text(
                                "${fmtHm(inTime)} to ${fmtHm(outTime)}",
                                style = OpType.Meta,
                                color = p.ink,
                            )
                            Text(
                                PointsFormat.countsAs(offices.firstOrNull { it.id == officeId }?.pointsPerVisitDay ?: 1),
                                style = OpType.Meta,
                                color = p.ink3,
                            )
                        }
                    }
                }
                if (reason.isNotBlank()) {
                    Text(
                        reason,
                        style = OpType.Body,
                        color = p.ink2,
                        modifier = Modifier
                            .padding(top = 16.dp)
                            .border(width = 0.dp, color = p.line)
                            .padding(start = 12.dp),
                    )
                }
                Spacer(Modifier.height(16.dp))
                OpCard {
                    Text("If approved, ${OpFormat.fmtMonthShort(dayKey.take(7))} becomes", style = OpType.Label, color = p.ink)
                    Spacer(Modifier.height(8.dp))
                    DaysMeter(effectAfter, target)
                    Text(
                        "Until then your month stays at $effectBefore / $target points.",
                        style = OpType.Meta,
                        color = p.ink3,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
                Spacer(Modifier.weight(1f))
                OpPrimaryButton(
                    label = if (sending) "Sending..." else "Send request",
                    loading = sending,
                    onClick = {
                        if (sending) return@OpPrimaryButton
                        sending = true
                        thread {
                            val remove = issue == "should_not_count"
                            val inIso = localToIso(dayKey, inTime, prefs.timezone) ?: "${dayKey}T04:00:00Z"
                            var outIso = localToIso(dayKey, outTime, prefs.timezone) ?: "${dayKey}T12:30:00Z"
                            try {
                                if (java.time.Instant.parse(outIso) <= java.time.Instant.parse(inIso)) {
                                    outIso = java.time.Instant.parse(outIso).plusSeconds(24 * 3600).toString()
                                }
                            } catch (_: Exception) {}
                            val res = runCatching {
                                repo.api.submitCorrection(
                                    dayKey = dayKey,
                                    proposedStart = inIso,
                                    proposedEnd = outIso,
                                    reason = reason.ifBlank { issueLabel(issue) },
                                    officeLocationId = officeId,
                                    issue = issue,
                                    remove = remove,
                                )
                            }.getOrNull()
                            main.post {
                                sending = false
                                if (res?.ok() == true) {
                                    sentIssue = issue
                                    step = CorrectionStep.Sent
                                }
                            }
                        }
                    },
                )
                Text(
                    "Edit request",
                    textDecoration = TextDecoration.Underline,
                    modifier = Modifier
                        .align(Alignment.CenterHorizontally)
                        .padding(top = 12.dp)
                        .clickable { step = if (issue == "should_not_count") CorrectionStep.Choose else CorrectionStep.Edit },
                    color = p.ink,
                    style = OpType.Label,
                )
            }
            CorrectionStep.Sent -> {
                Column(
                    Modifier.fillMaxSize(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Spacer(Modifier.height(40.dp))
                    Box(
                        Modifier.size(64.dp).clip(CircleShape).background(p.sunk),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Outlined.Check, contentDescription = null, tint = p.ink2, modifier = Modifier.size(32.dp))
                    }
                    Spacer(Modifier.height(20.dp))
                    Text("Request sent", style = OpType.Title, color = p.ink)
                    Text(
                        "An admin reviews it. You get a notification with the decision. Your month changes only if it is approved.",
                        style = OpType.Body,
                        color = p.ink2,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 8.dp, start = 12.dp, end = 12.dp),
                    )
                    Spacer(Modifier.height(24.dp))
                    OpCard {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(OpFormat.fmtDayTitle(dayKey), style = OpType.Label.copy(fontWeight = FontWeight.Bold), color = p.ink)
                            PendingBadge()
                        }
                        Text(
                            listOfNotNull(
                                issueLabel(sentIssue.ifBlank { issue }),
                                offices.firstOrNull { it.id == officeId }?.displayName,
                                if (issue != "should_not_count") "${fmtHm(inTime)} to ${fmtHm(outTime)}" else null,
                            ).joinToString(", "),
                            style = OpType.Meta,
                            color = p.ink2,
                            modifier = Modifier.padding(top = 6.dp),
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    OpPrimaryButton("Back to month", onClick = onBackToMonth)
                    Text(
                        "View my requests",
                        textDecoration = TextDecoration.Underline,
                        modifier = Modifier.padding(top = 12.dp).clickable(onClick = onSent),
                        color = p.ink,
                        style = OpType.Label,
                    )
                }
            }
        }
    }
}

@Composable
private fun StepBars(step: Int) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        repeat(3) { i ->
            Box(
                Modifier
                    .weight(1f)
                    .height(4.dp)
                    .clip(OpShape.Pill)
                    .background(if (i < step) OpColor.Accent else LocalOpPalette.current.sunk),
            )
        }
    }
}

@Composable
private fun fieldColors() = TextFieldDefaults.colors(
    focusedContainerColor = LocalOpPalette.current.surface,
    unfocusedContainerColor = LocalOpPalette.current.surface,
    focusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
    unfocusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
)

private fun dayMap(report: JSONObject?): Map<String, DayInfo> {
    if (report == null) return emptyMap()
    val map = LinkedHashMap<String, DayInfo>()
    fun put(o: JSONObject) {
        val key = o.optString("dayKey")
        if (key.isBlank()) return
        val intervals = mutableListOf<JSONObject>()
        o.optJSONArray("intervals")?.let { arr ->
            for (i in 0 until arr.length()) intervals += arr.getJSONObject(i)
        }
        val existing = map[key]
        map[key] = DayInfo(
            dayKey = key,
            points = o.optInt("points", existing?.points ?: 0),
            officeName = o.optString("officeName").takeIf { it.isNotBlank() && it != "null" } ?: existing?.officeName,
            hours = if (o.has("hours")) o.optDouble("hours") else existing?.hours ?: 0.0,
            intervals = intervals.ifEmpty { existing?.intervals.orEmpty() },
            firstIn = o.optString("firstIn").takeIf { it.isNotBlank() && it != "null" } ?: existing?.firstIn,
            lastOut = o.optString("lastOut").takeIf { it.isNotBlank() && it != "null" } ?: existing?.lastOut,
            corrected = o.optBoolean("corrected", existing?.corrected == true),
        )
    }
    report.optJSONArray("days")?.let { arr -> for (i in 0 until arr.length()) put(arr.getJSONObject(i)) }
    report.optJSONArray("calendar")?.let { arr -> for (i in 0 until arr.length()) put(arr.getJSONObject(i)) }
    return map
}

private fun parseCorrections(res: JSONObject?): List<PendingCorrection> {
    if (res == null || !res.ok()) return emptyList()
    val arr = res.optJSONArray("requests") ?: return emptyList()
    return (0 until arr.length()).map { i ->
        val o = arr.getJSONObject(i)
        PendingCorrection(
            id = o.optString("id"),
            dayKey = o.optString("dayKey", o.optString("day")),
            issue = o.optString("issue"),
            status = o.optString("status"),
            recorded = o.optJSONObject("recorded"),
            requested = o.optJSONObject("requested"),
            createdAt = o.optString("createdAt").takeIf { it.isNotBlank() && it != "null" },
            decidedAt = o.optString("decidedAt").takeIf { it.isNotBlank() && it != "null" },
            decisionNote = o.optString("decisionNote").takeIf { it.isNotBlank() && it != "null" },
        )
    }
}

private fun recordedLabel(info: DayInfo?): String =
    if (info == null || info.points <= 0) "no visit" else info.officeName ?: "visit"

private fun issueLabel(issue: String) = when (issue) {
    "missing_visit" -> "A visit is missing"
    "wrong_times" -> "Times are wrong"
    "wrong_office" -> "Wrong office"
    "should_not_count" -> "This day should not count"
    else -> issue
}

private fun officeNameFromId(id: String?, fallback: String?) = fallback

private fun relativeSent(iso: String?): String {
    if (iso.isNullOrBlank()) return "recently"
    return try {
        val mins = java.time.Duration.between(java.time.Instant.parse(iso), java.time.Instant.now()).toMinutes()
        when {
            mins < 60 -> "today"
            mins < 24 * 60 -> "today"
            else -> "earlier"
        }
    } catch (_: Exception) {
        "recently"
    }
}

private fun localToIso(dayKey: String, hm: String, tz: String): String? {
    val normalized = hm.trim().lowercase()
        .replace(" am", "")
        .replace(" pm", "")
        .let { if (it.length == 4 && it[1] == ':') "0$it" else it }
    val base = if (Regex("^\\d{1,2}:\\d{2}$").matches(normalized)) {
        val parts = normalized.split(":")
        "%02d:%02d".format(parts[0].toInt(), parts[1].toInt())
    } else return null
    var hour = base.substring(0, 2).toInt()
    val min = base.substring(3, 5).toInt()
    if (hm.lowercase().contains("pm") && hour < 12) hour += 12
    if (hm.lowercase().contains("am") && hour == 12) hour = 0
    return try {
        LocalDateTime.of(LocalDate.parse(dayKey), java.time.LocalTime.of(hour, min))
            .atZone(ZoneId.of(tz)).toInstant().toString()
    } catch (_: Exception) {
        null
    }
}

private fun fmtHm(hm: String): String {
    val n = hm.trim()
    if (n.contains("am", true) || n.contains("pm", true)) return n.lowercase()
    return try {
        val parts = n.split(":")
        val h = parts[0].toInt()
        val m = parts.getOrNull(1)?.toInt() ?: 0
        val am = h < 12
        val h12 = when {
            h == 0 -> 12
            h > 12 -> h - 12
            else -> h
        }
        "$h12:${m.toString().padStart(2, '0')} ${if (am) "am" else "pm"}"
    } catch (_: Exception) {
        n
    }
}
