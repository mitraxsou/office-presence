package com.pwc.officepresence.presence

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.PresenceRepository
import kotlin.concurrent.thread

/**
 * One location fix so someone already inside an office shows as In.
 * Geofences only report a later enter or exit.
 * Each reason runs at most once per process, and only after permission and offices exist.
 */
object ArrivalDetect {
    private val done = HashSet<String>()
    private val lock = Any()

    fun request(context: Context, reason: String) {
        val app = context.applicationContext
        synchronized(lock) {
            if (done.contains(reason)) return
        }
        val prefs = AppPrefs(app)
        if (prefs.token.isNullOrBlank() || prefs.isViewAsReadonly) return
        if (ContextCompat.checkSelfPermission(app, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        if (prefs.offices().isEmpty()) return
        synchronized(lock) {
            if (!done.add(reason)) return
        }
        takeFix(app, recordOutside = false) {
            synchronized(lock) { done.remove(reason) }
        }
    }

    /** Wake path: one fix, including an exit when the phone is no longer inside. */
    fun forceNow(context: Context) {
        val app = context.applicationContext
        val prefs = AppPrefs(app)
        if (prefs.token.isNullOrBlank() || prefs.isViewAsReadonly) return
        if (ContextCompat.checkSelfPermission(app, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        takeFix(app, recordOutside = true, onMiss = {})
    }

    private fun takeFix(app: Context, recordOutside: Boolean, onMiss: () -> Unit) {
        val cts = CancellationTokenSource()
        LocationServices.getFusedLocationProviderClient(app)
            .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token)
            .addOnSuccessListener { loc ->
                if (loc == null) {
                    onMiss()
                    return@addOnSuccessListener
                }
                thread {
                    val repo = PresenceRepository(app)
                    if (recordOutside) {
                        repo.forceDetect(loc.latitude, loc.longitude, loc.accuracy.toDouble())
                    } else {
                        repo.arriveIfInside(loc.latitude, loc.longitude, loc.accuracy.toDouble())
                    }
                }
            }
            .addOnFailureListener { onMiss() }
    }
}
