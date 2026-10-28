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
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.data.ok
import com.pwc.officepresence.ui.theme.LocalOpPalette
import com.pwc.officepresence.ui.theme.OpColor
import com.pwc.officepresence.ui.theme.OpShape
import com.pwc.officepresence.ui.theme.OpType
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.Year
import java.time.YearMonth
import kotlin.concurrent.thread
import kotlin.math.max

@Composable
fun YearScreen(
    repo: PresenceRepository,
    prefs: AppPrefs,
    onOpenMonth: (monthKey: String) -> Unit = {},
) {
    val p = LocalOpPalette.current
    val main = remember { Handler(Looper.getMainLooper()) }
    var year by remember { mutableIntStateOf(Year.now().value) }
    var data by remember { mutableStateOf<JSONObject?>(null) }
    var loading by remember { mutableStateOf(true) }
    var syncing by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    var tick by remember { mutableIntStateOf(0) }

    fun load(y: Int, forceNetwork: Boolean = false) {
        year = y
        loading = true
        err = null
        thread {
            if (forceNetwork || repo.shouldRefreshOnOpen()) {
                repo.refreshIfNeeded(force = forceNetwork)
            }
            val cached = prefs.cachedYearJson(y)
            if (cached != null && !forceNetwork) {
                main.post {
                    data = cached
                    loading = false
                }
            }
            val res = runCatching { repo.api.year(y) }.getOrNull()
            main.post {
                if (year != y) return@post
                if (res?.ok() == true) {
                    data = res
                    prefs.storeYearJson(y, res.toString())
                    prefs.yearFetchedAtMs = System.currentTimeMillis()
                    loading = false
                    err = null
                } else if (data == null) {
                    err = res?.optString("error") ?: "Could not load"
                    loading = false
                } else {
                    loading = false
                }
            }
        }
    }

    fun syncNow() {
        if (!repo.canManualSync()) return
        syncing = true
        thread {
            repo.refreshIfNeeded(force = true)
            val res = runCatching { repo.api.year(year) }.getOrNull()
            main.post {
                syncing = false
                if (res?.ok() == true) {
                    data = res
                    prefs.storeYearJson(year, res.toString())
                    prefs.yearFetchedAtMs = System.currentTimeMillis()
                    err = null
                } else {
                    err = res?.optString("error") ?: "Sync failed"
                }
                tick += 1
            }
        }
    }

    LaunchedEffect(year) { load(year) }
    LaunchedEffect(tick) {
        kotlinx.coroutines.delay(30_000)
        tick += 1
    }

    val syncEnabled = repo.canManualSync() && !syncing
    val updated = OpFormat.updatedAgo(prefs.lastSyncAtMs.takeIf { it > 0 } ?: prefs.yearFetchedAtMs)

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.AutoMirrored.Outlined.KeyboardArrowLeft,
                        contentDescription = "Previous year",
                        tint = p.ink,
                        modifier = Modifier
                            .size(28.dp)
                            .clickable {
                                val years = yearsFrom(data)
                                val prev = years.firstOrNull { it < year } ?: (year - 1)
                                load(prev)
                            },
                    )
                    Text(
                        year.toString(),
                        style = OpType.Title,
                        color = p.ink,
                        modifier = Modifier.padding(horizontal = 8.dp),
                    )
                    Icon(
                        Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                        contentDescription = "Next year",
                        tint = p.ink,
                        modifier = Modifier
                            .size(28.dp)
                            .clickable {
                                val years = yearsFrom(data)
                                val next = years.lastOrNull { it > year } ?: (year + 1)
                                val maxY = Year.now().value
                                if (next <= maxY) load(next)
                            },
                    )
                }
                Text(updated, style = OpType.Meta, color = p.ink3, modifier = Modifier.padding(top = 4.dp))
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(OpShape.Pill)
                    .border(1.dp, p.lineStrong, OpShape.Pill)
                    .background(p.surface)
                    .clickable(enabled = syncEnabled) { syncNow() }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
            ) {
                if (syncing) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        color = OpColor.Accent,
                        strokeWidth = 2.dp,
                    )
                } else {
                    Icon(Icons.Outlined.Sync, contentDescription = null, tint = p.ink2, modifier = Modifier.size(16.dp))
                }
                Spacer(Modifier.width(6.dp))
                Text(
                    if (syncEnabled || syncing) "Sync" else "Sync",
                    style = OpType.Meta,
                    color = if (syncEnabled) p.ink else p.ink3,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }

        Spacer(Modifier.height(16.dp))

        when {
            loading && data == null -> {
                Box(Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = OpColor.Accent)
                }
            }
            err != null && data == null -> {
                Text(err!!, color = p.ink2, style = OpType.Body)
                Spacer(Modifier.height(12.dp))
                OpSecondaryButton("Try again", onClick = { load(year, forceNetwork = true) })
            }
            data != null && data!!.optJSONObject("summary")?.optInt("visitDays", 0) == 0 &&
                data!!.optJSONObject("summary")?.optInt("points", 0) == 0 -> {
                YearEmptyCard()
                Spacer(Modifier.height(12.dp))
                PointsByMonthCard(data!!, onOpenMonth)
            }
            data != null -> {
                YearSummaryCard(data!!)
                Spacer(Modifier.height(12.dp))
                PointsByMonthCard(data!!, onOpenMonth)
                Spacer(Modifier.height(12.dp))
                WeekdayHeatmapCard(data!!, onOpenMonth)
                Spacer(Modifier.height(12.dp))
                OfficesCard(data!!)
                Spacer(Modifier.height(12.dp))
                DaysYouComeInCard(data!!)
                Spacer(Modifier.height(12.dp))
                YearStatsCard(data!!)
            }
        }
    }
}

@Composable
private fun YearEmptyCard() {
    val p = LocalOpPalette.current
    Column(
        Modifier
            .fillMaxWidth()
            .clip(OpShape.Card)
            .background(p.surface)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(p.sunk),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Outlined.BarChart, contentDescription = null, tint = p.ink3, modifier = Modifier.size(28.dp))
        }
        Spacer(Modifier.height(16.dp))
        Text("Your year starts here", style = OpType.Heading, color = p.ink, textAlign = TextAlign.Center)
        Text(
            "After your first visit day, this page shows points by month, offices, and the days you usually come in.",
            style = OpType.Body,
            color = p.ink2,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

@Composable
private fun YearSummaryCard(data: JSONObject) {
    val p = LocalOpPalette.current
    val summary = data.optJSONObject("summary") ?: JSONObject()
    val points = summary.optInt("points")
    val visitDays = summary.optInt("visitDays")
    val monthsMet = summary.optInt("monthsMet")
    val monthsElapsed = summary.optInt("monthsElapsed")
    val targetSoFar = summary.optInt("targetSoFar")
    val toGo = summary.optInt("toGoThisMonth")
    val monthLabel = summary.optString("currentMonthLabel", "this month")
    Column(
        Modifier
            .fillMaxWidth()
            .clip(OpShape.Card)
            .background(p.surface)
            .padding(16.dp),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom,
        ) {
            Text(
                if (points == 1) "1 point" else "$points points",
                style = OpType.Number.copy(fontSize = 36.sp),
                color = p.ink,
            )
            Text(
                if (visitDays == 1) "1 visit day so far this year" else "$visitDays visit days so far this year",
                style = OpType.Meta,
                color = p.ink3,
                modifier = Modifier.padding(start = 12.dp, bottom = 4.dp),
            )
        }
        Spacer(Modifier.height(16.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            StatCell("$monthsMet of $monthsElapsed months met")
            StatCell("$targetSoFar target so far")
            StatCell(
                if (toGo <= 0) "Goal met for $monthLabel"
                else "$toGo to go for $monthLabel",
            )
        }
    }
}

@Composable
private fun StatCell(text: String) {
    val p = LocalOpPalette.current
    Text(
        text,
        style = OpType.Meta,
        color = p.ink2,
        modifier = Modifier
            .width(100.dp)
            .padding(end = 4.dp),
    )
}

@Composable
private fun PointsByMonthCard(data: JSONObject, onOpenMonth: (String) -> Unit) {
    val p = LocalOpPalette.current
    val months = data.optJSONArray("months") ?: JSONArray()
    val target = data.optInt("pointsTarget", 8).coerceAtLeast(1)
    val maxPts = (0 until months.length()).maxOfOrNull {
        months.getJSONObject(it).optInt("points")
    }?.coerceAtLeast(target) ?: target

    Column(
        Modifier
            .fillMaxWidth()
            .clip(OpShape.Card)
            .background(p.surface)
            .padding(16.dp),
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Points by month", style = OpType.Heading, color = p.ink)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(OpColor.Ok))
                Spacer(Modifier.width(6.dp))
                Text("Goal met", style = OpType.Meta, color = p.ink3)
            }
        }
        Spacer(Modifier.height(12.dp))
        val accent = OpColor.Accent
        val ink3 = p.ink3
        val sunk = p.sunk
        val ok = OpColor.Ok
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(160.dp),
        ) {
            val n = 12
            val gap = 6.dp.toPx()
            val barW = (size.width - gap * (n - 1)) / n
            val topPad = 20.dp.toPx()
            val bottomPad = 28.dp.toPx()
            val chartH = size.height - topPad - bottomPad
            val targetY = topPad + chartH * (1f - target.toFloat() / maxPts)

            drawLine(
                color = ink3,
                start = Offset(0f, targetY),
                end = Offset(size.width, targetY),
                strokeWidth = 1.5.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 6f)),
            )

            for (i in 0 until n) {
                val m = months.optJSONObject(i) ?: continue
                val pts = m.optInt("points")
                val met = m.optBoolean("targetMet")
                val current = m.optBoolean("isCurrent")
                val future = m.optBoolean("isFuture")
                val x = i * (barW + gap)
                val h = if (future || pts <= 0) 4.dp.toPx() else chartH * (pts.toFloat() / maxPts)
                val y = topPad + chartH - h
                val color = when {
                    future || pts <= 0 -> sunk
                    else -> accent
                }
                if (current && pts > 0) {
                    // Striped current month: draw base then hatch.
                    drawRoundRect(
                        color = accent.copy(alpha = 0.35f),
                        topLeft = Offset(x, y),
                        size = Size(barW, h),
                        cornerRadius = CornerRadius(6.dp.toPx()),
                    )
                    var sx = x - h
                    while (sx < x + barW) {
                        drawLine(
                            color = accent,
                            start = Offset(sx.coerceAtLeast(x), y + h),
                            end = Offset((sx + h).coerceAtMost(x + barW), y),
                            strokeWidth = 2.dp.toPx(),
                        )
                        sx += 8.dp.toPx()
                    }
                    drawRoundRect(
                        color = accent,
                        topLeft = Offset(x, y),
                        size = Size(barW, h),
                        cornerRadius = CornerRadius(6.dp.toPx()),
                        style = Stroke(width = 1.5.dp.toPx()),
                    )
                } else {
                    drawRoundRect(
                        color = color,
                        topLeft = Offset(x, y),
                        size = Size(barW, max(h, 4.dp.toPx())),
                        cornerRadius = CornerRadius(6.dp.toPx()),
                    )
                }
                if (met) {
                    drawCircle(
                        color = ok,
                        radius = 4.dp.toPx(),
                        center = Offset(x + barW / 2, size.height - 10.dp.toPx()),
                    )
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            for (i in 0 until months.length()) {
                val m = months.getJSONObject(i)
                Text(
                    m.optString("label"),
                    style = OpType.Meta,
                    color = p.ink3,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .weight(1f)
                        .clickable(enabled = !m.optBoolean("isFuture")) {
                            onOpenMonth(m.optString("month"))
                        },
                )
            }
        }
        Text(
            "Tap a month for details",
            style = OpType.Meta,
            color = p.ink3,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

@Composable
private fun WeekdayHeatmapCard(data: JSONObject, onOpenMonth: (String) -> Unit) {
    val p = LocalOpPalette.current
    val year = data.optInt("year")
    val keys = buildSet {
        val arr = data.optJSONArray("visitDayKeys") ?: JSONArray()
        for (i in 0 until arr.length()) add(arr.getString(i))
    }
    val months = listOf("Jan", "Mar", "May", "Jul", "Sep", "Nov")
    Column(
        Modifier
            .fillMaxWidth()
            .clip(OpShape.Card)
            .background(p.surface)
            .padding(16.dp),
    ) {
        Text("Visit days, weekdays", style = OpType.Heading, color = p.ink)
        Text("Tap a month for details", style = OpType.Meta, color = p.ink3, modifier = Modifier.padding(top = 4.dp, bottom = 12.dp))
        HeatmapGrid(year, keys, accent = OpColor.Accent, empty = p.sunk, onOpenMonth = onOpenMonth)
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            months.forEach { Text(it, style = OpType.Meta, color = p.ink3) }
        }
    }
}

@Composable
private fun HeatmapGrid(
    year: Int,
    keys: Set<String>,
    accent: androidx.compose.ui.graphics.Color,
    empty: androidx.compose.ui.graphics.Color,
    onOpenMonth: (String) -> Unit,
) {
    Canvas(
        Modifier
            .fillMaxWidth()
            .height(72.dp)
            .clickable {
                // Open current month as a sensible default when tapping the heatmap.
                onOpenMonth(YearMonth.now().toString())
            },
    ) {
        val cols = 53
        val gap = 2.dp.toPx()
        val cell = ((size.width - gap * (cols - 1)) / cols).coerceAtMost(7.dp.toPx())
        var d = LocalDate.of(year, 1, 1)
        val end = LocalDate.of(year, 12, 31)
        // Week index: ISO-like weeks starting Monday.
        val jan1Dow = (d.dayOfWeek.value + 6) % 7 // Mon=0
        while (!d.isAfter(end)) {
            val dow = (d.dayOfWeek.value + 6) % 7
            if (dow <= 4) {
                val dayOfYear = d.dayOfYear
                val week = (dayOfYear + jan1Dow - 1) / 7
                val x = week * (cell + gap)
                val y = dow * (cell + gap)
                drawCircle(
                    color = if (keys.contains(d.toString())) accent else empty,
                    radius = cell / 2f,
                    center = Offset(x + cell / 2, y + cell / 2),
                )
            }
            d = d.plusDays(1)
        }
    }
}

@Composable
private fun OfficesCard(data: JSONObject) {
    val p = LocalOpPalette.current
    val offices = data.optJSONArray("offices") ?: JSONArray()
    if (offices.length() == 0) return
    val maxPts = (0 until offices.length()).maxOf { offices.getJSONObject(it).optInt("points") }.coerceAtLeast(1)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(OpShape.Card)
            .background(p.surface)
            .padding(16.dp),
    ) {
        Text("Offices this year", style = OpType.Heading, color = p.ink)
        Spacer(Modifier.height(12.dp))
        for (i in 0 until offices.length()) {
            val o = offices.getJSONObject(i)
            val pts = o.optInt("points")
            val days = o.optInt("visitDays")
            val per = o.optInt("pointsPerVisitDay", 1)
            val name = o.optString("name", "Office")
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(name, style = OpType.Label, color = p.ink, fontWeight = FontWeight.SemiBold)
                Text(if (pts == 1) "1 point" else "$pts points", style = OpType.Label, color = p.ink, fontWeight = FontWeight.SemiBold)
            }
            Spacer(Modifier.height(6.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(OpShape.Pill)
                    .background(p.sunk),
            ) {
                Box(
                    Modifier
                        .fillMaxWidth(pts.toFloat() / maxPts)
                        .height(6.dp)
                        .clip(OpShape.Pill)
                        .background(p.ink),
                )
            }
            val dayBit = if (days == 1) "1 visit day" else "$days visit days"
            val perBit = if (per == 1) "1 point each" else "$per points each"
            Text(
                if (days == 1 && per == 1) "1 visit day, 1 point" else "$dayBit, $perBit",
                style = OpType.Meta,
                color = p.ink3,
                modifier = Modifier.padding(top = 4.dp, bottom = 12.dp),
            )
        }
    }
}

@Composable
private fun DaysYouComeInCard(data: JSONObject) {
    val p = LocalOpPalette.current
    val weekdays = data.optJSONArray("weekdays") ?: JSONArray()
    if (weekdays.length() == 0) return
    val maxD = (0 until weekdays.length()).maxOf { weekdays.getJSONObject(it).optInt("visitDays") }.coerceAtLeast(1)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(OpShape.Card)
            .background(p.surface)
            .padding(16.dp),
    ) {
        Text("Days you come in", style = OpType.Heading, color = p.ink)
        Text("Visit days by weekday", style = OpType.Meta, color = p.ink3, modifier = Modifier.padding(top = 2.dp, bottom = 12.dp))
        val ink = p.ink
        val ink3 = p.ink3
        Canvas(Modifier.fillMaxWidth().height(120.dp)) {
            val n = weekdays.length()
            val gap = 12.dp.toPx()
            val barW = (size.width - gap * (n - 1)) / n
            val top = 18.dp.toPx()
            val bottom = 22.dp.toPx()
            val hAvail = size.height - top - bottom
            for (i in 0 until n) {
                val w = weekdays.getJSONObject(i)
                val v = w.optInt("visitDays")
                val h = hAvail * (v.toFloat() / maxD)
                val x = i * (barW + gap)
                val y = top + hAvail - h
                drawRoundRect(
                    color = if (v == maxD && v > 0) ink else ink3.copy(alpha = 0.45f),
                    topLeft = Offset(x, y),
                    size = Size(barW, max(h, 2.dp.toPx())),
                    cornerRadius = CornerRadius(6.dp.toPx()),
                )
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            for (i in 0 until weekdays.length()) {
                val w = weekdays.getJSONObject(i)
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
                    Text(w.optInt("visitDays").toString(), style = OpType.Meta, color = p.ink2)
                    Text(w.optString("label"), style = OpType.Meta, color = p.ink3)
                }
            }
        }
    }
}

@Composable
private fun YearStatsCard(data: JSONObject) {
    val p = LocalOpPalette.current
    Column(
        Modifier
            .fillMaxWidth()
            .clip(OpShape.Card)
            .background(p.surface)
            .padding(16.dp),
    ) {
        StatRow("Usual arrival", data.optString("usualArrival").takeIf { it.isNotBlank() && it != "null" })
        StatRow("Usual leaving", data.optString("usualLeaving").takeIf { it.isNotBlank() && it != "null" })
        val avg = data.optDouble("averageHoursPerVisitDay", 0.0)
        StatRow(
            "Average hours per visit day",
            if (avg > 0) formatHoursLabel(avg) else null,
        )
        StatRow(
            "Days with 2 or more offices",
            data.optInt("multiOfficeDays").toString(),
        )
        val req = data.optInt("correctionRequests")
        val approved = data.optInt("correctionApproved")
        if (req > 0) {
            StatRow(
                "Correction requests",
                "$req sent, $approved approved",
            )
        }
        val edited = data.optInt("adminEditedDays")
        if (edited > 0) {
            StatRow("Days edited by an admin", edited.toString())
        }
    }
}

@Composable
private fun StatRow(label: String, value: String?) {
    val p = LocalOpPalette.current
    if (value.isNullOrBlank()) return
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = OpType.Body, color = p.ink2)
        Text(value, style = OpType.Body, color = p.ink, fontWeight = FontWeight.SemiBold)
    }
}

private fun yearsFrom(data: JSONObject?): List<Int> {
    val arr = data?.optJSONArray("yearsWithData") ?: return emptyList()
    return (0 until arr.length()).map { arr.getInt(it) }
}

private fun formatHoursLabel(hours: Double): String {
    val mins = (hours * 60).toInt().coerceAtLeast(0)
    return "${mins / 60} h ${mins % 60} m"
}
