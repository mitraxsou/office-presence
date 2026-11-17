package com.pwc.officepresence.notify

import android.content.Intent
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.pwc.officepresence.BuildConfig
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.PresenceRepository
import java.time.LocalDate
import java.time.ZoneId
import com.pwc.officepresence.ui.LoginActivity
import com.pwc.officepresence.ui.analytics.OpAnalytics
import kotlin.concurrent.thread

/** Handles remote force-logout (and future data pushes) while the app may be backgrounded. */
class OfficeFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        OpAnalytics.log(this, "fcm_token_refresh")
        FcmTokenSync.uploadIfSignedIn(this, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val type = message.data["type"].orEmpty()
        when (type) {
            "force_sign_out" -> {
                val reason = message.data["reason"].orEmpty()
                val fromPush = message.data["message"].orEmpty().trim()
                val text = when {
                    fromPush.isNotBlank() -> fromPush
                    reason == "deactivated" ->
                        "This account is deactivated. Contact your admin to reactivate it."
                    else -> "This account is no longer available. Sign in again."
                }
                PresenceRepository(this).forceSignOut(
                    message = text,
                    source = "fcm",
                )
                val launch = Intent(this, LoginActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                }
                startActivity(launch)
            }
            "presence_check" -> PresenceCheckAction.run(this)
            "rules_changed" -> thread {
                runCatching { PresenceRepository(this).syncOnly() }
            }
            "correction_decided" -> thread {
                runCatching { PresenceRepository(this).syncOnly(full = true) }
            }
            "app_update" -> showUpdate(message)
        }
    }

    private fun showUpdate(message: RemoteMessage) {
        val published = message.data["versionCode"]?.toIntOrNull()
        if (published != null && published <= BuildConfig.VERSION_CODE) return
        val prefs = AppPrefs(this)
        val previous = prefs.publishedAppVersionCode
        if (published != null && published > 0) prefs.publishedAppVersionCode = published
        val name = message.data["versionName"]?.trim().orEmpty()
        if (name.isNotEmpty() && name != "null") prefs.publishedAppVersionName = name
        val zone = runCatching { ZoneId.of(prefs.timezone) }.getOrDefault(ZoneId.of("Asia/Kolkata"))
        val today = LocalDate.now(zone).toString()
        val code = prefs.publishedAppVersionCode
        val newerThanLast = published != null && published > previous
        if (!newerThanLast && code > 0 &&
            !AppUpdateCheck.shouldRemind(BuildConfig.VERSION_CODE, code, prefs.appUpdateRemindedDay, today)
        ) {
            return
        }
        val url = message.data["url"]?.trim().orEmpty().ifBlank {
            AppUpdateCheck.downloadPage(BuildConfig.API_BASE_URL)
        }
        if (Notifier.appUpdate(this, url, prefs.publishedAppVersionName) && code > 0) {
            prefs.appUpdateRemindedDay = today
        }
    }
}
