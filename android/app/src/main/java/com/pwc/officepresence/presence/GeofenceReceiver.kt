package com.pwc.officepresence.presence

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.notify.Notifier

class GeofenceReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val event = GeofencingEvent.fromIntent(intent) ?: return
        if (event.hasError()) return
        val type = when (event.geofenceTransition) {
            Geofence.GEOFENCE_TRANSITION_ENTER -> "enter"
            Geofence.GEOFENCE_TRANSITION_EXIT -> "exit"
            else -> return
        }
        val repo = PresenceRepository(context)
        val offices = repo.prefs().offices().associateBy { it.id }
        val loc = event.triggeringLocation
        val ids = event.triggeringGeofences?.map { it.requestId }.orEmpty()
        for (id in ids.ifEmpty { listOf<String?>(null) }) {
            repo.recordLocal(
                type = type,
                lat = loc?.latitude,
                lng = loc?.longitude,
                accuracy = loc?.accuracy?.toDouble(),
                officeId = id?.takeIf { offices.containsKey(it) },
            )
        }
        if (type == "enter") {
            val best = ids.mapNotNull { offices[it] }.maxByOrNull { it.pointsPerVisitDay }
            if (best != null) Notifier.officeEntered(context, best.displayName, best.pointsPerVisitDay)
            PresenceService.start(context)
        } else {
            PresenceService.stop(context)
        }
        val pending = goAsync()
        Thread {
            try {
                repo.uploadAndSync()
            } catch (_: Exception) {
            } finally {
                pending.finish()
            }
        }.start()
    }
}
