package com.pwc.officepresence.presence

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.pwc.officepresence.R
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.EventLog
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.notify.Notifier
import com.pwc.officepresence.ui.MainActivity
import java.time.Instant
import kotlin.concurrent.thread

class PresenceService : Service() {
    private val prefs by lazy { AppPrefs(this) }
    private val log by lazy { EventLog(this) }
    private val fused by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private var callback: LocationCallback? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForegroundNotification()
        startSampling()
        return START_STICKY
    }

    override fun onDestroy() {
        callback?.let { fused.removeLocationUpdates(it) }
        callback = null
        super.onDestroy()
    }

    private fun sampleIntervalMs(): Long {
        return if (prefs.fastTest) AppPrefs.TEST_SAMPLE_MS
        else prefs.sampleIntervalMinutes.coerceAtLeast(1) * 60_000L
    }

    private fun startSampling() {
        callback?.let { fused.removeLocationUpdates(it) }
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, sampleIntervalMs())
            .setMinUpdateIntervalMillis(sampleIntervalMs())
            .setWaitForAccurateLocation(false)
            .build()
        val cb = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val loc = result.lastLocation ?: return
                recordSample(loc)
                uploadAsync()
            }
        }
        callback = cb
        try {
            // Fused provider accepts mock locations when Developer options
            // has a mock location app selected.
            fused.requestLocationUpdates(request, cb, Looper.getMainLooper())
        } catch (_: SecurityException) {
            stopSelf()
        }
    }

    private fun recordSample(loc: Location) {
        val rules = prefs.rules()
        val weak = loc.accuracy > rules.fenceRadiusMeters
        val wifi = currentWifi()
        val isMock = if (Build.VERSION.SDK_INT >= 31) loc.isMock else @Suppress("DEPRECATION") loc.isFromMockProvider
        val office = if (weak) null else VisitCalculator.matchNearestOffice(
            loc.latitude, loc.longitude, loc.accuracy.toDouble(),
            prefs.offices().map { it.toFence() }, rules,
        )
        log.add(
            type = "sample",
            recordedAtIso = Instant.now().toString(),
            lat = loc.latitude,
            lng = loc.longitude,
            accuracy = loc.accuracy.toDouble(),
            wifiSsid = wifi.first,
            wifiBssid = wifi.second,
            simulated = false,
            officeId = office?.id,
        )
        maybeAlertOnSampleTransition(office)
        val nm = getSystemService(NotificationManager::class.java)
        val mockTag = if (isMock) " mock" else ""
        val text = if (weak) "Weak fix ${loc.accuracy.toInt()}m (not counted)$mockTag"
        else if (office != null) "Inside ${prefs.offices().firstOrNull { it.id == office.id }?.displayName ?: "office"} ${loc.accuracy.toInt()}m$mockTag"
        else "Outside office ${loc.accuracy.toInt()}m$mockTag"
        nm.notify(NOTIF_ID, buildNotification(text))
    }

    /** When OEM geofence never fires, sample enter/leave still posts a heads-up (debounced). */
    private fun maybeAlertOnSampleTransition(office: OfficeFenceInput?) {
        val prev = prefs.lastSampleOfficeId
        val next = office?.id.orEmpty()
        if (prev == next) return
        val offices = prefs.offices().associateBy { it.id }
        if (prev.isEmpty() && next.isNotEmpty()) {
            val o = offices[next]
            if (o != null) Notifier.officeEntered(this, o.displayName, o.pointsPerVisitDay)
        } else if (prev.isNotEmpty() && next.isEmpty()) {
            val o = offices[prev]
            Notifier.officeLeft(this, o?.displayName ?: prefs.cachedOfficeName.ifBlank { "office" })
        } else if (prev.isNotEmpty() && next.isNotEmpty() && prev != next) {
            val left = offices[prev]
            val entered = offices[next]
            Notifier.officeLeft(this, left?.displayName ?: "office")
            if (entered != null) Notifier.officeEntered(this, entered.displayName, entered.pointsPerVisitDay, force = true)
        }
        prefs.lastSampleOfficeId = next
    }

    private fun currentWifi(): Pair<String?, String?> {
        return try {
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            @Suppress("DEPRECATION")
            val info = wm.connectionInfo
            val ssid = info?.ssid?.trim('"')?.takeIf { it.isNotBlank() && it != "<unknown ssid>" }
            val bssid = info?.bssid
            ssid to bssid
        } catch (_: Exception) {
            null to null
        }
    }

    private fun uploadAsync() {
        thread {
            try {
                PresenceRepository(this).uploadPendingOnly()
            } catch (_: Exception) {
            }
        }
    }

    private fun startForegroundNotification() {
        val channelId = "presence"
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(
                NotificationChannel(channelId, "Office presence", NotificationManager.IMPORTANCE_LOW),
            )
        }
        val notif = buildNotification("Tracking office presence")
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }

    private fun buildNotification(text: String): Notification {
        val launch = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, "presence")
            .setContentTitle(getString(R.string.app_name))
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_stat_presence)
            .setContentIntent(launch)
            .setOngoing(true)
            .build()
    }

    companion object {
        const val NOTIF_ID = 42
        fun start(context: Context) {
            val i = Intent(context, PresenceService::class.java)
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(i) else context.startService(i)
        }
        fun stop(context: Context) {
            context.stopService(Intent(context, PresenceService::class.java))
        }
    }
}
