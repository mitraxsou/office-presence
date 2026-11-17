package com.pwc.officepresence.notify

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.pwc.officepresence.BuildConfig
import com.pwc.officepresence.data.AppPrefs
import java.time.LocalDate
import java.time.ZoneId
import java.util.concurrent.TimeUnit

/** Once a day: remind while this install is behind the published version. No network needed. */
class AppUpdateWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        remindIfDue(applicationContext)
        return Result.success()
    }

    companion object {
        private const val NAME = "app-update-reminder"

        fun remindIfDue(context: Context) {
            val prefs = AppPrefs(context)
            if (prefs.token.isNullOrBlank()) return
            val zone = runCatching { ZoneId.of(prefs.timezone) }.getOrDefault(ZoneId.of("Asia/Kolkata"))
            val today = LocalDate.now(zone).toString()
            if (!AppUpdateCheck.shouldRemind(
                    BuildConfig.VERSION_CODE,
                    prefs.publishedAppVersionCode,
                    prefs.appUpdateRemindedDay,
                    today,
                )
            ) {
                return
            }
            val url = AppUpdateCheck.downloadPage(BuildConfig.API_BASE_URL)
            if (Notifier.appUpdate(context, url, prefs.publishedAppVersionName, respectQuietHours = true)) {
                prefs.appUpdateRemindedDay = today
            }
        }

        fun schedule(context: Context) {
            val req = PeriodicWorkRequestBuilder<AppUpdateWorker>(24, TimeUnit.HOURS).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                req,
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(NAME)
        }
    }
}
