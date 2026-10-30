package com.pwc.officepresence.ui.compose

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

/** One editable row in Fix today. Times are local HH:mm. */
data class FixVisit(
    val officeId: String,
    val officeName: String,
    val inHm: String,
    val outHm: String,
    val stillIn: Boolean,
)

sealed class FixTodayPayload {
    data class Ready(val body: JSONObject) : FixTodayPayload()
    data class Invalid(val row: Int, val message: String) : FixTodayPayload()
}

fun fixHmToIso(dayKey: String, hm: String, zone: ZoneId): String? {
    val (h, m) = parseHmStrict(hm) ?: return null
    return ZonedDateTime.of(LocalDate.parse(dayKey), LocalTime.of(h, m), zone).toInstant().toString()
}

/**
 * Request body for POST /api/me/corrections. Every row goes in requested.visits with its own office.
 * The first row by In time is repeated in requested.in_at and out_at for older servers.
 * No rows means the day should not count. Rows are sorted by In; only the last may be Still In.
 */
fun buildFixTodayBody(dayKey: String, reason: String, rows: List<FixVisit>, zone: ZoneId): FixTodayPayload {
    val body = JSONObject()
        .put("day", dayKey)
        .put("issue", if (rows.isEmpty()) "should_not_count" else "wrong_times")
        .put("reason", reason.trim())
    if (rows.isEmpty()) {
        body.put("requested", JSONObject().put("remove", true))
        return FixTodayPayload.Ready(body)
    }
    val ordered = rows.withIndex().sortedBy { hmToMinutes(it.value.inHm) ?: Int.MAX_VALUE }
    val visits = JSONArray()
    for ((pos, entry) in ordered.withIndex()) {
        val row = entry.value
        val label = entry.index + 1
        visitOrderError(row.inHm, row.outHm, row.stillIn)?.let { return FixTodayPayload.Invalid(label, it) }
        if (row.stillIn && pos != ordered.lastIndex) {
            return FixTodayPayload.Invalid(label, "Only the last visit can be Still In")
        }
        if (pos > 0) {
            val prev = ordered[pos - 1].value
            val prevEnd = hmToMinutes(prev.outHm)
            val start = hmToMinutes(row.inHm)
            if (prevEnd != null && start != null && start < prevEnd) {
                return FixTodayPayload.Invalid(label, "This visit overlaps the one before it")
            }
        }
        val inAt = fixHmToIso(dayKey, row.inHm, zone) ?: return FixTodayPayload.Invalid(label, "Enter an In time")
        val item = JSONObject().put("in_at", inAt)
        if (row.officeId.isNotBlank()) item.put("office_id", row.officeId)
        if (row.stillIn) {
            item.put("out_at", JSONObject.NULL)
        } else {
            val outAt = fixHmToIso(dayKey, row.outHm, zone) ?: return FixTodayPayload.Invalid(label, "Enter an Out time")
            item.put("out_at", outAt)
        }
        visits.put(item)
    }
    val first = visits.getJSONObject(0)
    val firstOut: Any = if (first.isNull("out_at")) JSONObject.NULL else first.getString("out_at")
    val requested = JSONObject()
        .put("in_at", first.getString("in_at"))
        .put("out_at", firstOut)
        .put("visits", visits)
    if (first.has("office_id")) {
        requested.put("office_id", first.getString("office_id"))
        body.put("officeLocationId", first.getString("office_id"))
    }
    body.put("proposedStart", first.getString("in_at"))
    if (firstOut != JSONObject.NULL) body.put("proposedEnd", firstOut)
    body.put("requested", requested)
    return FixTodayPayload.Ready(body)
}

/** One GPS fragment from today's office list, before editor merging. */
data class VisitFragment(
    val officeId: String,
    val officeName: String,
    val inMs: Long,
    val outMs: Long,
)

/** One stay the Fix today editor shows. Out is strictly after In. */
data class MergedStay(
    val officeId: String,
    val officeName: String,
    val inMs: Long,
    val outMs: Long,
    val stillIn: Boolean,
)

/** Policy gap. A zero test gap would leave every fragment as its own row. */
fun editorGapMinutes(policyGapMinutes: Int): Int =
    if (policyGapMinutes > 0) policyGapMinutes else 15

/**
 * Join same-office fragments when the gap is shorter than [gapMinutes].
 * A gap of that many minutes or more starts a new visit.
 */
fun mergeVisitFragments(
    fragments: List<VisitFragment>,
    gapMinutes: Int,
    nowMs: Long,
    inOffice: Boolean,
    openOfficeName: String?,
): List<MergedStay> {
    val gapMs = gapMinutes.coerceAtLeast(0) * 60_000L
    val sorted = fragments
        .filter { it.inMs > 0L }
        .sortedBy { it.inMs }
    if (sorted.isEmpty()) return emptyList()
    val stays = mutableListOf<MergedStay>()
    for (fragment in sorted) {
        val end = maxOf(fragment.outMs, fragment.inMs)
        val last = stays.lastOrNull()
        val sameOffice = last != null && sameOffice(last, fragment)
        val gap = if (last == null) Long.MAX_VALUE else fragment.inMs - last.outMs
        if (last != null && sameOffice && gap < gapMs) {
            stays[stays.lastIndex] = last.copy(outMs = maxOf(last.outMs, end), stillIn = false)
        } else {
            stays += MergedStay(
                officeId = fragment.officeId,
                officeName = fragment.officeName,
                inMs = fragment.inMs,
                outMs = end,
                stillIn = false,
            )
        }
    }
    return stays.mapIndexed { index, stay ->
        val last = index == stays.lastIndex
        val open = inOffice && last &&
            (openOfficeName.isNullOrBlank() || stay.officeName == openOfficeName) &&
            nowMs - stay.outMs <= 2 * 60_000L
        val inMinute = stay.inMs / 60_000L
        val outMinute = stay.outMs / 60_000L
        if (outMinute > inMinute) {
            stay.copy(stillIn = open)
        } else if (open || (inMinute + 1) * 60_000L > nowMs) {
            stay.copy(stillIn = true)
        } else {
            stay.copy(outMs = (inMinute + 1) * 60_000L, stillIn = false)
        }
    }
}

fun parseIsoMs(iso: String): Long? {
    val raw = iso.trim()
    if (raw.isEmpty() || raw == "null") return null
    return try {
        Instant.parse(raw).toEpochMilli()
    } catch (_: Exception) {
        null
    }
}

/** HH:mm, or 12-hour text such as "9:05 pm". Blank and junk return null. */
fun parseHmStrict(value: String): Pair<Int, Int>? {
    val lower = value.trim().lowercase()
    if (lower.isEmpty()) return null
    val pm = lower.contains("pm")
    val am = lower.contains("am")
    val cleaned = lower.replace("am", "").replace("pm", "").trim()
    val parts = cleaned.split(":")
    if (parts.size < 2) return null
    val hRaw = parts[0].trim().toIntOrNull() ?: return null
    val mRaw = parts[1].trim().takeWhile { it.isDigit() }.toIntOrNull() ?: return null
    if (hRaw !in 0..23 || mRaw !in 0..59) return null
    var h = hRaw
    if (pm && h < 12) h += 12
    if (am && h == 12) h = 0
    if (am && h > 12) return null
    return h to mRaw
}

fun visitOrderError(inHm: String, outHm: String, stillIn: Boolean): String? {
    if (parseHmStrict(inHm) == null) return "Enter an In time"
    if (stillIn) return null
    if (parseHmStrict(outHm) == null) return "Enter an Out time"
    val start = hmToMinutes(inHm) ?: return "Enter an In time"
    val end = hmToMinutes(outHm) ?: return "Enter an Out time"
    if (end <= start) return "Out must be after In"
    return null
}

fun hmToMinutes(value: String): Int? {
    val (h, m) = parseHmStrict(value) ?: return null
    return h * 60 + m
}

/** Midpoint for Split visit. Null when the stay is shorter than 2 minutes. */
fun splitHm(inHm: String, outHm: String): String? {
    val start = hmToMinutes(inHm) ?: return null
    val end = hmToMinutes(outHm) ?: return null
    if (end - start < 2) return null
    val mid = start + (end - start) / 2
    return "%02d:%02d".format(mid / 60, mid % 60)
}

fun localHm(ms: Long, zone: ZoneId): String {
    val z = Instant.ofEpochMilli(ms).atZone(zone)
    return "%02d:%02d".format(z.hour, z.minute)
}

fun mergeCaption(rawCount: Int, stayCount: Int, gapMinutes: Int): String {
    val stay = if (stayCount == 1) "1 visit" else "$stayCount visits"
    val rule = "A gap of $gapMinutes min or more starts a new visit."
    return if (rawCount > stayCount) {
        "$rawCount short visits are shown as $stay. $rule"
    } else {
        "$stay. $rule"
    }
}

private fun sameOffice(stay: MergedStay, fragment: VisitFragment): Boolean {
    if (stay.officeId.isNotBlank() && fragment.officeId.isNotBlank()) {
        return stay.officeId == fragment.officeId
    }
    return stay.officeName == fragment.officeName
}
