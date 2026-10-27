package com.pwc.officepresence.presence

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

data class PresenceRules(
    val gapMinutes: Int = 15,
    /** When set, overrides gapMinutes (phone test mode uses 15). */
    val gapSeconds: Int? = null,
    /** Advisory FYI only. Never gates points. */
    val dayHours: Double = 5.0,
    val monthlyDaysTarget: Int = 8,
    val monthlyPointsTarget: Int = 8,
    val timezone: String = "Asia/Kolkata",
    val fenceRadiusMeters: Double = 100.0,
    val sampleIntervalMinutes: Int = 5,
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
)

data class DayPoints(
    val dayKey: String,
    val points: Int,
    val hours: Double,
    val firstIn: String,
    val lastOut: String,
    val officeLocationId: String?,
)

data class ComputeResult(
    val visits: List<ComputedVisit>,
    val totalHours: Double,
    /** Advisory only: hours reached the FYI dayHours figure. */
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
    ): ComputeResult {
        val fences = offices ?: listOfNotNull(office)
        val pointFences = pointOffices ?: fences
        val gapMs = rules.gapMs()
        val zone = ZoneId.of(rules.timezone)

        val adminComputed = adminVisits.map {
            ComputedVisit(
                it.startAt, it.endAt, "admin",
                hoursBetween(parse(it.startAt), parse(it.endAt)),
                it.officeLocationId, it.pointsPerVisitDay ?: 0,
            )
        }
        val adminRanges = adminComputed.map { parse(it.startAt) to parse(it.endAt) }
        val realEvents = events.filter { !it.simulated }.sortedBy { parse(it.at) }
        val auto = mutableListOf<ComputedVisit>()
        var openStart: Long? = null
        var lastGood: Long? = null
        var openSource = "auto"
        var openOfficeId: String? = null

        fun reset() { openStart = null; lastGood = null; openOfficeId = null }

        fun closeOpen(endMs: Long) {
            val start = openStart
            if (start == null || lastGood == null) { reset(); return }
            val end = maxOf(start, endMs)
            if (covered(start, end, exclusions)) { reset(); return }
            if (end == start) {
                val insideAdmin = adminRanges.any { start >= it.first && start <= it.second }
                if (!insideAdmin) auto += ComputedVisit(iso(start), iso(start), openSource, 0.0, openOfficeId)
                reset(); return
            }
            for (seg in trimAroundAdmin(start, end, adminRanges)) {
                if (covered(seg.first, seg.second, exclusions)) continue
                for (ds in splitAtLocalMidnights(seg.first, seg.second, zone)) {
                    auto += ComputedVisit(
                        iso(ds.first), iso(ds.second), openSource,
                        hoursBetween(ds.first, ds.second), openOfficeId,
                    )
                }
            }
            reset()
        }

        for (event in realEvents) {
            val at = parse(event.at)
            if (event.type == "check_out" || event.type == "exit") { closeOpen(at); continue }
            val matched: OfficeFenceInput? = when {
                event.lat != null && event.lng != null && fences.isNotEmpty() ->
                    matchNearestOffice(event.lat, event.lng, event.accuracyMeters, fences, rules)
                office != null -> if (isInside(event, office, rules)) office else null
                else -> null
            }
            val inside = event.type == "check_in" || event.type == "enter" || matched != null ||
                (office != null && isInside(event, office, rules))
            if (!inside) {
                val lg = lastGood
                if (openStart != null && lg != null && at - lg > gapMs) closeOpen(lg)
                continue
            }
            val startOffice = event.officeLocationId ?: matched?.id ?: office?.id
            if (openStart == null) {
                openStart = at; lastGood = at
                openSource = if (event.type == "check_in") "manual" else "auto"
                openOfficeId = startOffice
                continue
            }
            val lg = lastGood
            if (lg != null && at - lg > gapMs) {
                closeOpen(lg)
                openStart = at; lastGood = at
                openSource = if (event.type == "check_in") "manual" else "auto"
                openOfficeId = startOffice
                continue
            }
            val evOffice = event.officeLocationId ?: matched?.id
            if (evOffice != null && openOfficeId != null && evOffice != openOfficeId) {
                closeOpen(at)
                openStart = at; lastGood = at
                openSource = if (event.type == "check_in") "manual" else "auto"
                openOfficeId = evOffice
                continue
            }
            lastGood = at
            if (evOffice != null) openOfficeId = evOffice
        }
        lastGood?.let { if (openStart != null) closeOpen(it) }

        val pointsByOffice = pointFences.mapNotNull { f -> f.id?.let { it to f.pointsPerVisitDay } }.toMap()
        val filtered = auto.filter { !covered(parse(it.startAt), parse(it.endAt), exclusions) }
        val visits = (adminComputed + filtered).sortedBy { parse(it.startAt) }.map { v ->
            if (v.source != "admin" || v.pointsAwarded == 0) {
                v.copy(pointsAwarded = pointsByOffice[v.officeLocationId ?: ""] ?: if (v.pointsAwarded > 0) v.pointsAwarded else 1)
            } else v
        }
        val total = visits.sumOf { it.hours }
        val days = computeDayPoints(visits, zone, pointsByOffice)
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
    ): List<DayPoints> {
        data class Acc(var firstIn: Long, var lastOut: Long, var hours: Double, var maxPoints: Int, var officeId: String?)
        val byDay = sortedMapOf<String, Acc>()
        for (v in visits) {
            val start = parse(v.startAt)
            val end = parse(v.endAt)
            val segs = if (end <= start) listOf(Triple(start, start, dayKey(start, zone)))
            else splitAtLocalMidnights(start, end, zone).map { Triple(it.first, it.second, dayKey(it.first, zone)) }
            for ((s, e, key) in segs) {
                val pts = if (v.pointsAwarded > 0) v.pointsAwarded else pointsByOffice[v.officeLocationId ?: ""] ?: 1
                val cur = byDay.getOrPut(key) { Acc(s, e, 0.0, 0, v.officeLocationId) }
                cur.firstIn = minOf(cur.firstIn, s)
                cur.lastOut = maxOf(cur.lastOut, e)
                cur.hours += hoursBetween(s, e)
                if (pts >= cur.maxPoints) {
                    cur.maxPoints = pts
                    cur.officeId = v.officeLocationId ?: cur.officeId
                }
            }
        }
        return byDay.map { (k, a) -> DayPoints(k, a.maxPoints, a.hours, iso(a.firstIn), iso(a.lastOut), a.officeId) }
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

    private fun covered(start: Long, end: Long, exclusions: List<ExclusionInput>): Boolean =
        exclusions.any {
            val s = parse(it.startAt); val e = parse(it.endAt)
            overlaps(start, end, s, e) && start >= s && end <= e
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
