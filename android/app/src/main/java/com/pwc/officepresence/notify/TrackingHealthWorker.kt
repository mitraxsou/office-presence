package com.pwc.officepresence.notify

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.pwc.officepresence.data.AppPrefs
import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

/** Pure checks for the tracking health job, kept separate so they can be unit tested. */
object TrackingHealth {
    const val DAY_MS = 24L * 60L * 60L * 1000L

    enum class Problem(val key: String, val text: String) {
        Permission("permission", "Location is not set to All the time. Visits may be missed."),
        LocationOff("location_off", "Location is off on this phone."),
        NotSyncing("not_syncing", "Office Presence has not synced for a day. Open the app to check."),
    }

    data class Inputs(
        val fineGranted: Boolean,
        val backgroundGranted: Boolean,
        val locationEnabled: Boolean,
        val lastSuccessfulSyncAtMs: Long,
    )

    fun problems(inputs: Inputs, now: ZonedDateTime): List<Problem> = buildList {
        if (!inputs.fineGranted || !inputs.backgroundGranted) add(Problem.Permission)
        if (!inputs.locationEnabled) add(Problem.LocationOff)
        val weekday = now.dayOfWeek != DayOfWeek.SATURDAY && now.dayOfWeek != DayOfWeek.SUNDAY
        val last = inputs.lastSuccessfulSyncAtMs
        if (weekday && last > 0L && now.toInstant().toEpochMilli() - last > DAY_MS) add(Problem.NotSyncing)
    }

    /** Problems not notified in the last 24 hours. */
    fun due(problems: List<Problem>, lastAlerted: Map<String, Long>, nowMs: Long): List<Problem> =
        problems.filter { p -> lastAlerted[p.key]?.let { nowMs - it >= DAY_MS } ?: true }

    fun parse(csv: String): Map<String, Long> =
        csv.split(",").mapNotNull { part ->
            val (k, v) = part.split(":").takeIf { it.size == 2 } ?: return@mapNotNull null
            v.toLongOrNull()?.let { k to it }
        }.toMap()

    fun encode(map: Map<String, Long>): String = map.entries.joinToString(",") { "${it.key}:${it.value}" }

    fun text(problems: List<Problem>): String = problems.joinToString(" ") { it.text }
}

/** Every 6 hours: permission, location off, or no sync for a weekday. No network needed. */
class TrackingHealthWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        check(applicationContext)
        return Result.success()
    }

    companion object {
        private const val NAME = "tracking-health"
        private const val NAME_NOW = "tracking-health-now"

        fun check(context: Context, nowMs: Long = System.currentTimeMillis()) {
            val prefs = AppPrefs(context)
            if (prefs.token.isNullOrBlank() || prefs.isViewAsActive) return
            val zone = runCatching { ZoneId.of(prefs.timezone) }.getOrDefault(ZoneId.of("Asia/Kolkata"))
            val found = TrackingHealth.problems(inputs(context, prefs), Instant.ofEpochMilli(nowMs).atZone(zone))
            val last = TrackingHealth.parse(prefs.trackingProblemAlertsCsv)
            val due = TrackingHealth.due(found, last, nowMs)
            if (due.isEmpty()) return
            if (Notifier.trackingProblem(context, TrackingHealth.text(due))) {
                prefs.trackingProblemAlertsCsv = TrackingHealth.encode(last + due.associate { it.key to nowMs })
            }
        }

        private fun inputs(context: Context, prefs: AppPrefs): TrackingHealth.Inputs {
            fun granted(p: String) = ContextCompat.checkSelfPermission(context, p) == PackageManager.PERMISSION_GRANTED
            val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            return TrackingHealth.Inputs(
                fineGranted = granted(Manifest.permission.ACCESS_FINE_LOCATION),
                backgroundGranted = Build.VERSION.SDK_INT < 29 || granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
                locationEnabled = lm?.let { LocationManagerCompat.isLocationEnabled(it) } ?: true,
                lastSuccessfulSyncAtMs = prefs.lastSuccessfulSyncAtMs,
            )
        }

        fun schedule(context: Context) {
            val req = PeriodicWorkRequestBuilder<TrackingHealthWorker>(6, TimeUnit.HOURS).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, req)
        }

        /** Developer screen: run the checks now, ignoring the once per 24 hours limit. */
        fun runNow(context: Context) {
            AppPrefs(context).trackingProblemAlertsCsv = ""
            WorkManager.getInstance(context).enqueueUniqueWork(
                NAME_NOW,
                ExistingWorkPolicy.REPLACE,
                OneTimeWorkRequestBuilder<TrackingHealthWorker>().build(),
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(NAME)
        }
    }
}
