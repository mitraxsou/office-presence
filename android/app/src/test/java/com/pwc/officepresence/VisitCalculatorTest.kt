package com.pwc.officepresence

import com.pwc.officepresence.presence.AdminVisitInput
import com.pwc.officepresence.presence.ExclusionInput
import com.pwc.officepresence.presence.OfficeFenceInput
import com.pwc.officepresence.presence.PresenceEventInput
import com.pwc.officepresence.presence.PresenceRules
import com.pwc.officepresence.presence.VisitCalculator
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

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
            val result = VisitCalculator.compute(rules, events, admins, exclusions, fence(c.getJSONObject("office")), offices)
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
}
