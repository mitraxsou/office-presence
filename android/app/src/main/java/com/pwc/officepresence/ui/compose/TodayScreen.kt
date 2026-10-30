package com.pwc.officepresence.ui.compose

import android.Manifest
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.widget.Toast
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
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.window.Dialog
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.DebugTrace
import com.pwc.officepresence.data.Office
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.data.ok
import com.pwc.officepresence.notify.DailySummaryWorker
import com.pwc.officepresence.presence.GeofenceHelper
import com.pwc.officepresence.ui.PointsFormat
import com.pwc.officepresence.ui.theme.LocalOpPalette
import com.pwc.officepresence.ui.theme.OpColor
import com.pwc.officepresence.ui.theme.OpShape
import com.pwc.officepresence.ui.theme.OpType
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlin.concurrent.thread

private data class TodayVisitRow(
    val officeName: String,
    val timeLabel: String,
    val durationLabel: String,
    val stillIn: Boolean,
)

@Composable
fun TodayScreen(
    repo: PresenceRepository,
    prefs: AppPrefs,
    onRequestPermissions: () -> Unit,
    onForceDetect: ((String) -> Unit) -> Unit,
    onOpenColleagues: () -> Unit = {},
    onOpenMonth: () -> Unit = {},
    onUnauthorized: () -> Unit = {},
) {
    val p = LocalOpPalette.current
    val ctx = LocalContext.current
    val main = remember { Handler(Looper.getMainLooper()) }
    var state by remember { mutableStateOf(repo.cached()) }
    var loading by remember { mutableStateOf(true) }
    var checking by remember { mutableStateOf(false) }
    var peersIn by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var visitRows by remember { mutableStateOf<List<TodayVisitRow>>(emptyList()) }
    var tick by remember { mutableStateOf(0) }
    var fixing by remember { mutableStateOf(false) }
    var editedToday by remember { mutableStateOf(false) }

    val fineOk = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
    val bgOk = if (android.os.Build.VERSION.SDK_INT >= 29) {
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_BACKGROUND_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
    } else true
    val needsPerms = !fineOk || !bgOk

    LaunchedEffect(Unit) {
        thread {
            val zone = try { ZoneId.of(prefs.timezone) } catch (_: Exception) { ZoneId.of("Asia/Kolkata") }
            val day = LocalDate.now(zone).toString()
            val corr = runCatching { repo.api.listCorrections(day.take(7)) }.getOrNull()
            val arr = corr?.optJSONArray("requests") ?: return@thread
            // #region agent log
            val correctionSummary = (0 until arr.length()).joinToString(";") { i ->
                val row = arr.getJSONObject(i)
                "${row.optString("dayKey")}:${row.optString("status")}:${row.optString("issue")}"
            }
            DebugTrace.write(
                "H4",
                "TodayScreen.kt:111",
                "correction requests for month",
                mapOf("count" to arr.length(), "rows" to correctionSummary.take(500)),
            )
            // #endregion
            var edited = false
            for (i in 0 until arr.length()) {
                val row = arr.getJSONObject(i)
                if (row.optString("dayKey") == day && row.optString("status") == "auto_approved") edited = true
            }
            if (edited) main.post { editedToday = true }
        }
    }

    LaunchedEffect(Unit) {
        thread {
            val s = repo.uploadAndSync()
            if (s.unauthorized) {
                main.post { onUnauthorized() }
                return@thread
            }
            if (s.ok) {
                com.pwc.officepresence.ui.analytics.OpAnalytics.log(ctx, "sync_completed")
                DailySummaryWorker.schedule(ctx)
                com.pwc.officepresence.notify.SyncRefreshWorker.schedule(ctx)
                GeofenceHelper.registerAll(ctx, prefs.offices())
                com.pwc.officepresence.notify.FcmTokenSync.refreshAndUpload(ctx)
            } else {
                com.pwc.officepresence.ui.analytics.OpAnalytics.log(
                    ctx,
                    "sync_failed",
                    mapOf("reason" to (s.message?.take(40) ?: "unknown")),
                )
            }
            var peers: List<JSONObject> = emptyList()
            if (prefs.sharePresenceWithPeers) {
                val res = runCatching { repo.api.peers() }.getOrNull()
                if (res?.optBoolean("optedIn") == true) {
                    val arr = res.optJSONArray("peers")
                    if (arr != null) {
                        peers = (0 until arr.length()).map { arr.getJSONObject(it) }
                            .filter { it.optBoolean("inOffice") }
                    }
                }
            }
            val visits = parseTodayVisits(
                prefs.cachedTodayOfficesJson,
                s.inOffice,
                s.officeName,
                prefs.timezone,
                prefs.gapMinutes,
                prefs.sampleIntervalMinutes,
            )
            main.post {
                state = s
                visitRows = visits
                peersIn = peers
                loading = false
            }
        }
    }

    LaunchedEffect(tick) {
        kotlinx.coroutines.delay(30_000)
        tick += 1
    }

    val updatedMeta = when {
        loading -> "Checking location"
        prefs.isViewAsActive -> {
            val first = prefs.viewAsTargetName.split(" ").firstOrNull().orEmpty()
            val whose = if (first.isNotBlank()) "${first}'s data" else "Viewed data"
            "$whose, ${OpFormat.updatedAgo(prefs.lastSyncAtMs).replace("Updated ", "").lowercase(java.util.Locale.US)}"
        }
        else -> OpFormat.updatedAgo(prefs.lastSyncAtMs)
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
    ) {
        Wordmark(Modifier.fillMaxWidth())
        Spacer(Modifier.height(16.dp))
        if (!loading || state.ok) {
            Text(
                OpFormat.greetingLine(
                    prefs.preferredName,
                    prefs.firstName,
                    prefs.displayName,
                    prefs.email,
                    prefs.timezone,
                ),
                style = OpType.Label.copy(fontSize = 22.sp, fontWeight = FontWeight.SemiBold),
                color = p.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                OpFormat.todayDateLabel(prefs.timezone),
                style = OpType.Meta,
                color = p.ink2,
                modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        } else {
            Spacer(Modifier.height(4.dp))
        }

        when {
            loading && !state.ok -> TodaySkeleton()
            needsPerms && !prefs.isViewAsActive -> {
                PermissionsBlock(onRequestPermissions)
                Spacer(Modifier.height(16.dp))
                CompactMonthProgress(
                    current = state.monthPoints,
                    target = state.pointsTarget,
                    visitDays = state.monthVisitDays,
                    onClick = onOpenMonth,
                )
            }
            else -> {
                StatusHero(
                    inOffice = state.inOffice,
                    officeName = state.officeName,
                    forSinceLabel = OpFormat.forSinceLabel(state.sinceAt, prefs.timezone),
                    lastInOffice = prefs.lastOfficeName.takeIf { it.isNotBlank() },
                    updatedLabel = updatedMeta,
                    fenceRadiusMeters = prefs.fenceRadius.toInt().coerceAtLeast(1),
                )
                Spacer(Modifier.height(16.dp))
                TodayPointsCard(
                    pointsToday = state.pointsToday,
                    visits = visitRows,
                    hoursToday = state.hoursToday,
                    advised = prefs.dayHours.toDouble(),
                    edited = editedToday,
                    onFix = { fixing = true },
                )
                Spacer(Modifier.height(8.dp))
                CompactMonthProgress(
                    current = state.monthPoints,
                    target = state.pointsTarget,
                    visitDays = state.monthVisitDays,
                    onClick = onOpenMonth,
                )
                Spacer(Modifier.height(24.dp))
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (prefs.sharePresenceWithPeers && peersIn.isNotEmpty()) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .weight(1f, fill = false)
                                .clickable(onClick = onOpenColleagues)
                                .padding(end = 12.dp),
                        ) {
                            peersIn.take(3).forEachIndexed { i, peer ->
                                val name = peer.optString("name").ifBlank { peer.optString("email") }
                                Box(Modifier.padding(start = if (i == 0) 0.dp else (-8).dp)) {
                                    AvatarCircle(name, size = 32.dp)
                                }
                            }
                            Spacer(Modifier.width(8.dp))
                            Text(
                                "${peersIn.size} colleagues In",
                                style = OpType.Label,
                                color = p.ink2,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    } else {
                        Text(
                            "No colleagues In right now",
                            style = OpType.Label,
                            color = p.ink2,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier
                                .weight(1f)
                                .padding(end = 12.dp),
                        )
                    }
                    val checkEnabled = !checking && !prefs.isViewAsReadonly
                    Column(horizontalAlignment = Alignment.End) {
                        OpSecondaryButton(
                            label = if (checking) "Checking..." else "Check now",
                            onClick = {
                                checking = true
                                onForceDetect {
                                    checking = false
                                    state = repo.cached()
                                    visitRows = parseTodayVisits(
                                        prefs.cachedTodayOfficesJson,
                                        state.inOffice,
                                        state.officeName,
                                        prefs.timezone,
                                        prefs.gapMinutes,
                                        prefs.sampleIntervalMinutes,
                                    )
                                }
                            },
                            enabled = checkEnabled,
                            leadingIcon = Icons.Outlined.Sync,
                            modifier = Modifier.wrapContentWidth(),
                        )
                        if (prefs.isViewAsReadonly) {
                            Text(
                                "Not available while viewing as ${prefs.viewAsTargetName.ifBlank { "user" }}.",
                                style = OpType.Meta,
                                color = p.ink3,
                                modifier = Modifier.padding(top = 6.dp),
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
        }
    }
    if (fixing) {
        FixTodayDialog(
            repo = repo,
            prefs = prefs,
            onClose = { fixing = false },
            onSaved = { message ->
                fixing = false
                editedToday = true
                Toast.makeText(ctx, message, Toast.LENGTH_LONG).show()
            },
        )
    }
}

@Composable
private fun TodayPointsCard(
    pointsToday: Int,
    visits: List<TodayVisitRow>,
    hoursToday: Double,
    advised: Double,
    edited: Boolean,
    onFix: () -> Unit,
) {
    val p = LocalOpPalette.current
    OpCard {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Today", style = OpType.Label, color = p.ink)
            Spacer(Modifier.width(12.dp))
            Text(
                "Fix today",
                style = OpType.Label,
                color = p.ink,
                textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline,
                modifier = Modifier.clickable(onClick = onFix),
            )
            Spacer(Modifier.weight(1f))
            Text(
                if (pointsToday == 1) "1 point" else "$pointsToday points",
                style = OpType.Heading,
                color = p.ink,
            )
        }
        Text(
            "Earned today",
            style = OpType.Meta,
            color = p.ink3,
            modifier = Modifier.padding(top = 2.dp, bottom = 12.dp),
        )
        if (edited) {
            Text("Edited by you", style = OpType.Meta, color = OpColor.Accent, modifier = Modifier.padding(bottom = 8.dp))
        }
        if (visits.isEmpty()) {
            Text(
                "No visits yet today. Points appear when you arrive at an office.",
                style = OpType.Body,
                color = p.ink2,
            )
        } else {
            visits.forEachIndexed { i, row ->
                if (i > 0) DividerLine()
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top,
                ) {
                    Column(Modifier.weight(1f).padding(end = 12.dp)) {
                        Text(row.officeName, style = OpType.Label.copy(fontWeight = FontWeight.SemiBold), color = p.ink)
                        Text(
                            if (row.stillIn) "${row.timeLabel}, still In" else row.timeLabel,
                            style = OpType.Meta,
                            color = p.ink2,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                    }
                    Text(row.durationLabel, style = OpType.Label, color = p.ink2)
                }
            }
        }
        HoursFyiRow(hoursToday, advised)
    }
}

@Composable
private fun PermissionsBlock(onRequestPermissions: () -> Unit) {
    val p = LocalOpPalette.current
    Column(
        Modifier
            .fillMaxWidth()
            .clip(OpShape.Card)
            .background(OpColor.AccentWash)
            .padding(20.dp),
    ) {
        Text("Turn on location", style = OpType.Title.copy(fontSize = 24.sp), color = p.ink)
        Text(
            "Visits are not being counted. Office Presence needs location set to \"Allow all the time\" to know when you are In.",
            style = OpType.Body,
            color = p.ink2,
            modifier = Modifier.padding(top = 8.dp),
        )
        Spacer(Modifier.height(16.dp))
        listOf(
            "Open location settings",
            "Choose \"Allow all the time\"",
            "Come back here",
        ).forEachIndexed { i, line ->
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 6.dp)) {
                Box(
                    Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .background(p.surface),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("${i + 1}", fontWeight = FontWeight.Bold, color = p.ink)
                }
                Spacer(Modifier.width(12.dp))
                Text(line, style = OpType.Body, color = p.ink)
            }
        }
        Spacer(Modifier.height(16.dp))
        OpPrimaryButton(label = "Allow location", onClick = onRequestPermissions)
    }
}

/** Flatten sync todayOffices into per-visit rows for the Today card. */
private fun parseTodayVisits(
    json: String,
    inOffice: Boolean,
    officeName: String?,
    tz: String,
    gapMinutes: Int,
    sampleIntervalMinutes: Int,
): List<TodayVisitRow> {
    return try {
        val officesArr = JSONArray(json)
        if (officesArr.length() == 0) {
            // #region agent log
            DebugTrace.write(
                "H3",
                "TodayScreen.kt:464",
                "today offices cache empty",
                mapOf("jsonLength" to json.length, "inOffice" to inOffice),
            )
            // #endregion
            return emptyList()
        }
        val rows = mutableListOf<TodayVisitRow>()
        for (oi in 0 until officesArr.length()) {
            val o = officesArr.getJSONObject(oi)
            val name = o.optString("name").ifBlank { "Office" }
            val visits = o.optJSONArray("visits") ?: continue
            val gapMs = (gapMinutes.coerceAtLeast(1) + sampleIntervalMinutes.coerceAtLeast(0)) * 60_000L
            var segIn = ""
            var segOut = ""
            fun flush(last: Boolean) {
                if (segIn.isBlank()) return
                val stillIn = last && inOffice && oi == officesArr.length() - 1 &&
                    (officeName == null || name == officeName)
                val inMs = runCatching { java.time.Instant.parse(segIn).toEpochMilli() }.getOrDefault(0L)
                val outMs = runCatching { java.time.Instant.parse(segOut).toEpochMilli() }.getOrDefault(inMs)
                val spanMin = ((outMs - inMs).coerceAtLeast(0L) / 60_000L).toInt()
                val timeLabel = if (stillIn) {
                    OpFormat.fmtTime(segIn, tz)
                } else {
                    "${OpFormat.fmtTime(segIn, tz)} to ${OpFormat.fmtTime(segOut, tz)}"
                }
                rows += TodayVisitRow(
                    officeName = name,
                    timeLabel = timeLabel,
                    durationLabel = OpFormat.durationHm(spanMin / 60.0),
                    stillIn = stillIn,
                )
                segIn = ""
                segOut = ""
            }
            for (vi in 0 until visits.length()) {
                val v = visits.getJSONObject(vi)
                val inAt = v.optString("in_at")
                val outAt = v.optString("out_at")
                val inMs = runCatching { java.time.Instant.parse(inAt).toEpochMilli() }.getOrDefault(0L)
                val prevOutMs = runCatching { java.time.Instant.parse(segOut).toEpochMilli() }.getOrDefault(0L)
                val bridged = segIn.isNotBlank() && inMs > 0L && prevOutMs > 0L && inMs - prevOutMs <= gapMs
                if (!bridged) flush(last = false)
                if (segIn.isBlank()) segIn = inAt
                segOut = outAt
            }
            flush(last = true)
        }
        // #region agent log
        DebugTrace.write(
            "H3",
            "TodayScreen.kt:491",
            "today visits parsed for display",
            mapOf("todayOfficeCount" to officesArr.length(), "visitRowCount" to rows.size, "inOffice" to inOffice),
        )
        // #endregion
        rows
    } catch (e: Exception) {
        // #region agent log
        DebugTrace.write(
            "H3",
            "TodayScreen.kt:500",
            "today visits failed to parse",
            mapOf("errorType" to (e::class.simpleName ?: "unknown"), "jsonLength" to json.length),
        )
        // #endregion
        emptyList()
    }
}

@Composable
private fun TodaySkeleton() {
    val p = LocalOpPalette.current
    Column {
        SkeletonBar(Modifier.fillMaxWidth(0.55f), height = 56.dp)
        Spacer(Modifier.height(12.dp))
        SkeletonBar(Modifier.fillMaxWidth(0.7f), height = 18.dp)
        Spacer(Modifier.height(8.dp))
        SkeletonBar(Modifier.fillMaxWidth(0.5f), height = 14.dp)
        Spacer(Modifier.height(20.dp))
        Column(
            Modifier
                .fillMaxWidth()
                .clip(OpShape.Card)
                .background(p.surface)
                .border(1.dp, p.line, OpShape.Card)
                .padding(16.dp),
        ) {
            SkeletonBar(Modifier.fillMaxWidth(0.3f), height = 12.dp)
            Spacer(Modifier.height(12.dp))
            SkeletonBar(Modifier.fillMaxWidth(0.5f), height = 36.dp)
            Spacer(Modifier.height(12.dp))
            SkeletonBar(Modifier.fillMaxWidth(), height = 10.dp)
        }
        Spacer(Modifier.height(32.dp))
        Text(
            "Getting your latest status. This usually takes a few seconds.",
            style = OpType.Meta,
            color = p.ink3,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

private fun fragmentsFromTodayOffices(json: String, offices: List<Office>): List<VisitFragment> {
    return try {
        val arr = JSONArray(json)
        val out = mutableListOf<VisitFragment>()
        for (i in 0 until arr.length()) {
            val group = arr.getJSONObject(i)
            val name = group.optString("name").ifBlank { "Office" }
            val rawId = group.optString("office_id")
            val officeId = rawId.takeIf { it.isNotBlank() && it != "unknown" && it != "null" }
                ?: offices.firstOrNull { it.displayName == name || it.adminName == name }?.id
                ?: ""
            val visits = group.optJSONArray("visits") ?: continue
            for (v in 0 until visits.length()) {
                val visit = visits.getJSONObject(v)
                val inMs = parseIsoMs(visit.optString("in_at")) ?: continue
                val outMs = parseIsoMs(visit.optString("out_at")) ?: inMs
                out += VisitFragment(officeId, name, inMs, outMs)
            }
        }
        out
    } catch (_: Exception) {
        emptyList()
    }
}

@Composable
private fun FixTodayDialog(
    repo: PresenceRepository,
    prefs: AppPrefs,
    onClose: () -> Unit,
    onSaved: (String) -> Unit,
) {
    val p = LocalOpPalette.current
    val ctx = LocalContext.current
    val main = remember { Handler(Looper.getMainLooper()) }
    val offices = remember { prefs.offices() }
    val zone = remember {
        try { ZoneId.of(prefs.timezone) } catch (_: Exception) { ZoneId.of("Asia/Kolkata") }
    }
    val dayKey = remember { LocalDate.now(zone).toString() }
    val nowHm = remember {
        val n = ZonedDateTime.now(zone)
        formatHm(n.hour, n.minute)
    }
    val gapMinutes = remember { editorGapMinutes(prefs.gapMinutes) }
    val loaded = remember {
        val fragments = fragmentsFromTodayOffices(prefs.cachedTodayOfficesJson, offices)
        val stays = mergeVisitFragments(
            fragments,
            gapMinutes,
            ZonedDateTime.now(zone).toInstant().toEpochMilli(),
            prefs.cachedInOffice,
            prefs.cachedOfficeName.ifBlank { null },
        )
        // #region agent log
        DebugTrace.write(
            "H4",
            "TodayScreen.kt:fix",
            "merged today visits for edit",
            mapOf("raw" to fragments.size, "merged" to stays.size, "gapMinutes" to gapMinutes),
        )
        // #endregion
        fragments.size to stays
    }
    val caption = remember { mergeCaption(loaded.first, loaded.second.size, gapMinutes) }
    var rows by remember {
        mutableStateOf(
            if (loaded.second.isEmpty()) {
                listOf(defaultFixVisit(offices, nowHm))
            } else {
                loaded.second.map { stay ->
                    FixVisit(
                        officeId = stay.officeId,
                        officeName = stay.officeName,
                        inHm = localHm(stay.inMs, zone),
                        outHm = localHm(stay.outMs, zone),
                        stillIn = stay.stillIn,
                    )
                }
            },
        )
    }
    var reason by remember { mutableStateOf("") }
    var button by remember { mutableStateOf("Save changes") }
    var note by remember { mutableStateOf("Applies right away. Admins can see this change.") }
    var effect by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var clock by remember { mutableStateOf<Pair<Int, String>?>(null) }
    var officePicker by remember { mutableStateOf<Int?>(null) }

    fun iso(hm: String): String? {
        val (h, m) = parseHmStrict(hm) ?: return null
        return ZonedDateTime.of(LocalDate.parse(dayKey), LocalTime.of(h, m), zone).toInstant().toString()
    }

    LaunchedEffect(rows) {
        val first = rows.firstOrNull() ?: return@LaunchedEffect
        thread {
            val inAt = iso(first.inHm) ?: return@thread
            val outAt = if (first.stillIn) null else iso(first.outHm) ?: return@thread
            val officeIds = rows.map { it.officeId }.filter { it.isNotBlank() }.distinct()
            val res = runCatching {
                repo.api.previewCorrection(
                    day = dayKey,
                    officeId = first.officeId,
                    inAt = inAt,
                    outAt = outAt,
                    stillIn = first.stillIn,
                    surface = "today",
                    officeIds = officeIds,
                )
            }.getOrNull()
            main.post {
                if (res?.ok() == true) {
                    button = res.optString("button").ifBlank { "Save changes" }
                    val reasonText = res.optString("reason")
                    note = if (res.optString("outcome") == "pending" && reasonText.isNotBlank()) {
                        reasonText
                    } else {
                        "Applies right away. Admins can see this change."
                    }
                    val after = res.optJSONObject("effect")?.optInt("days_after", -1) ?: -1
                    effect = if (after >= 0) "Month would be $after points." else ""
                } else if (res?.optInt("_httpStatus") == 400) {
                    note = res.optString("error").takeIf { it.isNotBlank() } ?: note
                }
            }
        }
    }

    Dialog(onDismissRequest = { if (!busy) onClose() }) {
        Column(
            Modifier
                .fillMaxWidth()
                .clip(OpShape.Card)
                .background(p.surface)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            Text("Fix today", style = OpType.Title, color = p.ink)
            Text(dayKey, style = OpType.Meta, color = p.ink2, modifier = Modifier.padding(top = 4.dp))
            Text(caption, style = OpType.Meta, color = p.ink3, modifier = Modifier.padding(top = 4.dp, bottom = 12.dp))
            rows.forEachIndexed { index, row ->
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(bottom = 10.dp)
                        .clip(OpShape.Card)
                        .background(p.sunk)
                        .padding(12.dp),
                ) {
                    Text("Office", style = OpType.Meta, color = p.ink3)
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .padding(top = 4.dp, bottom = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(row.officeName, style = OpType.Body, color = p.ink, modifier = Modifier.weight(1f))
                        Text(
                            "Change office",
                            style = OpType.Label,
                            color = p.ink,
                            modifier = Modifier.clickable {
                                // #region agent log
                                DebugTrace.write(
                                    "H7",
                                    "TodayScreen.kt:changeOffice",
                                    "change office tapped",
                                    mapOf(
                                        "row" to (index + 1),
                                        "officeCount" to offices.size,
                                        "fromId" to row.officeId,
                                        "fromName" to row.officeName,
                                        "known" to offices.any { it.id == row.officeId },
                                        "names" to offices.joinToString(",") { it.displayName }.take(200),
                                    ),
                                )
                                // #endregion
                                when (offices.size) {
                                    0 -> Toast.makeText(ctx, "No offices are on this phone. Sync, then try again.", Toast.LENGTH_LONG).show()
                                    1 -> Toast.makeText(ctx, "Only one office is available.", Toast.LENGTH_SHORT).show()
                                    else -> officePicker = index
                                }
                            },
                        )
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(Modifier.weight(1f)) {
                            ClockTimeField("In", row.inHm) { clock = index to "in" }
                        }
                        Box(Modifier.weight(1f)) {
                            if (row.stillIn) {
                                Column {
                                    Text("Out", style = OpType.Meta, color = p.ink3)
                                    Spacer(Modifier.height(6.dp))
                                    Text("Still In", style = OpType.Body, color = p.ink, modifier = Modifier.padding(top = 14.dp))
                                }
                            } else {
                                ClockTimeField("Out", row.outHm) { clock = index to "out" }
                            }
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 8.dp)) {
                        Text("Still In", style = OpType.Meta, color = p.ink2, modifier = Modifier.weight(1f))
                        Switch(
                            checked = row.stillIn,
                            onCheckedChange = { on ->
                                rows = rows.toMutableList().also { it[index] = row.copy(stillIn = on) }
                            },
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = p.surface,
                                checkedTrackColor = OpColor.Accent,
                                uncheckedThumbColor = p.surface,
                                uncheckedTrackColor = p.ink3,
                            ),
                        )
                    }
                    Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        if (!row.stillIn) {
                            Text(
                                "Split visit",
                                style = OpType.Label,
                                color = p.ink,
                                modifier = Modifier.clickable {
                                    val mid = splitHm(row.inHm, row.outHm)
                                    if (mid == null) {
                                        Toast.makeText(ctx, "This visit is too short to split", Toast.LENGTH_SHORT).show()
                                    } else {
                                        val next = rows.toMutableList()
                                        next[index] = row.copy(outHm = mid, stillIn = false)
                                        next.add(
                                            index + 1,
                                            row.copy(inHm = mid, outHm = row.outHm, stillIn = false),
                                        )
                                        rows = next
                                    }
                                },
                            )
                        }
                        Text(
                            "Remove visit",
                            style = OpType.Label,
                            color = p.ink,
                            modifier = Modifier.clickable { rows = rows.filterIndexed { i, _ -> i != index } },
                        )
                    }
                }
            }
            Text(
                "Add a visit",
                style = OpType.Label,
                color = p.ink,
                modifier = Modifier.clickable {
                    val office = offices.firstOrNull()
                    val previous = rows.lastOrNull()
                    val start = when {
                        previous == null -> "09:00"
                        previous.stillIn -> previous.inHm
                        else -> previous.outHm
                    }
                    val startMin = hmToMinutes(start) ?: 9 * 60
                    val nowMin = hmToMinutes(nowHm) ?: startMin
                    val outOk = nowMin > startMin
                    rows = rows + FixVisit(
                        officeId = previous?.officeId ?: office?.id.orEmpty(),
                        officeName = previous?.officeName ?: office?.displayName ?: "Office",
                        inHm = start,
                        outHm = if (outOk) nowHm else start,
                        stillIn = !outOk,
                    )
                },
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it.take(200) },
                label = { Text("Reason") },
                modifier = Modifier.fillMaxWidth(),
            )
            if (effect.isNotBlank()) {
                Text(effect, style = OpType.Meta, color = p.ink2, modifier = Modifier.padding(top = 8.dp))
            }
            Text(note, style = OpType.Meta, color = p.ink2, modifier = Modifier.padding(top = 8.dp, bottom = 12.dp))
            OpPrimaryButton(
                label = if (busy) "Sending..." else button,
                enabled = !busy && reason.isNotBlank() && !prefs.isViewAsReadonly,
                onClick = {
                    val payload = buildFixTodayBody(dayKey, reason, rows, zone)
                    if (payload is FixTodayPayload.Invalid) {
                        val row = rows.getOrNull(payload.row - 1)
                        // #region agent log
                        DebugTrace.write(
                            "H4",
                            "TodayScreen.kt:validate",
                            "fix today row failed validation",
                            mapOf(
                                "row" to payload.row,
                                "message" to payload.message,
                                "inHm" to (row?.inHm ?: ""),
                                "outHm" to (row?.outHm ?: ""),
                                "stillIn" to (row?.stillIn ?: false),
                            ),
                        )
                        // #endregion
                        Toast.makeText(ctx, "Visit ${payload.row}: ${payload.message}", Toast.LENGTH_LONG).show()
                    } else if (payload is FixTodayPayload.Ready) {
                    busy = true
                    thread {
                        val body = payload.body
                        // #region agent log
                        DebugTrace.write(
                            "H4",
                            "TodayScreen.kt:submit",
                            "fix today submit times",
                            mapOf(
                                "visitCount" to (body.optJSONObject("requested")?.optJSONArray("visits")?.length() ?: 0),
                                "inAt" to (body.optJSONObject("requested")?.optString("in_at") ?: ""),
                                "remove" to (body.optJSONObject("requested")?.optBoolean("remove") ?: false),
                            ),
                        )
                        // #endregion
                        val res = runCatching { repo.api.submitCorrection(body) }.getOrNull()
                        // #region agent log
                        val sentVisits = body.optJSONObject("requested")?.optJSONArray("visits")
                        val storedReq = res?.optJSONObject("request")?.optJSONObject("requested")
                        DebugTrace.write(
                            "H5",
                            "TodayScreen.kt:submitResult",
                            "fix today server answer",
                            mapOf(
                                "httpStatus" to (res?.optInt("_httpStatus") ?: -1),
                                "outcome" to (res?.optString("outcome") ?: ""),
                                "error" to (res?.optString("error") ?: ""),
                                "sentVisits" to (sentVisits?.length() ?: 0),
                                "sentOffices" to (sentVisits?.let { a -> (0 until a.length()).joinToString(",") { a.getJSONObject(it).optString("office_id") } } ?: ""),
                                "storedVisits" to (storedReq?.optJSONArray("visits")?.length() ?: if (storedReq?.has("in_at") == true) 1 else 0),
                                "storedOffice" to (storedReq?.optString("office_id") ?: ""),
                            ),
                        )
                        // #endregion
                        main.post {
                            busy = false
                            if (res?.ok() == true) {
                                val msg = if (res.optString("outcome") == "auto_approved") {
                                    "Today updated. Admins can see this change."
                                } else {
                                    "Sent for approval."
                                }
                                onSaved(msg)
                            } else {
                                Toast.makeText(
                                    ctx,
                                    res?.optString("error")?.takeIf { it.isNotBlank() } ?: "Could not save",
                                    Toast.LENGTH_LONG,
                                ).show()
                            }
                        }
                    }
                    }
                },
            )
            TextButton(onClick = { if (!busy) onClose() }, modifier = Modifier.padding(top = 4.dp)) {
                Text("Cancel", color = p.ink2)
            }
        }
    }

    val picking = officePicker
    if (picking != null) {
        OfficePickDialog(
            offices = offices,
            selectedId = rows.getOrNull(picking)?.officeId.orEmpty(),
            onPick = { office ->
                rows = rows.toMutableList().also { list ->
                    val row = list.getOrNull(picking) ?: return@also
                    list[picking] = row.copy(officeId = office.id, officeName = office.displayName)
                }
                officePicker = null
            },
            onClose = { officePicker = null },
        )
    }

    val pick = clock
    if (pick != null && rows.getOrNull(pick.first) != null) {
        val row = rows[pick.first]
        val which = pick.second
        OpClockDialog(
            title = if (which == "in") "In" else "Out",
            initialHm = if (which == "in") row.inHm else row.outHm,
            confirmLabel = if (which == "in") "Set In time" else "Set Out time",
            previousHm = if (which == "in") row.outHm else row.inHm,
            blockFuture = true,
            onDismiss = { clock = null },
            onConfirm = { hm ->
                if (parseHmStrict(hm) == null) {
                    clock = null
                    return@OpClockDialog
                }
                rows = rows.toMutableList().also {
                    it[pick.first] = if (which == "in") row.copy(inHm = hm) else row.copy(outHm = hm)
                }
                clock = null
            },
        )
    }
}

@Composable
fun OfficePickDialog(
    offices: List<Office>,
    selectedId: String,
    onPick: (Office) -> Unit,
    onClose: () -> Unit,
) {
    val p = LocalOpPalette.current
    Dialog(onDismissRequest = onClose) {
        Column(
            Modifier
                .fillMaxWidth()
                .clip(OpShape.Card)
                .background(p.surface)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            Text("Choose an office", style = OpType.Title, color = p.ink)
            Spacer(Modifier.height(8.dp))
            offices.forEach { office ->
                val selected = office.id == selectedId
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp)
                        .clip(OpShape.Input)
                        .border(if (selected) 2.dp else 1.dp, if (selected) p.ink else p.line, OpShape.Input)
                        .clickable { onPick(office) }
                        .padding(12.dp),
                ) {
                    Text(office.displayName, style = OpType.Body, color = p.ink)
                    Text(
                        PointsFormat.countsAs(office.pointsPerVisitDay),
                        style = OpType.Meta,
                        color = p.ink3,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }
            TextButton(onClick = onClose) { Text("Cancel", color = p.ink2) }
        }
    }
}

private fun defaultFixVisit(offices: List<Office>, nowHm: String): FixVisit {
    val nowMin = hmToMinutes(nowHm) ?: (9 * 60)
    val inMin = if (nowMin > 9 * 60) 9 * 60 else (nowMin - 60).coerceAtLeast(0)
    val office = offices.firstOrNull()
    return FixVisit(
        officeId = office?.id.orEmpty(),
        officeName = office?.displayName ?: "Office",
        inHm = "%02d:%02d".format(inMin / 60, inMin % 60),
        outHm = nowHm,
        stillIn = nowMin <= inMin,
    )
}
