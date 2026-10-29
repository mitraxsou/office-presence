package com.pwc.officepresence.notify

import android.content.Context
import com.google.firebase.messaging.FirebaseMessaging
import com.pwc.officepresence.BuildConfig
import com.pwc.officepresence.data.ApiClient
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.ok
import kotlin.concurrent.thread

object FcmTokenSync {
    private var lastSent: String? = null

    fun refreshAndUpload(context: Context) {
        refresh(context)
    }

    fun refreshIfNeeded(context: Context) {
        if (lastSent != null) return
        refresh(context)
    }

    fun refresh(context: Context) {
        if (!FirebaseGate.ready(context)) return
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            uploadIfSignedIn(context, token)
        }
    }

    fun uploadIfSignedIn(context: Context, token: String) {
        val app = context.applicationContext
        val prefs = AppPrefs(app)
        val deviceId = prefs.deviceId
        val auth = prefs.token
        if (auth.isNullOrBlank() || deviceId.isNullOrBlank() || prefs.isViewAsReadonly) return
        if (token.length < 20) return
        val key = "$deviceId:$token:${BuildConfig.VERSION_CODE}"
        if (lastSent == key) return
        thread {
            val res = runCatching {
                ApiClient(BuildConfig.API_BASE_URL) { prefs.token }
                    .registerFcm(deviceId, token, BuildConfig.VERSION_CODE)
            }.getOrNull()
            if (res != null && res.ok()) lastSent = key
        }
    }
}
