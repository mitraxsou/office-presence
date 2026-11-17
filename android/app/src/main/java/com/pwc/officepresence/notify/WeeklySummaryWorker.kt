package com.pwc.officepresence.notify

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.PresenceRepository
import java.time.DayOfWeek
import java.time.Duration
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.TemporalAdjusters
import java.util.concurrent.TimeUnit

/** Pure date maths for the weekly summary, kept separate so it can be unit tested. */
object WeeklySummary {
    const val HOUR = 9

    /** Next Monday 09:00 strictly after [now] in its zone. */
    fun nextRun(now: ZonedDateTime): ZonedDateTime {
        var next = now.with(TemporalAdjusters.nextOrSame(DayOfWeek.MONDAY))
            .withHour(HOUR).withMinute(0).withSecond(0).withNano(0)
        if (!next.isAfter(now)) next = next.plusWeeks(1)
        return next
    }

    /** The Monday to Sunday week that ended before [today]. */
    fun previousWeek(today: LocalDate): Pair<LocalDate, LocalDate> {
        val start = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusWeeks(1)
        return start to start.plusDays(6)
    }

    /** Count distinct visit days (points above 0) between [start] and [end] inclusive. */
    fun visitDays(days: List<Pair<String, Int>>, start: LocalDate, end: LocalDate): Int =
        days.filter { (key, points) ->
            points > 0 && runCatching { LocalDate.parse(key) }.getOrNull()?.let { !it.isBefore(start) && !it.isAfter(end) } == true
        }.map { it.first }.distinct().size

    fun body(weekVisitDays: Int, points: Int, target: Int, monthName: String): Pair<String, String> {
        val days = "$weekVisitDays visit day${if (weekVisitDays == 1) "" else "s"}"
        return if (points >= target) {
            "Weekly summary" to "This week: $days. Goal met for $monthName: $points of $target points."
        } else {
            "Weekly summary" to "This week: $days. Month so far: $points of $target points, ${target - points} to go."
        }
    }
}

/**
 * Monday 09:00 summary in the user's timezone. Pref key stays notifyDailySummary because it
 * maps to the server field; it now means weekly.
 */
class WeeklySummaryWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val prefs = AppPrefs(applicationContext)
        try {
            if (prefs.token.isNullOrBlank() || prefs.isViewAsReadonly || !prefs.notifyDailySummary) {
                return Result.success()
            }
            val repo = PresenceRepository(applicationContext)
            val state = repo.syncOnly()
            if (!state.ok) return Result.success()
            val zone = zoneOf(prefs)
            val (start, end) = WeeklySummary.previousWeek(LocalDate.now(zone))
            val days = mutableListOf<Pair<String, Int>>()
            for (month in setOf(YearMonth.from(start), YearMonth.from(end))) {
                val res = runCatching { repo.api.reports(month.toString()) }.getOrNull() ?: continue
                val cal = res.optJSONArray("calendar") ?: continue
                for (i in 0 until cal.length()) {
                    val d = cal.optJSONObject(i) ?: continue
                    days += d.optString("dayKey") to d.optInt("points", 0)
                }
            }
            Notifier.weeklySummary(
                applicationContext,
                WeeklySummary.visitDays(days, start, end),
                state.monthPoints,
                state.pointsTarget,
            )
            return Result.success()
        } finally {
            schedule(applicationContext)
        }
    }

    companion object {
        private const val NAME = "weekly-summary"
        private const val LEGACY_DAILY = "daily-summary"

        private fun zoneOf(prefs: AppPrefs): ZoneId =
            try { ZoneId.of(prefs.timezone) } catch (_: Exception) { ZoneId.of("Asia/Kolkata") }

        fun schedule(context: Context) {
            val prefs = AppPrefs(context)
            val wm = WorkManager.getInstance(context)
            wm.cancelUniqueWork(LEGACY_DAILY)
            val now = ZonedDateTime.now(zoneOf(prefs))
            val delay = Duration.between(now, WeeklySummary.nextRun(now)).toMinutes().coerceAtLeast(1)
            val req = OneTimeWorkRequestBuilder<WeeklySummaryWorker>()
                .setInitialDelay(delay, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            wm.enqueueUniqueWork(NAME, ExistingWorkPolicy.REPLACE, req)
        }

        /** Developer screen: "Send weekly summary now". The run re-sets the next Monday. */
        fun runNow(context: Context) {
            WorkManager.getInstance(context).enqueue(OneTimeWorkRequestBuilder<WeeklySummaryWorker>().build())
        }

        fun cancel(context: Context) {
            val wm = WorkManager.getInstance(context)
            wm.cancelUniqueWork(NAME)
            wm.cancelUniqueWork(LEGACY_DAILY)
        }
    }
}
