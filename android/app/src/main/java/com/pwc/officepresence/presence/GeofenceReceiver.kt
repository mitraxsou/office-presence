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
                mock = LocationFlags.isMock(loc),
            )
        }
        val best = ids.mapNotNull { offices[it] }.maxByOrNull { it.pointsPerVisitDay }
        val prefs = repo.prefs()
        val coarseExit = type == "exit" && (loc == null || loc.accuracy >= 15f)
        if (type == "enter") {
            // Skip duplicate enter when we already track this office (e.g. after re-register).
            if (best != null && prefs.lastSampleOfficeId != best.id) {
                Notifier.officeEntered(context, best.displayName, best.pointsPerVisitDay)
            }
            if (best != null) {
                prefs.lastSampleOfficeId = best.id
                LiveStatus.publish(
                    LiveStatus.Reading(true, best.id, best.displayName, System.currentTimeMillis()),
                )
            }
            PresenceService.start(context)
            // The server ignores an enter without coordinates. Get a real fix right away.
            if (loc == null) ArrivalDetect.forceNow(context)
        } else if (!coarseExit) {
            val name = best?.displayName
                ?: prefs.cachedOfficeName.takeIf { it.isNotBlank() }
                ?: prefs.lastOfficeName.takeIf { it.isNotBlank() }
                ?: "office"
            Notifier.officeLeft(context, name)
            prefs.lastSampleOfficeId = ""
            LiveStatus.publish(LiveStatus.Reading(false, null, null, System.currentTimeMillis()))
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
