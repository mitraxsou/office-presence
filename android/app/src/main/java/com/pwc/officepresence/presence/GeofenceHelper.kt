package com.pwc.officepresence.presence

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.Office

/** One geofence per active office; requestId is the OfficeLocation id. */
object GeofenceHelper {
    private const val MAX_FENCES = 100

    private fun pendingIntent(context: Context) = PendingIntent.getBroadcast(
        context, 0, Intent(context, GeofenceReceiver::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
    )

    @SuppressLint("MissingPermission")
    fun registerAll(context: Context, offices: List<Office>) {
        val prefs = AppPrefs(context)
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) {
            prefs.geofenceStatus = "Geofences not registered: location permission missing."
            return
        }
        val client = LocationServices.getGeofencingClient(context)
        val pi = pendingIntent(context)
        client.removeGeofences(pi).addOnCompleteListener {
            if (offices.isEmpty()) {
                prefs.geofenceStatus = "No active offices to watch."
                return@addOnCompleteListener
            }
            val fences = offices.take(MAX_FENCES).map { o ->
                Geofence.Builder()
                    .setRequestId(o.id)
                    .setCircularRegion(o.latitude, o.longitude, o.radiusMeters.toFloat().coerceAtLeast(50f))
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT)
                    .setLoiteringDelay(0)
                    .build()
            }
            val req = GeofencingRequest.Builder()
                .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
                .addGeofences(fences)
                .build()
            try {
                client.addGeofences(req, pi)
                    .addOnSuccessListener {
                        prefs.geofenceStatus = "Watching ${fences.size} office geofence${if (fences.size == 1) "" else "s"}."
                    }
                    .addOnFailureListener { e ->
                        prefs.geofenceStatus =
                            "Geofence registration failed: ${e.message ?: "unknown error"}. " +
                                "Turn on location all the time and battery exemption, then Sync."
                    }
            } catch (e: SecurityException) {
                prefs.geofenceStatus = "Geofences blocked: ${e.message ?: "security"}."
            }
        }
    }

    fun clear(context: Context) {
        LocationServices.getGeofencingClient(context).removeGeofences(pendingIntent(context))
        AppPrefs(context).geofenceStatus = "Geofences cleared."
    }
}
