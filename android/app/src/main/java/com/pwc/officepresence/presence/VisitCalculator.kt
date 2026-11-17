package com.pwc.officepresence.presence

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

data class PresenceRules(
    val gapMinutes: Int = 15,
    /** When set, overrides gapMinutes (phone test mode uses 15). */
    val gapSeconds: Int? = null,
    /** Advisory only. Never gates points. */
    val dayHours: Double = 5.0,
    val monthlyDaysTarget: Int = 8,
    val monthlyPointsTarget: Int = 8,
    val timezone: String = "Asia/Kolkata",
    val fenceRadiusMeters: Double = 100.0,
    val sampleIntervalMinutes: Int = 10,
) {
    fun gapMs(): Long =
        if (gapSeconds != null && gapSeconds > 0) gapSeconds * 1000L
        else gapMinutes.coerceAtLeast(0) * 60_000L
}

data class PresenceEventInput(
    val type: String,
    val at: String,
    val lat: Double? = null,
    val lng: Double? = null,
    val accuracyMeters: Double? = null,
    val simulated: Boolean = false,
    val officeLocationId: String? = null,
    /** Office points stored with the local event when it was recorded. Not sent to the server. */
    val pointsAtMatch: Int? = null,
)

data class AdminVisitInput(
    val startAt: String,
    val endAt: String,
    val officeLocationId: String? = null,
    val pointsPerVisitDay: Int? = null,
)

data class ExclusionInput(val startAt: String, val endAt: String)

data class OfficeFenceInput(
    val lat: Double,
    val lng: Double,
    val radiusMeters: Double,
    val id: String? = null,
    val pointsPerVisitDay: Int = 1,
)

data class ComputedVisit(
    val startAt: String,
    val endAt: String,
    val source: String,
    val hours: Double,
    val officeLocationId: String? = null,
    val pointsAwarded: Int = 0,
    /** Still inside, with the end set to the clock used for this compute. */
    val open: Boolean = false,
    /** Highest pointsAtMatch among the events of an auto visit. Null when none had one. */
    val pointsSnapshot: Int? = null,
)

data class ExceptionDayInput(
    val dayKey: String,
    val points: Int,
    val exceptionId: String,
    val officeLocationId: String? = null,
)

data class DayException(val id: String, val points: Int)

data class DayPoints(
    val dayKey: String,
    val points: Int,
    val hours: Double,
    /** Null on a day with only an HR exception. */
    val firstIn: String?,
    val lastOut: String?,
    val officeLocationId: String?,
    val exception: DayException? = null,
)

data class ComputeResult(
    val visits: List<ComputedVisit>,
    val totalHours: Double,
    /** Advisory only: hours reached the dayHours figure. */
    val dayMet: Boolean,
    val visitDays: Int = 0,
    val totalPoints: Int = 0,
    /** totalPoints >= monthlyPointsTarget. */
    val targetMet: Boolean = false,
    val days: List<DayPoints> = emptyList(),
)

/** Mirrors web/src/lib/visit-calculator.ts. Shared cases live in shared/visit-cases.json. */
object VisitCalculator {
    fun compute(
        rules: PresenceRules,
        events: List<PresenceEventInput>,
        adminVisits: List<AdminVisitInput> = emptyList(),
        exclusions: List<ExclusionInput> = emptyList(),
        office: OfficeFenceInput? = null,
        offices: List<OfficeFenceInput>? = null,
        pointOffices: List<OfficeFenceInput>? = null,
        now: Long = System.currentTimeMillis(),
        exceptionDays: List<ExceptionDayInput> = emptyList(),
    ): ComputeResult {
        val fences = offices ?: listOfNotNull(office)
        val pointFences = pointOffices ?: fences
        val gapMs = rules.gapMs()
        val continueMs = if (rules.gapSeconds != null && rules.gapSeconds > 0) {
            gapMs
        } else {
            gapMs + rules.sampleIntervalMinutes.coerceAtLeast(0) * 60_000L
        }
        val zone = ZoneId.of(rules.timezone)

        val adminComputed = adminVisits.map {
            ComputedVisit(
                it.startAt, it.endAt, "admin",
                hoursBetween(parse(it.startAt), parse(it.endAt)),
                it.officeLocationId, it.pointsPerVisitDay ?: 0,
            )
        }
        val adminRanges = adminComputed.flatMap { visit ->
            val start = parse(visit.startAt)
            val end = parse(visit.endAt)
            val dayStarts = if (end <= start) {
                listOf(Instant.ofEpochMilli(start).atZone(zone).toLocalDate().atStartOfDay(zone).toInstant().toEpochMilli())
            } else {
                splitAtLocalMidnights(start, end, zone).map {
                    Instant.ofEpochMilli(it.first).atZone(zone).toLocalDate().atStartOfDay(zone).toInstant().toEpochMilli()
                }
            }
            dayStarts.distinct().map { it to Instant.ofEpochMilli(it).atZone(zone).toLocalDate().plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli() }
        }
        val realEvents = events.filter { !it.simulated }.sortedBy { parse(it.at) }
        val auto = mutableListOf<ComputedVisit>()
        var openStart: Long? = null
        var lastGood: Long? = null
        var openSource = "auto"
        var openOfficeId: String? = null
        var pendingExit: Long? = null
        var openSnapshot: Int? = null

        fun addSnapshot(event: PresenceEventInput) {
            val s = event.pointsAtMatch?.coerceAtLeast(0) ?: return
            openSnapshot = openSnapshot?.let { maxOf(it, s) } ?: s
        }

        fun reset() { openStart = null; lastGood = null; openOfficeId = null; openSnapshot = null }

        fun closeOpen(endMs: Long, markOpen: Boolean = false) {
            val start = openStart
            val snapshot = openSnapshot
            if (start == null || lastGood == null) { reset(); return }
            val end = maxOf(start, endMs)
            if (covered(start, end, exclusions)) { reset(); return }
            if (end == start) {
                val insideAdmin = adminRanges.any { start >= it.first && start <= it.second }
                if (!insideAdmin) {
                    auto += ComputedVisit(
                        iso(start), iso(start), openSource, 0.0, openOfficeId,
                        open = markOpen, pointsSnapshot = snapshot,
                    )
                }
                reset(); return
            }
            for (seg in trimAroundAdmin(start, end, adminRanges)) {
                if (covered(seg.first, seg.second, exclusions)) continue
                for (ds in splitAtLocalMidnights(seg.first, seg.second, zone)) {
                    auto += ComputedVisit(
                        iso(ds.first), iso(ds.second), openSource,
                        hoursBetween(ds.first, ds.second), openOfficeId,
                        open = markOpen && ds.second == end,
                        pointsSnapshot = snapshot,
                    )
                }
            }
            reset()
        }

        fun flushPendingExit() {
            val atExit = pendingExit ?: return
            pendingExit = null
            closeOpen(atExit)
        }

        for (event in realEvents) {
            val at = parse(event.at)
            if (event.type == "check_out") {
                pendingExit = null
                closeOpen(at)
                continue
            }
            if (event.type == "exit") {
                if (openStart != null && pendingExit == null) pendingExit = at
                continue
            }
            val matched: OfficeFenceInput? = when {
                event.lat != null && event.lng != null && fences.isNotEmpty() ->
                    matchNearestOffice(event.lat, event.lng, event.accuracyMeters, fences, rules)
                office != null -> if (isInside(event, office, rules)) office else null
                else -> null
            }
            val inside = event.type == "check_in" || event.type == "enter" ||
                event.officeLocationId != null || matched != null ||
                (office != null && isInside(event, office, rules))
            if (!inside) {
                val exitAt = pendingExit
                val lg = lastGood
                if (exitAt != null) {
                    if (at - exitAt > gapMs) flushPendingExit()
                } else if (openStart != null && lg != null && at - lg > gapMs) {
                    closeOpen(lg)
                }
                continue
            }
            val exitAt = pendingExit
            val bridgedExit = exitAt != null && at - exitAt <= continueMs
            if (exitAt != null) {
                if (bridgedExit) pendingExit = null else flushPendingExit()
            }
            val startOffice = event.officeLocationId ?: matched?.id ?: office?.id
            if (openStart == null) {
                openStart = at; lastGood = at
                openSource = if (event.type == "check_in") "manual" else "auto"
                openOfficeId = startOffice
                addSnapshot(event)
                continue
            }
            val lg = lastGood
            if (!bridgedExit && lg != null && at - lg > continueMs) {
                closeOpen(lg)
                openStart = at; lastGood = at
                openSource = if (event.type == "check_in") "manual" else "auto"
                openOfficeId = startOffice
                addSnapshot(event)
                continue
            }
            val evOffice = event.officeLocationId ?: matched?.id
            if (evOffice != null && openOfficeId != null && evOffice != openOfficeId) {
                closeOpen(at)
                openStart = at; lastGood = at
                openSource = if (event.type == "check_in") "manual" else "auto"
                openOfficeId = evOffice
                addSnapshot(event)
                continue
            }
            lastGood = at
            if (evOffice != null) openOfficeId = evOffice
            addSnapshot(event)
        }
        if (pendingExit != null) {
            val exitAt = pendingExit!!
            if (now - exitAt > gapMs) flushPendingExit()
            else closeOpen(now, true)
        } else if (openStart != null && lastGood != null) {
            val lg = lastGood!!
            if (now - lg <= continueMs) closeOpen(now, true)
            else closeOpen(lg)
        }

        val pointsByOffice = pointFences.mapNotNull { f -> f.id?.let { it to f.pointsPerVisitDay } }.toMap()
        val visits = (adminComputed + auto)
            .flatMap { trimVisitAroundExclusions(it, exclusions) }
            .sortedBy { parse(it.startAt) }.map { v ->
            if (v.source == "admin") {
                // Stored award as is. 0 stays 0 (day turned off).
                v.copy(pointsAwarded = v.pointsAwarded.coerceAtLeast(0))
            } else {
                // No snapshot only for events recorded before 2.1.0: use the current office weight.
                v.copy(pointsAwarded = v.pointsSnapshot ?: pointsByOffice[v.officeLocationId ?: ""] ?: 1)
            }
        }
        val days = mergeExceptionDays(computeDayPoints(visits, zone, pointsByOffice, exclusions), exceptionDays)
        val total = days.sumOf { it.hours }
        val totalPoints = days.sumOf { it.points }
        return ComputeResult(
            visits = visits,
            totalHours = total,
            dayMet = total + 1e-9 >= rules.dayHours,
            visitDays = days.size,
            totalPoints = totalPoints,
            targetMet = totalPoints >= rules.monthlyPointsTarget,
            days = days,
        )
    }

    fun computeDayPoints(
        visits: List<ComputedVisit>,
        zone: ZoneId,
        pointsByOffice: Map<String, Int>,
        exclusions: List<ExclusionInput> = emptyList(),
    ): List<DayPoints> {
        data class Acc(
            var firstIn: Long,
            var lastOut: Long,
            var maxPoints: Int,
            var officeId: String?,
            val byOffice: MutableMap<String, MutableList<ComputedVisit>> = mutableMapOf(),
        )
        val byDay = sortedMapOf<String, Acc>()
        for (v in visits) {
            val start = parse(v.startAt)
            val end = parse(v.endAt)
            val segs = if (end <= start) listOf(Triple(start, start, dayKey(start, zone)))
            else splitAtLocalMidnights(start, end, zone).map { Triple(it.first, it.second, dayKey(it.first, zone)) }
            for ((s, e, key) in segs) {
                val pts = when {
                    v.source == "admin" -> v.pointsAwarded.coerceAtLeast(0)
                    v.pointsSnapshot != null -> v.pointsSnapshot
                    v.pointsAwarded > 0 -> v.pointsAwarded
                    else -> pointsByOffice[v.officeLocationId ?: ""] ?: 1
                }
                val cur = byDay.getOrPut(key) { Acc(s, e, 0, v.officeLocationId) }
                cur.firstIn = minOf(cur.firstIn, s)
                cur.lastOut = maxOf(cur.lastOut, e)
                if (pts >= cur.maxPoints) {
                    cur.maxPoints = pts
                    cur.officeId = v.officeLocationId ?: cur.officeId
                }
                val officeKey = v.officeLocationId ?: ""
                val slices = cur.byOffice.getOrPut(officeKey) { mutableListOf() }
                slices += v.copy(startAt = iso(s), endAt = iso(e))
            }
        }
        return byDay.map { (k, a) ->
            val parts = a.byOffice.values.flatMap { officeSpanParts(it, exclusions) }
            DayPoints(k, a.maxPoints, unionHours(parts), iso(a.firstIn), iso(a.lastOut), a.officeId)
        }
    }

    /** Day points = the higher of visit points and exception points. Several exceptions on one day count once. */
    fun mergeExceptionDays(days: List<DayPoints>, exceptionDays: List<ExceptionDayInput>): List<DayPoints> {
        if (exceptionDays.isEmpty()) return days
        val best = mutableMapOf<String, ExceptionDayInput>()
        for (e in exceptionDays) {
            val points = e.points.coerceAtLeast(0)
            val cur = best[e.dayKey]
            if (cur == null || points > cur.points) best[e.dayKey] = e.copy(points = points)
        }
        val byKey = days.associateBy { it.dayKey }.toMutableMap()
        for ((key, e) in best) {
            val exception = DayException(e.exceptionId, e.points)
            val day = byKey[key]
            byKey[key] = day?.copy(points = maxOf(day.points, e.points), exception = exception)
                ?: DayPoints(key, e.points, 0.0, null, null, e.officeLocationId, exception)
        }
        return byKey.values.sortedBy { it.dayKey }
    }

    fun matchNearestOffice(
        lat: Double, lng: Double, accuracy: Double?, offices: List<OfficeFenceInput>, rules: PresenceRules,
    ): OfficeFenceInput? {
        if ((accuracy ?: Double.POSITIVE_INFINITY) > rules.fenceRadiusMeters) return null
        var best: OfficeFenceInput? = null
        var bestDist = Double.POSITIVE_INFINITY
        for (o in offices) {
            val d = haversine(lat, lng, o.lat, o.lng)
            if (d <= o.radiusMeters && d < bestDist) { best = o; bestDist = d }
        }
        return best
    }

    fun dayKey(ms: Long, zone: ZoneId): String = Instant.ofEpochMilli(ms).atZone(zone).toLocalDate().toString()

    /** Split [start,end) into per-local-day segments. */
    fun splitAtLocalMidnights(start: Long, end: Long, zone: ZoneId): List<Pair<Long, Long>> {
        if (end <= start) return emptyList()
        val out = mutableListOf<Pair<Long, Long>>()
        var cursor = start
        while (cursor < end) {
            val day: LocalDate = Instant.ofEpochMilli(cursor).atZone(zone).toLocalDate()
            val dayEnd = day.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
            val segEnd = minOf(end, dayEnd)
            out += cursor to segEnd
            cursor = segEnd
        }
        return out
    }

    private fun parse(iso: String) = Instant.parse(iso).toEpochMilli()
    private fun iso(ms: Long) = Instant.ofEpochMilli(ms).toString()
    private fun hoursBetween(a: Long, b: Long) = maxOf(0.0, (b - a) / 3_600_000.0)

    fun haversine(aLat: Double, aLng: Double, bLat: Double, bLng: Double): Double {
        val r = 6371000.0
        val dLat = Math.toRadians(bLat - aLat)
        val dLng = Math.toRadians(bLng - aLng)
        val lat1 = Math.toRadians(aLat)
        val lat2 = Math.toRadians(bLat)
        val h = Math.sin(dLat / 2).let { it * it } +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2).let { it * it }
        return 2 * r * Math.asin(Math.min(1.0, Math.sqrt(h)))
    }

    private fun isInside(e: PresenceEventInput, office: OfficeFenceInput?, rules: PresenceRules): Boolean {
        if (e.type == "check_in") return true
        if (e.type == "check_out" || e.type == "exit") return false
        if (office == null || e.lat == null || e.lng == null) return false
        if ((e.accuracyMeters ?: Double.POSITIVE_INFINITY) > rules.fenceRadiusMeters) return false
        return haversine(e.lat, e.lng, office.lat, office.lng) <= office.radiusMeters
    }

    private fun overlaps(a0: Long, a1: Long, b0: Long, b1: Long) = a0 < b1 && b0 < a1

    private fun covered(start: Long, end: Long, exclusions: List<ExclusionInput>): Boolean {
        if (start == end) {
            return exclusions.any {
                val s = parse(it.startAt); val e = parse(it.endAt)
                start >= s && start < e
            }
        }
        return exclusions.any {
            val s = parse(it.startAt); val e = parse(it.endAt)
            overlaps(start, end, s, e) && start >= s && end <= e
        }
    }

    private fun trimVisitAroundExclusions(
        visit: ComputedVisit,
        exclusions: List<ExclusionInput>,
    ): List<ComputedVisit> {
        val start = parse(visit.startAt)
        val end = parse(visit.endAt)
        if (start == end) return if (covered(start, end, exclusions)) emptyList() else listOf(visit)
        var segments = listOf(start to end)
        for (exclusion in exclusions) {
            val exStart = parse(exclusion.startAt)
            val exEnd = parse(exclusion.endAt)
            val next = mutableListOf<Pair<Long, Long>>()
            for ((segmentStart, segmentEnd) in segments) {
                if (!overlaps(segmentStart, segmentEnd, exStart, exEnd)) {
                    next += segmentStart to segmentEnd
                    continue
                }
                if (segmentStart < exStart) next += segmentStart to minOf(segmentEnd, exStart)
                if (segmentEnd > exEnd) next += maxOf(segmentStart, exEnd) to segmentEnd
            }
            segments = next.filter { it.second > it.first }
        }
        return segments.map { (segmentStart, segmentEnd) ->
            visit.copy(
                startAt = iso(segmentStart),
                endAt = iso(segmentEnd),
                hours = hoursBetween(segmentStart, segmentEnd),
                open = visit.open && segmentEnd == end,
            )
        }
    }

    private fun subtractRange(parts: List<Pair<Long, Long>>, cutStart: Long, cutEnd: Long): List<Pair<Long, Long>> {
        val next = mutableListOf<Pair<Long, Long>>()
        for ((start, end) in parts) {
            if (end <= cutStart || start >= cutEnd) {
                next += start to end
                continue
            }
            if (start < cutStart) next += start to minOf(end, cutStart)
            if (end > cutEnd) next += maxOf(start, cutEnd) to end
        }
        return next.filter { it.second > it.first }
    }

    private fun unionHours(parts: List<Pair<Long, Long>>): Double {
        val sorted = parts.filter { it.second > it.first }.sortedWith(compareBy({ it.first }, { it.second }))
        var totalMs = 0L
        var curStart = 0L
        var curEnd = 0L
        var open = false
        for ((start, end) in sorted) {
            if (!open || start > curEnd) {
                if (open) totalMs += curEnd - curStart
                curStart = start
                curEnd = end
                open = true
            } else if (end > curEnd) {
                curEnd = end
            }
        }
        if (open) totalMs += curEnd - curStart
        return totalMs / 3_600_000.0
    }

    /** First In to last Out for one office. Should-not-count periods are removed. */
    private fun officeSpanParts(
        visits: List<ComputedVisit>,
        exclusions: List<ExclusionInput>,
    ): List<Pair<Long, Long>> {
        if (visits.isEmpty()) return emptyList()
        var first = Long.MAX_VALUE
        var last = Long.MIN_VALUE
        for (visit in visits) {
            val start = parse(visit.startAt)
            val end = parse(visit.endAt)
            if (start < first) first = start
            if (end > last) last = end
        }
        if (first == Long.MAX_VALUE || last <= first) return emptyList()
        var parts = listOf(first to last)
        for (exclusion in exclusions) {
            val cutStart = parse(exclusion.startAt)
            val cutEnd = parse(exclusion.endAt)
            if (cutEnd <= cutStart) continue
            parts = subtractRange(parts, cutStart, cutEnd)
        }
        return parts
    }

    private fun trimAroundAdmin(start: Long, end: Long, admins: List<Pair<Long, Long>>): List<Pair<Long, Long>> {
        var segs = listOf(start to end)
        for ((a0, a1) in admins) {
            val next = mutableListOf<Pair<Long, Long>>()
            for ((s0, s1) in segs) {
                if (!overlaps(s0, s1, a0, a1)) { next += s0 to s1; continue }
                if (s0 < a0) next += s0 to minOf(s1, a0)
                if (s1 > a1) next += maxOf(s0, a1) to s1
            }
            segs = next.filter { it.second > it.first }
        }
        return segs
    }
}
