package com.pwc.officepresence.ui.compose

import android.Manifest
import android.app.Activity
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.notify.Notifier
import com.pwc.officepresence.ui.theme.LocalOpPalette
import com.pwc.officepresence.ui.theme.OpColor
import com.pwc.officepresence.ui.theme.OpShape
import com.pwc.officepresence.ui.theme.OpType
import org.json.JSONObject
import kotlin.concurrent.thread

private enum class NotifSub { Main, Channel }

@Composable
fun NotificationsScreen(
    repo: PresenceRepository,
    prefs: AppPrefs,
    onBack: () -> Unit,
) {
    var sub by remember { mutableStateOf(NotifSub.Main) }
    var channelId by remember { mutableStateOf(Notifier.CHANNEL_ARRIVALS) }
    when (sub) {
        NotifSub.Main -> NotificationsMain(
            repo = repo,
            prefs = prefs,
            onBack = onBack,
            onOpenChannel = {
                channelId = it
                sub = NotifSub.Channel
            },
        )
        NotifSub.Channel -> ChannelDetailScreen(
            channelId = channelId,
            onBack = { sub = NotifSub.Main },
        )
    }
}

@Composable
private fun NotificationsMain(
    repo: PresenceRepository,
    prefs: AppPrefs,
    onBack: () -> Unit,
    onOpenChannel: (String) -> Unit,
) {
    val p = LocalOpPalette.current
    val ctx = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var permissionOk by remember { mutableStateOf(Notifier.canPost(ctx)) }
    var arrivals by remember { mutableStateOf(prefs.notifyOfficeEnter || prefs.notifyOfficeLeave) }
    var goal by remember { mutableStateOf(prefs.notifyGoalMet) }
    var weekly by remember { mutableStateOf(prefs.notifyDailySummary) }
    var corrections by remember { mutableStateOf(prefs.notifyCorrections) }
    var tracking by remember { mutableStateOf(prefs.notifyTrackingProblems) }
    var quiet by remember { mutableStateOf(prefs.quietHoursEnabled) }
    val readonly = prefs.isViewAsReadonly

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { permissionOk = Notifier.canPost(ctx) }

    DisposableEffect(lifecycleOwner) {
        val obs = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                permissionOk = Notifier.canPost(ctx)
                Notifier.ensureAllChannels(ctx)
            }
        }
        lifecycleOwner.lifecycle.addObserver(obs)
        onDispose { lifecycleOwner.lifecycle.removeObserver(obs) }
    }

    fun patch(body: JSONObject) {
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
            Text("Notifications", style = OpType.Title, color = p.ink)
        }
        Spacer(Modifier.height(12.dp))
        if (!permissionOk) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(OpShape.Card)
                    .background(OpColor.AccentWash)
                    .padding(16.dp),
            ) {
                Text(
                    "Notifications are off for Office Presence",
                    style = OpType.Heading.copy(fontSize = 18.sp),
                    color = p.ink,
                )
                Text(
                    "Android is blocking them, so you will not hear about tracking problems or decisions on your requests.",
                    style = OpType.Body,
                    color = p.ink2,
                    modifier = Modifier.padding(top = 8.dp),
                )
                Spacer(Modifier.height(14.dp))
                OpPrimaryButton(
                    label = "Turn on notifications",
                    onClick = {
                        if (Build.VERSION.SDK_INT >= 33) {
                            permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else {
                            Notifier.openAppNotificationSettings(ctx)
                        }
                    },
                )
            }
            Spacer(Modifier.height(20.dp))
        }
        Text("What to send", style = OpType.Meta, color = p.ink3, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        OpCard {
            NotifToggleRow(
                title = "Arrivals and leaving",
                subtitle = "When you are In or Out at an office",
                checked = arrivals,
                enabled = permissionOk && !readonly,
                onCheckedChange = {
                    arrivals = it
                    prefs.notifyOfficeEnter = it
                    prefs.notifyOfficeLeave = it
                    prefs.notifyOfficeDetected = it
                    patch(
                        JSONObject()
                            .put("notifyOfficeEnter", it)
                            .put("notifyOfficeLeave", it)
                            .put("notifyOfficeDetected", it),
                    )
                },
            )
            DividerLine()
            NotifToggleRow(
                title = "Goal met",
                subtitle = "When you reach your days for the month",
                checked = goal,
                enabled = permissionOk && !readonly,
                onCheckedChange = {
                    goal = it
                    prefs.notifyGoalMet = it
                    patch(JSONObject().put("notifyGoalMet", it))
                },
            )
            DividerLine()
            NotifToggleRow(
                title = "Weekly summary",
                subtitle = "Monday 9:00 am: days so far this month",
                checked = weekly,
                enabled = permissionOk && !readonly,
                onCheckedChange = {
                    weekly = it
                    prefs.notifyDailySummary = it
                    patch(JSONObject().put("notifyDailySummary", it))
                },
            )
            DividerLine()
            NotifToggleRow(
                title = "Correction requests",
                subtitle = "When an admin decides on your request",
                checked = corrections,
                enabled = permissionOk && !readonly,
                onCheckedChange = {
                    corrections = it
                    prefs.notifyCorrections = it
                    patch(JSONObject().put("notifyCorrections", it))
                },
            )
            DividerLine()
            NotifToggleRow(
                title = "Tracking problems",
                subtitle = "Location off, or no sync for 24 h",
                checked = tracking,
                enabled = permissionOk && !readonly,
                recommended = true,
                onCheckedChange = {
                    tracking = it
                    prefs.notifyTrackingProblems = it
                    patch(JSONObject().put("notifyTrackingProblems", it))
                },
            )
        }
        Spacer(Modifier.height(20.dp))
        Text("Quiet hours", style = OpType.Meta, color = p.ink3, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        OpCard {
            val quietLabel = if (quiet) {
                val start = prefs.quietHoursStart.ifBlank { "21:00" }
                val end = prefs.quietHoursEnd.ifBlank { "08:00" }
                "${OpFormat.formatQuietHours(start, end)}. Tracking problems still alert."
            } else {
                "Off. Tracking problems still alert when quiet hours are on."
            }
            NotifToggleRow(
                title = "Silence notifications",
                subtitle = quietLabel,
                checked = quiet,
                enabled = permissionOk && !readonly,
                onCheckedChange = {
                    quiet = it
                    if (it) {
                        prefs.quietHoursStart = "21:00"
                        prefs.quietHoursEnd = "08:00"
                        patch(
                            JSONObject()
                                .put("quietHoursStart", "21:00")
                                .put("quietHoursEnd", "08:00"),
                        )
                    } else {
                        prefs.quietHoursStart = ""
                        prefs.quietHoursEnd = ""
                        patch(
                            JSONObject()
                                .put("quietHoursStart", JSONObject.NULL)
                                .put("quietHoursEnd", JSONObject.NULL),
                        )
                    }
                },
            )
        }
        Spacer(Modifier.height(20.dp))
        Text("Sound and vibration", style = OpType.Meta, color = p.ink3, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        OpCard {
            Notifier.CHANNELS.forEachIndexed { i, ch ->
                SettingsRow(
                    title = ch.name,
                    value = Notifier.channelSummaryLabel(ctx, ch.id),
                    onClick = { onOpenChannel(ch.id) },
                )
                if (i < Notifier.CHANNELS.lastIndex) DividerLine()
            }
        }
    }
}

@Composable
private fun ChannelDetailScreen(channelId: String, onBack: () -> Unit) {
    val p = LocalOpPalette.current
    val ctx = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val spec = Notifier.CHANNELS.firstOrNull { it.id == channelId }
    var status by remember { mutableStateOf(Notifier.channelStatus(ctx, channelId)) }

    val tonePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        if (result.resultCode != Activity.RESULT_OK) return@rememberLauncherForActivityResult
        val picked = if (Build.VERSION.SDK_INT >= 33) {
            result.data?.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI, Uri::class.java)
        } else {
            @Suppress("DEPRECATION")
            result.data?.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI) as? Uri
        }
        when {
            result.data == null -> Unit
            picked == null -> Notifier.applyChannelSound(ctx, channelId, uri = null, title = "Silent", silent = true)
            else -> {
                val title = Notifier.titleForSoundUri(ctx, picked)
                Notifier.applyChannelSound(ctx, channelId, uri = picked, title = title, silent = false)
            }
        }
        status = Notifier.channelStatus(ctx, channelId)
    }

    DisposableEffect(lifecycleOwner, channelId) {
        val obs = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                status = Notifier.channelStatus(ctx, channelId)
            }
        }
        lifecycleOwner.lifecycle.addObserver(obs)
        onDispose { lifecycleOwner.lifecycle.removeObserver(obs) }
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
            Text(spec?.name ?: "Channel", style = OpType.Title.copy(fontSize = 24.sp), color = p.ink)
        }
        Text(
            "Pick any notification tone on this phone, or change more options in Android settings.",
            style = OpType.Body,
            color = p.ink2,
            modifier = Modifier.padding(top = 8.dp, bottom = 16.dp),
        )
        OpCard {
            SettingsRow(
                "Sound",
                value = status.soundLabel,
                onClick = { tonePicker.launch(Notifier.ringtonePickerIntent(ctx, channelId)) },
            )
            DividerLine()
            SettingsRow("Vibrate", value = if (status.vibrate) "On" else "Off")
            DividerLine()
            SettingsRow("Pop on screen", value = if (status.popOnScreen) "On" else "Off")
            DividerLine()
            SettingsRow("Show on lock screen", value = status.lockScreen)
            DividerLine()
            SettingsRow("Override Do Not Disturb", value = if (status.bypassDnd) "On" else "Off")
        }
        Spacer(Modifier.height(14.dp))
        OpCard {
            Text("Try it", style = OpType.Heading, color = p.ink)
            Text(
                "Sends one sample notification with the current sound and vibration.",
                style = OpType.Meta,
                color = p.ink2,
                modifier = Modifier.padding(top = 6.dp, bottom = 12.dp),
            )
            OpSecondaryButton(
                label = "Send test notification",
                onClick = { Notifier.sendTestNotification(ctx, channelId) },
            )
            Spacer(Modifier.height(10.dp))
            OpSecondaryButton(
                label = "Pick notification tone",
                onClick = { tonePicker.launch(Notifier.ringtonePickerIntent(ctx, channelId)) },
            )
        }
        Spacer(Modifier.height(24.dp))
        OpPrimaryButton(
            label = "Change in Android settings",
            onClick = { Notifier.openChannelSettings(ctx, channelId) },
        )
        Row(
            Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.OpenInNew, contentDescription = null, tint = p.ink3, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(6.dp))
            Text("Opens system channel settings", style = OpType.Meta, color = p.ink3)
        }
    }
}

@Composable
private fun NotifToggleRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    recommended: Boolean = false,
) {
    val p = LocalOpPalette.current
    Row(
        Modifier.fillMaxWidth().padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = OpType.Label.copy(fontWeight = FontWeight.SemiBold), color = p.ink)
                if (recommended) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "Recommended",
                        fontSize = 11.sp,
                        color = p.ink2,
                        modifier = Modifier
                            .clip(OpShape.Pill)
                            .background(p.sunk)
                            .padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
            }
            Text(subtitle, style = OpType.Meta, color = p.ink2, modifier = Modifier.padding(top = 2.dp))
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

fun notificationChannelsOnCount(prefs: AppPrefs): Pair<Int, Int> {
    val flags = listOf(
        prefs.notifyOfficeEnter || prefs.notifyOfficeLeave,
        prefs.notifyGoalMet,
        prefs.notifyDailySummary,
        prefs.notifyCorrections,
        prefs.notifyTrackingProblems,
    )
    return flags.count { it } to flags.size
}
