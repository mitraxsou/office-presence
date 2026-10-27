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
        val best = ids.mapNotNull { offices[it] }.maxByOrNull { it.pointsPerVisitDay }
        if (type == "enter") {
            if (best != null) Notifier.officeEntered(context, best.displayName, best.pointsPerVisitDay)
            repo.prefs().lastSampleOfficeId = best?.id ?: ids.firstOrNull().orEmpty()
            PresenceService.start(context)
        } else {
            val name = best?.displayName
                ?: repo.prefs().cachedOfficeName.takeIf { it.isNotBlank() }
                ?: "office"
            Notifier.officeLeft(context, name)
            repo.prefs().lastSampleOfficeId = ""
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
