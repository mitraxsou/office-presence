package com.pwc.officepresence.ui.compose

import android.Manifest
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
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
import androidx.compose.material3.Text
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
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.data.ok
import com.pwc.officepresence.notify.DailySummaryWorker
import com.pwc.officepresence.presence.GeofenceHelper
import com.pwc.officepresence.ui.theme.LocalOpPalette
import com.pwc.officepresence.ui.theme.OpColor
import com.pwc.officepresence.ui.theme.OpShape
import com.pwc.officepresence.ui.theme.OpType
import org.json.JSONArray
import org.json.JSONObject
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

    val fineOk = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
    val bgOk = if (android.os.Build.VERSION.SDK_INT >= 29) {
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_BACKGROUND_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
    } else true
    val needsPerms = !fineOk || !bgOk

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
}

@Composable
private fun TodayPointsCard(
    pointsToday: Int,
    visits: List<TodayVisitRow>,
    hoursToday: Double,
    advised: Double,
) {
    val p = LocalOpPalette.current
    OpCard {
        Text(
            if (pointsToday == 1) "1 point" else "$pointsToday points",
            style = OpType.Number.copy(fontSize = 36.sp),
            color = p.ink,
        )
        Text(
            "Earned today",
            style = OpType.Meta,
            color = p.ink3,
            modifier = Modifier.padding(top = 2.dp, bottom = 12.dp),
        )
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
): List<TodayVisitRow> {
    return try {
        val officesArr = JSONArray(json)
        if (officesArr.length() == 0) return emptyList()
        val rows = mutableListOf<TodayVisitRow>()
        for (oi in 0 until officesArr.length()) {
            val o = officesArr.getJSONObject(oi)
            val name = o.optString("name").ifBlank { "Office" }
            val visits = o.optJSONArray("visits") ?: continue
            for (vi in 0 until visits.length()) {
                val v = visits.getJSONObject(vi)
                val inAt = v.optString("in_at")
                val outAt = v.optString("out_at")
                val mins = v.optInt("minutes", 0)
                val lastOffice = oi == officesArr.length() - 1
                val lastVisit = vi == visits.length() - 1
                val stillIn = inOffice && lastOffice && lastVisit &&
                    (officeName == null || name == officeName)
                val timeLabel = if (stillIn) {
                    OpFormat.fmtTime(inAt, tz)
                } else {
                    "${OpFormat.fmtTime(inAt, tz)} to ${OpFormat.fmtTime(outAt, tz)}"
                }
                rows += TodayVisitRow(
                    officeName = name,
                    timeLabel = timeLabel,
                    durationLabel = OpFormat.durationHm(mins / 60.0),
                    stillIn = stillIn,
                )
            }
        }
        rows
    } catch (_: Exception) {
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
