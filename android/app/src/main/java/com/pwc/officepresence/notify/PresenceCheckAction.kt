package com.pwc.officepresence.notify

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.presence.GeofenceHelper
import com.pwc.officepresence.ui.analytics.OpAnalytics
import kotlin.concurrent.thread

/** One-shot location check after FCM presence_check (silent, no heads-up). */
object PresenceCheckAction {
    @SuppressLint("MissingPermission")
    fun run(context: Context) {
        val prefs = AppPrefs(context)
        if (prefs.token.isNullOrBlank()) return
        if (prefs.isViewAsReadonly) return
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        OpAnalytics.log(context, "presence_check")
        GeofenceHelper.registerAll(context, prefs.offices())
        val cts = CancellationTokenSource()
        LocationServices.getFusedLocationProviderClient(context)
            .getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, cts.token)
            .addOnSuccessListener { loc ->
                if (loc == null) return@addOnSuccessListener
                thread {
                    try {
                        PresenceRepository(context).forceDetect(
                            loc.latitude,
                            loc.longitude,
                            loc.accuracy.toDouble(),
                        )
                    } catch (_: Exception) {
                    }
                }
            }
    }
}
