package com.pwc.officepresence.notify

import org.json.JSONArray

/** Which HR exceptions from sync deserve an "HR exception added" notice. Pure so it can be unit tested. */
object ExceptionNotices {
    const val KEEP = 100

    data class Added(val id: String, val days: List<String>, val pointsPerDay: Int, val officeName: String)

    data class Result(val toNotify: List<Added>, val seen: List<String>)

    /** Missing or malformed `exceptionsAdded` (older server) gives an empty list. */
    fun parse(arr: JSONArray?): List<Added> {
        if (arr == null) return emptyList()
        val out = mutableListOf<Added>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val id = o.optString("id").orEmpty()
            if (id.isBlank()) continue
            val days = o.optJSONArray("days")?.let { d -> (0 until d.length()).map { d.optString(it) }.filter { it.length == 10 } }
                .orEmpty()
                .ifEmpty { listOfNotNull(o.optString("startDay").takeIf { it.length == 10 }) }
            out += Added(
                id = id,
                days = days.sorted(),
                pointsPerDay = o.optInt("pointsPerDay", 0).coerceAtLeast(0),
                officeName = o.optString("officeName").takeIf { it.isNotBlank() && it != "null" } ?: "Office",
            )
        }
        return out
    }

    /** [seen] null means the first sync after install or sign in: mark everything seen and stay silent. */
    fun process(seen: List<String>?, added: List<Added>): Result {
        val known = seen.orEmpty()
        val fresh = added.filter { it.id !in known }.distinctBy { it.id }
        val nextSeen = (known + fresh.map { it.id }).takeLast(KEEP)
        if (seen == null) return Result(emptyList(), nextSeen)
        return Result(fresh.filter { it.days.isNotEmpty() }, nextSeen)
    }

    private fun points(n: Int) = if (n == 1) "1 point" else "$n points"

    /** "Fri 13 Nov counts as 1 point (Gurugram)." or "Mon 9 Nov to Fri 13 Nov count as 4 points a day (Pune)." */
    fun body(a: Added): String {
        val first = a.days.first()
        val last = a.days.last()
        return if (a.days.size == 1) {
            "${CorrectionDecisions.dayLabel(first)} counts as ${points(a.pointsPerDay)} (${a.officeName})."
        } else {
            "${CorrectionDecisions.dayLabel(first)} to ${CorrectionDecisions.dayLabel(last)} count as " +
                "${points(a.pointsPerDay)} a day (${a.officeName})."
        }
    }
}
