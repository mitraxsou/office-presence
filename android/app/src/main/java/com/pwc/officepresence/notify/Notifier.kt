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
 * Local notifications. Channel sound is fixed per channel on Android 8+, so each
 * tone gets its own channel. Channels never bypass Do Not Disturb.
 */
object Notifier {
    const val ID_OFFICE = 1001
    const val ID_GOAL = 1002
    const val ID_SUMMARY = 1003

    val TONES = linkedMapOf(
        "default" to "System default",
        "chime" to "Chime",
        "pulse" to "Pulse",
        "soft" to "Soft",
    )

    private fun toneRes(id: String): Int? = when (id) {
        "chime" -> R.raw.tone_chime
        "pulse" -> R.raw.tone_pulse
        "soft" -> R.raw.tone_soft
        else -> null
    }

    private fun channelId(kind: String, tone: String) = "${kind}_$tone"

    private fun ensureChannel(context: Context, kind: String, tone: String, name: String): String {
        val id = channelId(kind, tone)
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = context.getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(id) == null) {
                val ch = NotificationChannel(id, name, NotificationManager.IMPORTANCE_DEFAULT)
                ch.setBypassDnd(false)
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
                nm.createNotificationChannel(ch)
            }
        }
        return id
    }

    private fun canPost(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun post(context: Context, kind: String, channelName: String, notifId: Int, title: String, text: String) {
        if (!canPost(context)) return
        val prefs = AppPrefs(context)
        val channel = ensureChannel(context, kind, prefs.notificationToneId, channelName)
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
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(notifId, n)
        } catch (_: SecurityException) {
        }
    }

    fun officeEntered(context: Context, officeName: String, points: Int) {
        if (!AppPrefs(context).notifyOfficeDetected) return
        post(
            context, "office", "Office detected", ID_OFFICE,
            "At $officeName",
            "Today counts as a visit day (+$points point${if (points == 1) "" else "s"}).",
        )
    }

    fun goalMet(context: Context, points: Int, target: Int) {
        if (!AppPrefs(context).notifyGoalMet) return
        post(context, "goal", "Points goal met", ID_GOAL, "Goal met", "You reached $points / $target office points this month.")
    }

    fun dailySummary(context: Context, points: Int, target: Int, hoursToday: Double, advised: Double) {
        val prefs = AppPrefs(context)
        if (!prefs.notifyDailySummary || points >= target) return
        val remaining = target - points
        post(
            context, "summary", "Daily summary", ID_SUMMARY,
            "$points / $target office points",
            "$remaining to go this month. Hours today ${"%.1f".format(hoursToday)} (FYI, advised ${advised.toInt()}h).",
        )
    }

    /** Short launch tone on cold start, skipped unless ringer is normal and DND is off. */
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
