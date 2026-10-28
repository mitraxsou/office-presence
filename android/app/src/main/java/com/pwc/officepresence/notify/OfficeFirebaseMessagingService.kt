package com.pwc.officepresence.notify

import android.content.Intent
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.ui.LoginActivity
import com.pwc.officepresence.ui.analytics.OpAnalytics

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
        }
    }
}
