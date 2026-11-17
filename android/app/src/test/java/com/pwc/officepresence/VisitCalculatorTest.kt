package com.pwc.officepresence

import com.pwc.officepresence.presence.AdminVisitInput
import com.pwc.officepresence.presence.ExceptionDayInput
import com.pwc.officepresence.presence.ExclusionInput
import com.pwc.officepresence.presence.OfficeFenceInput
import com.pwc.officepresence.presence.MidnightBoundary
import com.pwc.officepresence.presence.PresenceEventInput
import com.pwc.officepresence.presence.PresenceRules
import com.pwc.officepresence.presence.VisitCalculator
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.Instant

class VisitCalculatorTest {
    private fun sharedFile(): File {
        var cur: File? = File(".").canonicalFile
        repeat(8) {
            val candidate = File(cur, "shared/visit-cases.json")
            if (candidate.exists()) return candidate
            cur = cur?.parentFile
        }
        throw AssertionError("shared/visit-cases.json not found")
    }

    private fun fence(o: JSONObject) = OfficeFenceInput(
        o.getDouble("lat"),
        o.getDouble("lng"),
        o.getDouble("radiusMeters"),
        if (o.has("id")) o.getString("id") else null,
        o.optInt("pointsPerVisitDay", 1),
    )

    @Test
    fun sharedCases() {
        val cases = JSONObject(sharedFile().readText()).getJSONArray("cases")
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val id = c.getString("id")
            val r = c.getJSONObject("rules")
            val rules = PresenceRules(
                gapMinutes = r.getInt("gapMinutes"),
                gapSeconds = if (r.has("gapSeconds") && !r.isNull("gapSeconds")) r.getInt("gapSeconds") else null,
                dayHours = r.getDouble("dayHours"),
                monthlyDaysTarget = r.getInt("monthlyDaysTarget"),
                monthlyPointsTarget = r.optInt("monthlyPointsTarget", 8),
                timezone = r.getString("timezone"),
                fenceRadiusMeters = r.getDouble("fenceRadiusMeters"),
                sampleIntervalMinutes = r.optInt("sampleIntervalMinutes", 10),
            )
            val events = mutableListOf<PresenceEventInput>()
            val evArr = c.getJSONArray("events")
            for (j in 0 until evArr.length()) {
                val e = evArr.getJSONObject(j)
                events += PresenceEventInput(
                    type = e.getString("type"),
                    at = e.getString("at"),
                    lat = if (e.has("lat")) e.getDouble("lat") else null,
                    lng = if (e.has("lng")) e.getDouble("lng") else null,
                    accuracyMeters = if (e.has("accuracyMeters")) e.getDouble("accuracyMeters") else null,
                    simulated = e.optBoolean("simulated", false),
                    officeLocationId = if (e.has("officeLocationId")) e.getString("officeLocationId") else null,
                )
            }
            val admins = mutableListOf<AdminVisitInput>()
            val aArr = c.getJSONArray("adminVisits")
            for (j in 0 until aArr.length()) {
                val a = aArr.getJSONObject(j)
                admins += AdminVisitInput(a.getString("startAt"), a.getString("endAt"))
            }
            val exclusions = mutableListOf<ExclusionInput>()
            val xArr = c.getJSONArray("exclusions")
            for (j in 0 until xArr.length()) {
                val x = xArr.getJSONObject(j)
                exclusions += ExclusionInput(x.getString("startAt"), x.getString("endAt"))
            }
            val offices = c.optJSONArray("offices")?.let { arr -> (0 until arr.length()).map { fence(arr.getJSONObject(it)) } }
            val nowMs = if (c.has("now")) Instant.parse(c.getString("now")).toEpochMilli() else System.currentTimeMillis()
            val result = VisitCalculator.compute(rules, events, admins, exclusions, fence(c.getJSONObject("office")), offices, now = nowMs)
            val x = c.getJSONObject("expected")
            assertEquals("$id visitCount", x.getInt("visitCount"), result.visits.size)
            assertEquals("$id totalHours", x.getDouble("totalHours"), result.totalHours, 0.001)
            assertEquals("$id dayMet", x.getBoolean("dayMet"), result.dayMet)
            if (x.has("visitDays")) assertEquals("$id visitDays", x.getInt("visitDays"), result.visitDays)
            if (x.has("totalPoints")) assertEquals("$id totalPoints", x.getInt("totalPoints"), result.totalPoints)
            if (x.has("targetMet")) assertEquals("$id targetMet", x.getBoolean("targetMet"), result.targetMet)
            if (x.has("dayKeys")) {
                val keys = x.getJSONArray("dayKeys")
                assertEquals("$id dayKeys", (0 until keys.length()).map { keys.getString(it) }, result.days.map { it.dayKey })
            }
            if (x.has("dayHours")) {
                val hrs = x.getJSONArray("dayHours")
                for (k in 0 until hrs.length()) assertEquals("$id dayHours[$k]", hrs.getDouble(k), result.days[k].hours, 0.001)
            }
            if (x.has("open")) assertEquals("$id open", x.getBoolean("open"), result.visits.any { it.open })
        }
    }

    @Test
    fun simulatedNeverCounts() {
        val result = VisitCalculator.compute(
            PresenceRules(),
            listOf(
                PresenceEventInput("enter", "2026-10-27T04:00:00.000Z", 12.97, 77.59, 10.0, true),
                PresenceEventInput("exit", "2026-10-27T12:00:00.000Z", 12.97, 77.59, 10.0, true),
            ),
            office = OfficeFenceInput(12.97, 77.59, 100.0),
        )
        assertTrue(result.visits.isEmpty())
        assertFalse(result.dayMet)
        assertEquals(0, result.totalPoints)
    }

    @Test
    fun puneFourPointsTwoDaysMeetsEight() {
        val pune = OfficeFenceInput(18.52, 73.85, 100.0, "pune", 4)
        val ev = listOf(
            PresenceEventInput("enter", "2026-10-05T04:00:00Z", 18.52, 73.85, 10.0),
            PresenceEventInput("exit", "2026-10-05T04:05:00Z", 18.52, 73.85, 10.0),
            PresenceEventInput("enter", "2026-10-06T04:00:00Z", 18.52, 73.85, 10.0),
            PresenceEventInput("exit", "2026-10-06T04:05:00Z", 18.52, 73.85, 10.0),
        )
        val r = VisitCalculator.compute(PresenceRules(), ev, offices = listOf(pune))
        assertEquals(8, r.totalPoints)
        assertTrue(r.targetMet)
        assertFalse(r.dayMet)
    }

    @Test
    fun pointsSnapshotWinsOverCurrentOfficeWeight() {
        val pune = OfficeFenceInput(18.52, 73.85, 100.0, "pune", 3)
        val ev = listOf(
            PresenceEventInput("enter", "2026-10-05T04:00:00Z", 18.52, 73.85, 10.0, officeLocationId = "pune", pointsAtMatch = 1),
            PresenceEventInput("exit", "2026-10-05T04:05:00Z", 18.52, 73.85, 10.0, officeLocationId = "pune", pointsAtMatch = 1),
            PresenceEventInput("enter", "2026-10-06T04:00:00Z", 18.52, 73.85, 10.0, officeLocationId = "pune"),
            PresenceEventInput("exit", "2026-10-06T04:05:00Z", 18.52, 73.85, 10.0, officeLocationId = "pune"),
        )
        val r = VisitCalculator.compute(PresenceRules(), ev, offices = listOf(pune))
        assertEquals(listOf(1, 3), r.days.map { it.points })
    }

    @Test
    fun adminStoredAwardIsKept() {
        val pune = OfficeFenceInput(18.52, 73.85, 100.0, "pune", 3)
        val r = VisitCalculator.compute(
            PresenceRules(),
            events = emptyList(),
            adminVisits = listOf(AdminVisitInput("2026-10-07T04:00:00Z", "2026-10-07T09:00:00Z", "pune", 2)),
            offices = listOf(pune),
        )
        assertEquals(2, r.totalPoints)
    }

    @Test
    fun fifteenSecondGapSplitsVisit() {
        val result = VisitCalculator.compute(
            PresenceRules(gapMinutes = 0, gapSeconds = 15, dayHours = 5.0),
            listOf(
                PresenceEventInput("enter", "2026-10-27T04:00:00.000Z", 12.97, 77.59, 10.0, false),
                PresenceEventInput("sample", "2026-10-27T04:00:10.000Z", 12.97, 77.59, 10.0, false),
                PresenceEventInput("sample", "2026-10-27T04:00:40.000Z", 12.97, 77.59, 10.0, false),
            ),
            office = OfficeFenceInput(12.97, 77.59, 100.0),
        )
        assertEquals(2, result.visits.size)
    }

    @Test
    fun midnightBoundaryStartsAndCountsTheNewLocalDay() {
        val result = VisitCalculator.compute(
            PresenceRules(timezone = "Asia/Kolkata"),
            listOf(
                PresenceEventInput("check_in", "2026-10-27T17:30:00.000Z", officeLocationId = "kol"),
                PresenceEventInput("check_out", "2026-10-27T18:30:00.000Z", officeLocationId = "kol"),
                PresenceEventInput("check_in", "2026-10-27T18:30:00.000Z", officeLocationId = "kol"),
            ),
        )
        assertEquals(listOf("2026-10-27", "2026-10-28"), result.days.map { it.dayKey })
        assertEquals(listOf(1.0, 0.0), result.days.map { it.hours })
        assertEquals(2, result.totalPoints)
    }

    @Test
    fun nextBoundaryUsesTheAccountTimezone() {
        val now = java.time.Instant.parse("2026-10-27T17:00:00.000Z").toEpochMilli()
        val boundary = MidnightBoundary.nextDayStartMs(now, "Asia/Kolkata")
        assertEquals(java.time.Instant.parse("2026-10-27T18:30:00.000Z").toEpochMilli(), boundary)
        assertEquals("2026-10-28", MidnightBoundary.dayKey(boundary, "Asia/Kolkata"))
        assertTrue(MidnightBoundary.sampleSupportsBoundary(boundary - 5 * 60_000L, boundary, 15, 5))
        assertFalse(MidnightBoundary.sampleSupportsBoundary(boundary - 20 * 60_000L, boundary, 15, 5))
    }

    @Test
    fun exclusionRemovesStoredVisitForThatLocalDayOnly() {
        val result = VisitCalculator.compute(
            PresenceRules(timezone = "Asia/Kolkata"),
            events = emptyList(),
            adminVisits = listOf(
                AdminVisitInput(
                    "2026-10-27T17:30:00.000Z",
                    "2026-10-28T03:30:00.000Z",
                    "kol",
                    1,
                ),
            ),
            exclusions = listOf(
                ExclusionInput("2026-10-27T18:30:00.000Z", "2026-10-28T18:30:00.000Z"),
            ),
        )
        assertEquals(1, result.visits.size)
        assertEquals("2026-10-27T17:30:00Z", result.visits[0].startAt)
        assertEquals("2026-10-27T18:30:00Z", result.visits[0].endAt)
        assertEquals(listOf("2026-10-27"), result.days.map { it.dayKey })
    }

    @Test
    fun exceptionDayTakesTheHigherOfVisitAndException() {
        val result = VisitCalculator.compute(
            PresenceRules(timezone = "Asia/Kolkata"),
            events = emptyList(),
            adminVisits = listOf(AdminVisitInput("2026-11-16T04:00:00.000Z", "2026-11-16T10:00:00.000Z", "blr", 1)),
            exceptionDays = listOf(
                ExceptionDayInput("2026-11-16", 4, "a", "pune"),
                ExceptionDayInput("2026-11-16", 2, "b", "pune"),
                ExceptionDayInput("2026-11-17", 4, "a", "pune"),
            ),
        )
        assertEquals(listOf("2026-11-16", "2026-11-17"), result.days.map { it.dayKey })
        assertEquals(listOf(4, 4), result.days.map { it.points })
        assertEquals(8, result.totalPoints)
        assertTrue(result.targetMet)
        assertEquals(null, result.days[1].firstIn)
        assertEquals("a", result.days[0].exception?.id)
    }
}
