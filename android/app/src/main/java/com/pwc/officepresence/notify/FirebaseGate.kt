package com.pwc.officepresence.notify

import android.content.Context
import com.google.firebase.FirebaseApp

/** Starts Firebase only when google-services.json was merged into the build. */
object FirebaseGate {
    fun ready(context: Context): Boolean {
        val app = context.applicationContext
        if (FirebaseApp.getApps(app).isNotEmpty()) return true
        val id = app.resources.getIdentifier("google_app_id", "string", app.packageName)
        if (id == 0) return false
        return try {
            FirebaseApp.initializeApp(app)
            true
        } catch (_: Exception) {
            false
        }
    }
}
