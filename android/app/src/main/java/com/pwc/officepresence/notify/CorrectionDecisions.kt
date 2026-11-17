package com.pwc.officepresence.notify

import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Which correction decisions from sync deserve a notification. Pure so it can be unit tested. */
object CorrectionDecisions {
    const val KEEP = 100

    data class Decision(val id: String, val dayKey: String, val status: String, val reviewNote: String?)

    data class Result(val toNotify: List<Decision>, val seen: List<String>)

    /**
     * [seen] null means the first sync after install or sign in: mark everything seen and stay silent.
     * Only approved and rejected decisions notify; other statuses are just marked seen.
     */
    fun process(seen: List<String>?, decisions: List<Decision>): Result {
        val known = seen.orEmpty()
        val fresh = decisions.filter { it.id.isNotBlank() && it.id !in known }.distinctBy { it.id }
        val nextSeen = (known + fresh.map { it.id }).takeLast(KEEP)
        if (seen == null) return Result(emptyList(), nextSeen)
        return Result(fresh.filter { it.status == "approved" || it.status == "rejected" }, nextSeen)
    }

    fun dayLabel(dayKey: String): String =
        runCatching { DateTimeFormatter.ofPattern("EEE d MMM", Locale.US).format(LocalDate.parse(dayKey)) }
            .getOrDefault(dayKey)
}
