package com.pwc.officepresence.notify

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.PresenceRepository
import java.util.concurrent.TimeUnit

/**
 * Daily background sync (SPEC §18 / Year PDF): any network, battery not low, backoff on failure.
 * Complements [DailySummaryWorker] which also notifies; this job only refreshes cache.
 */
class SyncRefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val prefs = AppPrefs(applicationContext)
        if (prefs.token.isNullOrBlank()) return Result.success()
        val state = PresenceRepository(applicationContext).refreshIfNeeded(force = true, bypassCooldown = true)
        // forceSignOut already cleared the session and notified; do not retry forever.
        if (state.unauthorized) return Result.success()
        return if (state.ok) Result.success() else Result.retry()
    }

    companion object {
        private const val NAME = "daily-sync-refresh"

        fun schedule(context: Context) {
            val req = PeriodicWorkRequestBuilder<SyncRefreshWorker>(24, TimeUnit.HOURS)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .setRequiresBatteryNotLow(true)
                        .build(),
                )
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                req,
            )
        }
    }
}
