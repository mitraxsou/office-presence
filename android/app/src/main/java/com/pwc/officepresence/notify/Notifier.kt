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
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.pwc.officepresence.R
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.ui.MainActivity

/**
 * Local notifications. Each alert kind uses its own tone and channel.
 * Channels never bypass Do Not Disturb.
 */
object Notifier {
    const val ID_OFFICE = 1001
    const val ID_GOAL = 1002
    const val ID_SUMMARY = 1003
    const val ID_LEFT = 1004

    const val ALERT_DEBOUNCE_MS = 3 * 60_000L

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

    private fun channelId(kind: String, tone: String) = "${kind}_$tone"

    private fun ensureChannel(
        context: Context,
        kind: String,
        tone: String,
        name: String,
        importance: Int = NotificationManager.IMPORTANCE_DEFAULT,
    ): String {
        val id = channelId(kind, tone)
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = context.getSystemService(NotificationManager::class.java)
            val existing = nm.getNotificationChannel(id)
            if (existing != null && existing.importance != importance) {
                nm.deleteNotificationChannel(id)
            }
            if (nm.getNotificationChannel(id) == null) {
                val ch = NotificationChannel(id, name, importance)
                ch.setBypassDnd(false)
                ch.enableVibration(tone != "silent")
                if (tone == "silent") {
                    ch.setSound(null, null)
                } else {
                    toneRes(tone)?.let { res ->
                        val uri = Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/$res")
                        ch.setSound(
                            uri,
                            AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build(),
                        )
                    }
                }
                nm.createNotificationChannel(ch)
            }
        }
        return id
    }

    private fun canPost(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun post(
        context: Context,
        kind: String,
        tone: String,
        channelName: String,
        notifId: Int,
        title: String,
        text: String,
        high: Boolean = false,
    ) {
        if (!canPost(context)) return
        val importance = if (high) NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_DEFAULT
        val channel = ensureChannel(context, kind, tone, channelName, importance)
        val launch = PendingIntent.getActivity(
            context, notifId, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val n = NotificationCompat.Builder(context, channel)
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
            context, "enter_v4", prefs.toneEnterId, "Office enter", ID_OFFICE,
            "At $officeName",
            "+$points pt today",
            high = true,
        )
    }

    fun officeLeft(context: Context, officeName: String, force: Boolean = false) {
        val prefs = AppPrefs(context)
        if (!prefs.notifyOfficeLeave) return
        if (!force && recentlyAlerted(context)) return
        markAlerted(context)
        post(
            context, "leave_v4", prefs.toneLeaveId, "Office leave", ID_LEFT,
            "Left $officeName",
            "Visit closed",
            high = true,
        )
    }

    fun goalMet(context: Context, points: Int, target: Int) {
        val prefs = AppPrefs(context)
        if (!prefs.notifyGoalMet) return
        post(context, "goal_v3", prefs.toneGoalId, "Points goal", ID_GOAL, "Goal met", "$points / $target")
    }

    fun dailySummary(context: Context, points: Int, target: Int, hoursToday: Double, advised: Double) {
        val prefs = AppPrefs(context)
        if (!prefs.notifyDailySummary || points >= target) return
        val remaining = target - points
        post(
            context, "summary_v3", prefs.toneSummaryId, "Daily summary", ID_SUMMARY,
            "$points / $target",
            "$remaining left. Hours ${"%.1f".format(hoursToday)}h (FYI)",
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
