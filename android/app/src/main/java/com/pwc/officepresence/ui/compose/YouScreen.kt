package com.pwc.officepresence.ui.compose

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.pwc.officepresence.BuildConfig
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.Office
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.data.ok
import com.pwc.officepresence.ui.theme.LocalOpPalette
import com.pwc.officepresence.ui.theme.OpColor
import com.pwc.officepresence.ui.theme.OpShape
import com.pwc.officepresence.ui.theme.OpType
import org.json.JSONObject
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.concurrent.thread

private enum class YouSub { Main, Devices, Corrections, Notifications, Rules, Nicknames, Profile, ViewAs }

@Composable
fun YouScreen(
    repo: PresenceRepository,
    prefs: AppPrefs,
    onForceDetect: ((String) -> Unit) -> Unit,
    onOpenDeveloper: () -> Unit,
    onSignOut: () -> Unit,
    onUnauthorized: () -> Unit = {},
    onViewAsStarted: () -> Unit = {},
) {
    var sub by remember { mutableStateOf(YouSub.Main) }
    when (sub) {
        YouSub.Main -> YouMain(
            repo = repo,
            prefs = prefs,
            onDevices = { sub = YouSub.Devices },
            onCorrections = { sub = YouSub.Corrections },
            onNotifications = { sub = YouSub.Notifications },
            onRules = { sub = YouSub.Rules },
            onNicknames = { sub = YouSub.Nicknames },
            onProfile = { sub = YouSub.Profile },
            onViewAs = { sub = YouSub.ViewAs },
            onOpenDeveloper = onOpenDeveloper,
            onSignOut = onSignOut,
        )
        YouSub.Devices -> DevicesScreen(
            repo = repo,
            prefs = prefs,
            onBack = { sub = YouSub.Main },
            onForceDetect = onForceDetect,
            onUnauthorized = onUnauthorized,
        )
        YouSub.Corrections -> CorrectionsListScreen(repo = repo, prefs = prefs, onBack = { sub = YouSub.Main })
        YouSub.Notifications -> NotificationsScreen(repo = repo, prefs = prefs, onBack = { sub = YouSub.Main })
        YouSub.Rules -> RulesScreen(prefs = prefs, onBack = { sub = YouSub.Main })
        YouSub.Nicknames -> NicknamesScreen(repo = repo, prefs = prefs, onBack = { sub = YouSub.Main })
        YouSub.Profile -> ProfileScreen(repo = repo, prefs = prefs, onBack = { sub = YouSub.Main })
        YouSub.ViewAs -> ViewAsChooseScreen(
            repo = repo,
            prefs = prefs,
            onBack = { sub = YouSub.Main },
            onStarted = {
                sub = YouSub.Main
                onViewAsStarted()
            },
        )
    }
}

@Composable
private fun YouMain(
    repo: PresenceRepository,
    prefs: AppPrefs,
    onDevices: () -> Unit,
    onCorrections: () -> Unit,
    onNotifications: () -> Unit,
    onRules: () -> Unit,
    onNicknames: () -> Unit,
    onProfile: () -> Unit,
    onViewAs: () -> Unit,
    onOpenDeveloper: () -> Unit,
    onSignOut: () -> Unit,
) {
    val p = LocalOpPalette.current
    val ctx = LocalContext.current
    val main = remember { Handler(Looper.getMainLooper()) }
    var share by remember { mutableStateOf(prefs.sharePresenceWithPeers) }
    var deviceCount by remember { mutableIntStateOf(0) }
    var pendingCount by remember { mutableIntStateOf(0) }
    var versionTaps by remember { mutableIntStateOf(0) }
    var themePicker by remember { mutableStateOf(false) }
    var suggestOpen by remember { mutableStateOf(false) }
    var developerOn by remember { mutableStateOf(prefs.developerMode) }
    var developerConfirm by remember { mutableStateOf(false) }
    var developerBusy by remember { mutableStateOf(false) }
    val readonly = prefs.isViewAsReadonly

    fun openDeveloperTools() {
        if (readonly) {
            Toast.makeText(ctx, "Not available while viewing as another user.", Toast.LENGTH_SHORT).show()
            return
        }
        if (developerOn || prefs.developerMode) {
            onOpenDeveloper()
            return
        }
        developerConfirm = true
    }

    fun enableDeveloperAndOpen() {
        if (developerBusy) return
        developerBusy = true
        thread {
            val res = runCatching { repo.api.setDeveloper(true) }.getOrNull()
            main.post {
                developerBusy = false
                if (res?.ok() == true || res?.optBoolean("developerMode") == true) {
                    prefs.developerMode = true
                    developerOn = true
                    developerConfirm = false
                    onOpenDeveloper()
                } else {
                    Toast.makeText(
                        ctx,
                        res?.optString("error")?.takeIf { it.isNotBlank() } ?: "Could not turn on Developer",
                        Toast.LENGTH_SHORT,
                    ).show()
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        thread {
            val devices = runCatching { repo.api.devices() }.getOrNull()
            val corr = runCatching { repo.api.listCorrections() }.getOrNull()
            val profile = runCatching { repo.api.getProfile() }.getOrNull()?.optJSONObject("profile")
            val dCount = devices?.optJSONArray("devices")?.length() ?: 0
            val pending = corr?.optJSONArray("requests")?.let { arr ->
                (0 until arr.length()).count { arr.getJSONObject(it).optString("status") == "pending" }
            } ?: 0
            main.post {
                deviceCount = dCount
                pendingCount = pending
                if (profile != null) repo.applyProfile(profile)
            }
        }
    }

    val name = prefs.displayName.ifBlank {
        OpFormat.colleagueDisplayName(
            prefs.colleagueDisplayMode,
            prefs.firstName,
            prefs.lastName,
            prefs.preferredName,
            OpFormat.nameFromEmail(prefs.email),
        )
    }
    val email = prefs.email.orEmpty()
    val roleLabel = if (prefs.role == "admin" && !prefs.isViewAsActive) ", Admin" else ""
    val trackingOk = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED && !prefs.isViewAsReadonly
    val (notifOn, notifTotal) = notificationChannelsOnCount(prefs)

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AvatarCircle(name, size = 56.dp)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(name, style = OpType.Heading, color = p.ink)
                Text("$email$roleLabel", style = OpType.Meta, color = p.ink2)
            }
            Text(
                "Profile >",
                style = OpType.Label,
                color = p.ink2,
                modifier = Modifier.clickable(onClick = onProfile),
            )
        }
        Spacer(Modifier.height(20.dp))
        OpCard {
            Row(
                Modifier.fillMaxWidth().padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Share my status", style = OpType.Body, color = p.ink)
                Switch(
                    checked = share,
                    onCheckedChange = { checked ->
                        if (readonly) return@Switch
                        share = checked
                        prefs.sharePresenceWithPeers = checked
                        thread { repo.api.setPrivacy(checked) }
                    },
                    enabled = !readonly,
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = p.surface,
                        checkedTrackColor = OpColor.Accent,
                        uncheckedThumbColor = p.surface,
                        uncheckedTrackColor = p.ink3,
                    ),
                )
            }
            DividerLine()
            Row(
                Modifier.fillMaxWidth().padding(vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Tracking", style = OpType.Body, color = p.ink, modifier = Modifier.weight(1f))
                Box(
                    Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(if (trackingOk) OpColor.Ok else p.ink3),
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    if (trackingOk) "On, ${OpFormat.syncedAgo(prefs.lastSyncAtMs).replace("Synced ", "synced ").replace("Last sync ", "synced ").lowercase(Locale.US)}"
                    else "Off",
                    style = OpType.Label,
                    color = p.ink2,
                )
            }
            DividerLine()
            SettingsRow(
                title = "Devices",
                value = if (deviceCount == 1) "1 phone" else "$deviceCount phones",
                onClick = onDevices,
            )
            DividerLine()
            SettingsRow(
                title = "Correction requests",
                value = if (pendingCount == 0) "None" else "$pendingCount pending",
                onClick = onCorrections,
            )
        }
        Spacer(Modifier.height(14.dp))
        OpCard {
            SettingsRow("Office nicknames", onClick = onNicknames)
            DividerLine()
            SettingsRow("Suggest an office", onClick = { suggestOpen = true })
            DividerLine()
            SettingsRow("Rules", value = "Read only", onClick = onRules)
            DividerLine()
            SettingsRow(
                title = "Theme",
                value = when (prefs.themeMode) {
                    "light" -> "Light"
                    "dark" -> "Dark"
                    else -> "System"
                },
                onClick = { themePicker = true },
            )
            DividerLine()
            SettingsRow(
                title = "Notifications",
                value = "$notifOn of $notifTotal on",
                onClick = onNotifications,
            )
            DividerLine()
            SettingsRow(
                title = "Developer",
                value = if (developerOn) "On" else "Off",
                onClick = { openDeveloperTools() },
            )
        }
        if (prefs.role == "admin" && !prefs.isViewAsActive) {
            Spacer(Modifier.height(20.dp))
            Text("Admin", style = OpType.Meta, color = p.ink3, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            OpCard {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable(onClick = onViewAs)
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("View as another user", style = OpType.Body, color = p.ink)
                        Text(
                            "Test the app as someone else on this phone",
                            style = OpType.Meta,
                            color = p.ink2,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                    }
                    Text(">", color = p.ink3)
                }
                DividerLine()
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable {
                            ctx.startActivity(
                                Intent(Intent.ACTION_VIEW, Uri.parse("https://office-presence-psi.vercel.app/admin/roster")),
                            )
                        }
                        .padding(vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Admin console", style = OpType.Body, color = p.ink, modifier = Modifier.weight(1f))
                    Icon(Icons.Outlined.OpenInNew, contentDescription = null, tint = p.ink3, modifier = Modifier.size(18.dp))
                }
            }
        }
        Spacer(Modifier.height(24.dp))
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "Version ${BuildConfig.VERSION_NAME}",
                style = OpType.Meta,
                color = p.ink3,
                modifier = Modifier.clickable {
                    versionTaps++
                    if (versionTaps >= 7) {
                        versionTaps = 0
                        openDeveloperTools()
                    }
                },
            )
            OpSecondaryButton("Sign out", onClick = onSignOut, modifier = Modifier.width(140.dp))
        }
    }

    if (developerConfirm) {
        AlertDialog(
            onDismissRequest = { if (!developerBusy) developerConfirm = false },
            title = { Text("Turn on Developer?") },
            text = {
                Text(
                    "Developer tools change how this phone samples location while testing. Turn it off when you are done.",
                    color = p.ink2,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = { enableDeveloperAndOpen() },
                    enabled = !developerBusy,
                ) {
                    Text(if (developerBusy) "Turning on..." else "Turn on")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { developerConfirm = false },
                    enabled = !developerBusy,
                ) { Text("Cancel") }
            },
        )
    }

    if (themePicker) {
        AlertDialog(
            onDismissRequest = { themePicker = false },
            title = { Text("Theme") },
            text = {
                Column {
                    listOf("system" to "Follow system", "light" to "Light", "dark" to "Dark").forEach { (id, label) ->
                        Text(
                            label,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    prefs.themeMode = id
                                    prefs.applyTheme()
                                    themePicker = false
                                }
                                .padding(vertical = 12.dp),
                            color = p.ink,
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { themePicker = false }) { Text("Close") }
            },
        )
    }

    if (suggestOpen) {
        AlertDialog(
            onDismissRequest = { suggestOpen = false },
            title = { Text("Suggest an office") },
            text = {
                Text(
                    "Open Developer from You settings to suggest an office with your current location, or use the web admin.",
                    color = p.ink2,
                )
            },
            confirmButton = {
                TextButton(onClick = { suggestOpen = false }) { Text("OK") }
            },
        )
    }
}

@Composable
private fun DevicesScreen(
    repo: PresenceRepository,
    prefs: AppPrefs,
    onBack: () -> Unit,
    onForceDetect: ((String) -> Unit) -> Unit,
    onUnauthorized: () -> Unit = {},
) {
    val p = LocalOpPalette.current
    val ctx = LocalContext.current
    val main = remember { Handler(Looper.getMainLooper()) }
    var devices by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var msg by remember { mutableStateOf<String?>(null) }
    var syncing by remember { mutableStateOf(false) }

    fun reload() {
        thread {
            val res = runCatching { repo.api.devices() }.getOrNull()
            val arr = res?.optJSONArray("devices")
            val list = if (arr == null) emptyList() else (0 until arr.length()).map { arr.getJSONObject(it) }
            main.post { devices = list }
        }
    }

    LaunchedEffect(Unit) { reload() }

    val pm = ctx.getSystemService(PowerManager::class.java)
    val batteryOk = pm?.isIgnoringBatteryOptimizations(ctx.packageName) == true
    val bgOk = if (android.os.Build.VERSION.SDK_INT >= 29) {
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_BACKGROUND_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
    } else true

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
            Text("Devices", style = OpType.Title, color = p.ink)
        }
        Text(
            "You can be signed in on several phones. The latest location wins, and a day counts once.",
            style = OpType.Body,
            color = p.ink2,
            modifier = Modifier.padding(top = 8.dp, bottom = 16.dp),
        )
        OpCard {
            devices.forEachIndexed { i, d ->
                val id = d.optString("id")
                val label = d.optString("label", d.optString("deviceName", "Phone"))
                val thisPhone = id == prefs.deviceId || d.optBoolean("current")
                val last = d.optString("lastSeenAt", d.optString("updatedAt")).takeIf { it.isNotBlank() && it != "null" }
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        Modifier.size(40.dp).clip(CircleShape).background(p.sunk),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Outlined.PhoneAndroid, contentDescription = null, tint = p.ink2)
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(label, style = OpType.Label.copy(fontWeight = FontWeight.SemiBold), color = p.ink)
                        Text(
                            if (last != null) OpFormat.syncedAgo(
                                try {
                                    java.time.Instant.parse(last).toEpochMilli()
                                } catch (_: Exception) {
                                    prefs.lastSyncAtMs
                                },
                            ) else OpFormat.syncedAgo(prefs.lastSyncAtMs),
                            style = OpType.Meta,
                            color = p.ink2,
                        )
                    }
                    if (thisPhone) {
                        Text(
                            "This phone",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = p.ink,
                            modifier = Modifier
                                .clip(OpShape.Pill)
                                .background(p.sunk)
                                .padding(horizontal = 10.dp, vertical = 6.dp),
                        )
                    } else {
                        Text(
                            "Sign out device",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = if (prefs.isViewAsReadonly) p.ink3 else p.ink,
                            modifier = Modifier
                                .clip(OpShape.Pill)
                                .border(1.dp, p.lineStrong, OpShape.Pill)
                                .clickable(enabled = !prefs.isViewAsReadonly) {
                                    thread {
                                        repo.api.revokeDevice(id)
                                        main.post { reload() }
                                    }
                                }
                                .padding(horizontal = 10.dp, vertical = 6.dp),
                        )
                    }
                }
                if (i < devices.lastIndex) DividerLine()
            }
            if (devices.isEmpty()) {
                Text(prefs.deviceName, style = OpType.Label.copy(fontWeight = FontWeight.SemiBold), color = p.ink)
                Text("This phone", style = OpType.Meta, color = p.ink2)
            }
        }
        Spacer(Modifier.height(14.dp))
        OpCard {
            Text("This phone", style = OpType.Heading, color = p.ink)
            Spacer(Modifier.height(8.dp))
            SettingsRow("Location", value = if (bgOk) "All the time" else "While using")
            DividerLine()
            SettingsRow("Battery", value = if (batteryOk) "Unrestricted" else "Optimized")
            DividerLine()
            SettingsRow(
                "Last sync",
                value = if (prefs.lastSyncAtMs > 0) {
                    OpFormat.fmtTime(java.time.Instant.ofEpochMilli(prefs.lastSyncAtMs).toString(), prefs.timezone)
                } else "Never",
            )
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OpPrimaryButton(
                    label = if (syncing) "Syncing..." else "Sync now",
                    onClick = {
                        syncing = true
                        thread {
                            val state = repo.uploadAndSync()
                            main.post {
                                if (state.unauthorized) {
                                    onUnauthorized()
                                    return@post
                                }
                                syncing = false
                                msg = if (state.ok) "Synced" else (state.message ?: "Sync failed")
                                reload()
                            }
                        }
                    },
                    modifier = Modifier.weight(1f),
                    loading = syncing,
                )
                OpSecondaryButton(
                    label = "Check now",
                    onClick = {
                        onForceDetect {
                            msg = it
                        }
                    },
                    modifier = Modifier.weight(1f),
                )
            }
            if (!msg.isNullOrBlank()) {
                Text(msg!!, style = OpType.Meta, color = p.ink2, modifier = Modifier.padding(top = 8.dp))
            }
            if (!batteryOk) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "Open battery settings",
                    color = OpColor.Accent,
                    style = OpType.Label,
                    modifier = Modifier.clickable {
                        ctx.startActivity(
                            Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                                data = Uri.parse("package:${ctx.packageName}")
                            },
                        )
                    },
                )
            }
        }
    }
}

@Composable
private fun CorrectionsListScreen(repo: PresenceRepository, prefs: AppPrefs, onBack: () -> Unit) {
    val p = LocalOpPalette.current
    val main = remember { Handler(Looper.getMainLooper()) }
    var rows by remember { mutableStateOf<List<JSONObject>>(emptyList()) }

    LaunchedEffect(Unit) {
        thread {
            val res = runCatching { repo.api.listCorrections() }.getOrNull()
            val arr = res?.optJSONArray("requests")
            val list = if (arr == null) emptyList() else (0 until arr.length()).map { arr.getJSONObject(it) }
            main.post { rows = list }
        }
    }

    val open = rows.filter { it.optString("status") == "pending" }
    val decided = rows.filter { it.optString("status") != "pending" }
    val closeDate = YearMonth.now().atEndOfMonth().plusDays(5)
    val closeLabel = DateTimeFormatter.ofPattern("d MMM", Locale.US).format(closeDate)

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
            Column {
                Text("Correction requests", style = OpType.Title, color = p.ink)
                Text(
                    "${OpFormat.fmtMonthShort(YearMonth.now().toString())} requests close on $closeLabel. After that the month is locked.",
                    style = OpType.Meta,
                    color = p.ink2,
                )
            }
        }
        Spacer(Modifier.height(20.dp))
        Text("Open", style = OpType.Meta, color = p.ink3, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        OpCard {
            if (open.isEmpty()) {
                Text("No open requests.", style = OpType.Meta, color = p.ink3)
            } else {
                open.forEachIndexed { i, o ->
                    CorrectionRow(o, prefs.timezone)
                    if (i < open.lastIndex) DividerLine()
                }
            }
        }
        Spacer(Modifier.height(16.dp))
        Text("Decided", style = OpType.Meta, color = p.ink3, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        OpCard {
            if (decided.isEmpty()) {
                Text("No decided requests yet.", style = OpType.Meta, color = p.ink3)
            } else {
                decided.forEachIndexed { i, o ->
                    CorrectionRow(o, prefs.timezone)
                    if (i < decided.lastIndex) DividerLine()
                }
            }
        }
    }
}

@Composable
private fun CorrectionRow(o: JSONObject, tz: String) {
    val p = LocalOpPalette.current
    val day = o.optString("dayKey", o.optString("day"))
    val issue = when (o.optString("issue")) {
        "missing_visit" -> "A visit is missing"
        "wrong_times" -> "Times are wrong"
        "wrong_office" -> "Wrong office"
        "should_not_count" -> "This day should not count"
        else -> o.optString("issue")
    }
    val status = o.optString("status")
    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(OpFormat.fmtDayTitle(day), style = OpType.Label.copy(fontWeight = FontWeight.Bold), color = p.ink)
            val detail = when (status) {
                "pending" -> "$issue, sent recently"
                "approved" -> "$issue, decided"
                "rejected" -> "$issue, decided"
                "cancelled" -> "$issue, cancelled by you"
                else -> issue
            }
            Text(detail, style = OpType.Meta, color = p.ink2)
        }
        when (status) {
            "pending" -> PendingBadge()
            "approved" -> NeutralBadge("Approved", check = true)
            "rejected" -> NeutralBadge("Not approved")
            "cancelled" -> NeutralBadge("Cancelled")
            else -> NeutralBadge(status)
        }
    }
}

@Composable
private fun RulesScreen(prefs: AppPrefs, onBack: () -> Unit) {
    val p = LocalOpPalette.current
    val rules = prefs.rules()
    Column(Modifier.fillMaxSize().padding(20.dp).verticalScroll(rememberScrollState())) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back", tint = p.ink)
            }
            Text("Rules", style = OpType.Title, color = p.ink)
        }
        Text("Read only. Admins change these on the web.", style = OpType.Meta, color = p.ink2, modifier = Modifier.padding(top = 8.dp, bottom = 16.dp))
        OpCard {
            SettingsRow("Gap that ends a visit", value = "${rules.gapMinutes} min")
            DividerLine()
            SettingsRow("Suggested hours a day", value = "${rules.dayHours.toInt()} h")
            DividerLine()
            SettingsRow("Monthly target", value = "${rules.monthlyPointsTarget} points")
            DividerLine()
            SettingsRow("Timezone", value = rules.timezone)
            DividerLine()
            SettingsRow("Fence radius", value = "${rules.fenceRadiusMeters.toInt()} m")
            DividerLine()
            SettingsRow("Sample interval", value = "${rules.sampleIntervalMinutes} min")
        }
    }
}

@Composable
private fun NicknamesScreen(repo: PresenceRepository, prefs: AppPrefs, onBack: () -> Unit) {
    val p = LocalOpPalette.current
    val main = remember { Handler(Looper.getMainLooper()) }
    var offices by remember { mutableStateOf(prefs.offices()) }
    var editing by remember { mutableStateOf<Office?>(null) }
    var draft by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var toast by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize().padding(20.dp).verticalScroll(rememberScrollState())) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back", tint = p.ink)
            }
            Text("Office nicknames", style = OpType.Title, color = p.ink)
        }
        Spacer(Modifier.height(12.dp))
        OpCard {
            if (offices.isEmpty()) {
                Text("No offices yet. Sync from Today first.", style = OpType.Meta, color = p.ink3)
            } else {
                offices.forEachIndexed { i, o ->
                    SettingsRow(
                        title = o.adminName,
                        value = o.alias?.takeIf { it.isNotBlank() } ?: o.displayName,
                        onClick = {
                            editing = o
                            draft = o.alias.orEmpty()
                        },
                    )
                    if (i < offices.lastIndex) DividerLine()
                }
            }
        }
        Text(
            "Nicknames are personal. Colleagues still see the office name from admin.",
            style = OpType.Meta,
            color = p.ink3,
            modifier = Modifier.padding(top = 12.dp),
        )
        toast?.let {
            Text(it, style = OpType.Meta, color = p.ink2, modifier = Modifier.padding(top = 8.dp))
        }
    }

    val target = editing
    if (target != null) {
        AlertDialog(
            onDismissRequest = { if (!saving) editing = null },
            title = { Text("Name for ${target.adminName}") },
            text = {
                Column {
                    Text(
                        "Leave empty to use the admin name.",
                        style = OpType.Meta,
                        color = p.ink3,
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                    OutlinedTextField(
                        value = draft,
                        onValueChange = { draft = it },
                        singleLine = true,
                        placeholder = { Text(target.adminName) },
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
                        enabled = !saving,
                    )
                }
            },
            confirmButton = {
                TextButton(
                    enabled = !saving,
                    onClick = {
                        saving = true
                        val name = draft.trim()
                        val officeId = target.id
                        thread {
                            val res = runCatching { repo.api.setAlias(officeId, name) }.getOrNull()
                            if (res?.ok() == true) repo.syncOnly()
                            main.post {
                                saving = false
                                if (res?.ok() == true) {
                                    offices = prefs.offices()
                                    editing = null
                                    toast = "Saved"
                                } else {
                                    toast = res?.optString("error") ?: "Save failed"
                                }
                            }
                        }
                    },
                ) { Text(if (saving) "Saving..." else "Save") }
            },
            dismissButton = {
                TextButton(enabled = !saving, onClick = { editing = null }) { Text("Cancel") }
            },
        )
    }
}
