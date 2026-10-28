package com.pwc.officepresence.notify

import android.content.Context
import com.google.firebase.messaging.FirebaseMessaging
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.data.ok
import kotlin.concurrent.thread

object FcmTokenSync {
    fun refreshAndUpload(context: Context) {
        val prefs = AppPrefs(context)
        if (prefs.token.isNullOrBlank()) return
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token ->
                if (!token.isNullOrBlank()) uploadIfSignedIn(context, token)
            }
    }

    fun uploadIfSignedIn(context: Context, token: String) {
        val prefs = AppPrefs(context)
        if (prefs.token.isNullOrBlank()) return
        if (prefs.lastUploadedFcmToken == token) return
        thread {
            try {
                val res = PresenceRepository(context).api.updateFcmToken(token)
                if (res.ok()) {
                    prefs.lastUploadedFcmToken = token
                }
            } catch (_: Exception) {
            }
        }
    }
}
