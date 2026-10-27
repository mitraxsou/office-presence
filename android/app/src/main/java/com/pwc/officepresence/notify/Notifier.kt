package com.pwc.officepresence.notify

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.pwc.officepresence.R
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.ui.DaysFormat
import com.pwc.officepresence.ui.ShellActivity
import java.time.Instant
import java.time.ZoneId

/**
 * Local notifications. One Android NotificationChannel per SPEC type.
 * Sound defaults to built-in tones; users may pick any system notification ringtone.
 */
object Notifier {
    const val ID_OFFICE = 1001
    const val ID_GOAL = 1002
    const val ID_SUMMARY = 1003
    const val ID_LEFT = 1004
    const val ID_CORRECTIONS = 1005
    const val ID_TRACKING = 1006
    const val ID_TEST = 1099

    const val CHANNEL_ARRIVALS = "arrivals_leaving"
    const val CHANNEL_GOAL = "goal_met"
    const val CHANNEL_WEEKLY = "weekly_summary"
    const val CHANNEL_CORRECTIONS = "correction_requests"
    const val CHANNEL_TRACKING = "tracking_problems"

    const val ALERT_DEBOUNCE_MS = 3 * 60_000L

    data class ChannelSpec(
        val id: String,
        val name: String,
        val description: String,
        val importance: Int = NotificationManager.IMPORTANCE_DEFAULT,
        val defaultTone: String = "default",
    )

    val CHANNELS = listOf(
        ChannelSpec(CHANNEL_ARRIVALS, "Arrivals and leaving", "When you are In or Out at an office", NotificationManager.IMPORTANCE_HIGH, "chime"),
        ChannelSpec(CHANNEL_GOAL, "Goal met", "When you reach your days for the month", defaultTone = "pulse"),
        ChannelSpec(CHANNEL_WEEKLY, "Weekly summary", "Monday 9:00 am: days so far this month"),
        ChannelSpec(CHANNEL_CORRECTIONS, "Correction requests", "When an admin decides on your request"),
        ChannelSpec(CHANNEL_TRACKING, "Tracking problems", "Location off, or no sync for 24 h", NotificationManager.IMPORTANCE_HIGH),
    )

    val TONES = linkedMapOf(
        "default" to "System default",
        "chime" to "Chime",
        "pulse" to "Pulse",
        "soft" to "Soft",
        "silent" to "Silent (banner only)",
    )

    private fun toneRes(id: String): Int? = when (id) {
        "chime" -> R.raw.tone_chime
        "pulse" -> R.raw.tone_pulse
        "soft" -> R.raw.tone_soft
        "silent" -> null
        else -> null
    }

    fun ensureAllChannels(context: Context) {
        CHANNELS.forEach { ensureChannel(context, it) }
    }

    private fun notificationAudioAttrs(): AudioAttributes =
        AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

    private fun resolveChannelSoundUri(context: Context, spec: ChannelSpec): Uri? {
        val prefs = AppPrefs(context)
        val custom = prefs.channelSoundUri(spec.id)
        if (custom == "silent") return null
        if (custom.isNotBlank()) {
            return runCatching { Uri.parse(custom) }.getOrNull()
        }
        if (spec.defaultTone == "silent") return null
        val res = toneRes(spec.defaultTone) ?: return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        return Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/$res")
    }

    private fun ensureChannel(context: Context, spec: ChannelSpec): String {
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = context.getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(spec.id) == null) {
                createChannel(context, nm, spec)
            }
        }
        return spec.id
    }

    private fun createChannel(context: Context, nm: NotificationManager, spec: ChannelSpec) {
        val ch = NotificationChannel(spec.id, spec.name, spec.importance)
        ch.description = spec.description
        ch.setBypassDnd(false)
        val sound = resolveChannelSoundUri(context, spec)
        if (sound == null) {
            ch.setSound(null, null)
            ch.enableVibration(false)
        } else {
            ch.setSound(sound, notificationAudioAttrs())
            ch.enableVibration(true)
        }
        nm.createNotificationChannel(ch)
    }

    /**
     * Apply a system ringtone (or silent / default) to a channel by recreating it.
     * [uri] null with [silent] false restores the built-in default tone.
     */
    fun applyChannelSound(
        context: Context,
        channelId: String,
        uri: Uri?,
        title: String?,
        silent: Boolean = false,
    ) {
        val prefs = AppPrefs(context)
        when {
            silent -> {
                prefs.setChannelSoundUri(channelId, "silent")
                prefs.setChannelSoundTitle(channelId, "Silent")
            }
            uri != null -> {
                prefs.setChannelSoundUri(channelId, uri.toString())
                prefs.setChannelSoundTitle(channelId, title?.takeIf { it.isNotBlank() } ?: "Custom")
            }
            else -> {
                prefs.setChannelSoundUri(channelId, "")
                prefs.setChannelSoundTitle(channelId, "")
            }
        }
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = context.getSystemService(NotificationManager::class.java)
            val spec = CHANNELS.firstOrNull { it.id == channelId } ?: return
            nm.deleteNotificationChannel(channelId)
            createChannel(context, nm, spec)
        }
    }

    fun ringtonePickerIntent(context: Context, channelId: String): Intent {
        ensureAllChannels(context)
        val prefs = AppPrefs(context)
        val stored = prefs.channelSoundUri(channelId)
        val existing: Uri? = when {
            stored == "silent" -> null
            stored.isNotBlank() -> runCatching { Uri.parse(stored) }.getOrNull()
            else -> {
                val spec = CHANNELS.firstOrNull { it.id == channelId }
                if (spec != null) resolveChannelSoundUri(context, spec) else null
            }
        }
        return Intent(RingtoneManager.ACTION_RINGTONE_PICKER).apply {
            putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_NOTIFICATION)
            putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
            putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, true)
            putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "Pick notification tone")
            if (existing != null) {
                putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, existing)
            }
        }
    }

    fun titleForSoundUri(context: Context, uri: Uri?): String {
        if (uri == null) return "Silent"
        return try {
            RingtoneManager.getRingtone(context, uri)?.getTitle(context) ?: "Custom"
        } catch (_: Exception) {
            "Custom"
        }
    }

    fun canPost(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED

    fun openAppNotificationSettings(context: Context) {
        val intent = if (Build.VERSION.SDK_INT >= 26) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            }
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${context.packageName}")
            }
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    fun openChannelSettings(context: Context, channelId: String) {
        ensureAllChannels(context)
        if (Build.VERSION.SDK_INT >= 26) {
            val intent = Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                putExtra(Settings.EXTRA_CHANNEL_ID, channelId)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } else {
            openAppNotificationSettings(context)
        }
    }

    data class ChannelStatus(
        val soundLabel: String,
        val vibrate: Boolean,
        val popOnScreen: Boolean,
        val lockScreen: String,
        val bypassDnd: Boolean,
    )

    fun channelStatus(context: Context, channelId: String): ChannelStatus {
        ensureAllChannels(context)
        if (Build.VERSION.SDK_INT < 26) {
            return ChannelStatus("System default", vibrate = true, popOnScreen = true, lockScreen = "Show", bypassDnd = false)
        }
        val nm = context.getSystemService(NotificationManager::class.java)
        val ch = nm.getNotificationChannel(channelId)
            ?: return ChannelStatus("System default", vibrate = true, popOnScreen = true, lockScreen = "Show", bypassDnd = false)
        val prefs = AppPrefs(context)
        val customTitle = prefs.channelSoundTitle(channelId)
        val soundLabel = when {
            ch.sound == null || prefs.channelSoundUri(channelId) == "silent" -> "Silent"
            customTitle.isNotBlank() -> customTitle
            ch.sound.toString().contains("tone_chime") -> "Chime"
            ch.sound.toString().contains("tone_pulse") -> "Pulse"
            ch.sound.toString().contains("tone_soft") -> "Soft"
            else -> {
                val fromSystem = titleForSoundUri(context, ch.sound)
                if (fromSystem == "Custom" || fromSystem == "Silent") "On" else fromSystem
            }
        }
        val lock = when (ch.lockscreenVisibility) {
            NotificationCompat.VISIBILITY_SECRET -> "Hide"
            NotificationCompat.VISIBILITY_PRIVATE -> "Hide details"
            else -> "Show"
        }
        return ChannelStatus(
            soundLabel = soundLabel,
            vibrate = ch.shouldVibrate(),
            popOnScreen = ch.importance >= NotificationManager.IMPORTANCE_HIGH,
            lockScreen = lock,
            bypassDnd = ch.canBypassDnd(),
        )
    }

    fun channelSummaryLabel(context: Context, channelId: String): String {
        val st = channelStatus(context, channelId)
        val vib = if (st.vibrate) "vibrate" else "no vibrate"
        return "${st.soundLabel}, $vib"
    }

    /** Quiet hours silence most alerts; tracking problems still alert. */
    fun inQuietHours(prefs: AppPrefs, nowMs: Long = System.currentTimeMillis()): Boolean {
        val start = prefs.quietHoursStart
        val end = prefs.quietHoursEnd
        if (start.isBlank() || end.isBlank()) return false
        val startMin = parseHm(start) ?: return false
        val endMin = parseHm(end) ?: return false
        val zone = try {
            ZoneId.of(prefs.timezone)
        } catch (_: Exception) {
            ZoneId.of("Asia/Kolkata")
        }
        val local = Instant.ofEpochMilli(nowMs).atZone(zone)
        val nowMin = local.hour * 60 + local.minute
        return if (startMin <= endMin) {
            nowMin in startMin until endMin
        } else {
            nowMin >= startMin || nowMin < endMin
        }
    }

    private fun parseHm(hm: String): Int? {
        val parts = hm.split(":")
        if (parts.size < 2) return null
        val h = parts[0].toIntOrNull() ?: return null
        val m = parts[1].toIntOrNull() ?: return null
        return h * 60 + m
    }

    private fun post(
        context: Context,
        channelId: String,
        notifId: Int,
        title: String,
        text: String,
        high: Boolean = false,
        respectQuietHours: Boolean = true,
    ) {
        if (!canPost(context)) return
        val prefs = AppPrefs(context)
        if (respectQuietHours && inQuietHours(prefs)) return
        ensureAllChannels(context)
        val launch = PendingIntent.getActivity(
            context, notifId, Intent(context, ShellActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_stat_presence)
            .setColor(ContextCompat.getColor(context, R.color.pwc_orange))
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(launch)
            .setAutoCancel(true)
            .setPriority(if (high) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(notifId, n)
        } catch (_: SecurityException) {
        }
    }

    fun recentlyAlerted(context: Context): Boolean {
        val at = AppPrefs(context).lastPresenceAlertAtMs
        return at > 0L && System.currentTimeMillis() - at < ALERT_DEBOUNCE_MS
    }

    private fun markAlerted(context: Context) {
        AppPrefs(context).lastPresenceAlertAtMs = System.currentTimeMillis()
    }

    fun officeEntered(context: Context, officeName: String, points: Int, force: Boolean = false) {
        val prefs = AppPrefs(context)
        if (!prefs.notifyOfficeEnter) return
        if (!force && recentlyAlerted(context)) return
        markAlerted(context)
        post(
            context, CHANNEL_ARRIVALS, ID_OFFICE,
            "At $officeName",
            DaysFormat.countsAs(points),
            high = true,
        )
    }

    fun officeLeft(context: Context, officeName: String, force: Boolean = false) {
        val prefs = AppPrefs(context)
        if (!prefs.notifyOfficeLeave) return
        if (!force && recentlyAlerted(context)) return
        markAlerted(context)
        post(
            context, CHANNEL_ARRIVALS, ID_LEFT,
            "Left $officeName",
            "Visit closed",
            high = true,
        )
    }

    fun goalMet(context: Context, points: Int, target: Int) {
        val prefs = AppPrefs(context)
        if (!prefs.notifyGoalMet) return
        post(context, CHANNEL_GOAL, ID_GOAL, "Goal met", "$points / $target days")
    }

    fun dailySummary(context: Context, points: Int, target: Int, hoursToday: Double, advised: Double) {
        val prefs = AppPrefs(context)
        if (!prefs.notifyDailySummary || points >= target) return
        val remaining = target - points
        post(
            context, CHANNEL_WEEKLY, ID_SUMMARY,
            "$points / $target days",
            "$remaining to go. Hours ${"%.1f".format(hoursToday)}h (FYI)",
        )
    }

    fun correctionDecided(context: Context, approved: Boolean, dayLabel: String) {
        val prefs = AppPrefs(context)
        if (!prefs.notifyCorrections) return
        post(
            context, CHANNEL_CORRECTIONS, ID_CORRECTIONS,
            if (approved) "Correction approved" else "Correction not approved",
            dayLabel,
        )
    }

    fun trackingProblem(context: Context, text: String) {
        val prefs = AppPrefs(context)
        if (!prefs.notifyTrackingProblems) return
        post(
            context, CHANNEL_TRACKING, ID_TRACKING,
            "Tracking problem",
            text,
            high = true,
            respectQuietHours = false,
        )
    }

    fun sendTestNotification(context: Context, channelId: String) {
        val name = CHANNELS.firstOrNull { it.id == channelId }?.name ?: "Notifications"
        post(
            context, channelId, ID_TEST,
            "Test: $name",
            "Sample notification with the current sound and vibration.",
            high = channelId == CHANNEL_ARRIVALS || channelId == CHANNEL_TRACKING,
            respectQuietHours = false,
        )
    }

    fun playLaunchSound(context: Context) {
        val prefs = AppPrefs(context)
        if (!prefs.launchSoundEnabled) return
        val audio = context.getSystemService(AudioManager::class.java)
        if (audio.ringerMode != AudioManager.RINGER_MODE_NORMAL) return
        val nm = context.getSystemService(NotificationManager::class.java)
        if (nm.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL) return
        try {
            MediaPlayer.create(context, R.raw.launch_pulse)?.apply {
                setOnCompletionListener { it.release() }
                start()
            }
        } catch (_: Exception) {
        }
    }

    fun previewTone(context: Context, toneId: String) {
        val res = toneRes(toneId) ?: return
        try {
            MediaPlayer.create(context, res)?.apply {
                setOnCompletionListener { it.release() }
                start()
            }
        } catch (_: Exception) {
        }
    }
}
