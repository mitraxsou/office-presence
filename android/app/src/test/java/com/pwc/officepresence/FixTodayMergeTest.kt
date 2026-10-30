package com.pwc.officepresence

import com.pwc.officepresence.ui.compose.FixTodayPayload
import com.pwc.officepresence.ui.compose.FixVisit
import com.pwc.officepresence.ui.compose.MergedStay
import com.pwc.officepresence.ui.compose.VisitFragment
import com.pwc.officepresence.ui.compose.buildFixTodayBody
import com.pwc.officepresence.ui.compose.editorGapMinutes
import com.pwc.officepresence.ui.compose.localHm
import com.pwc.officepresence.ui.compose.mergeVisitFragments
import com.pwc.officepresence.ui.compose.parseHmStrict
import com.pwc.officepresence.ui.compose.splitHm
import com.pwc.officepresence.ui.compose.staysToFixVisits
import com.pwc.officepresence.ui.compose.visitOrderError
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId
import java.time.ZoneOffset

class FixTodayMergeTest {
    private fun min(hour: Int, minute: Int) = (hour * 60 + minute) * 60_000L

    @Test
    fun nearbySameOfficeFragmentsBecomeOneStay() {
        val stays = mergeVisitFragments(
            listOf(
                VisitFragment("egl", "EGL", min(9, 0), min(9, 10)),
                VisitFragment("egl", "EGL", min(9, 12), min(9, 20)),
                VisitFragment("egl", "EGL", min(9, 33), min(9, 40)),
                VisitFragment("egl", "EGL", min(9, 55), min(10, 10)),
                VisitFragment("egl", "EGL", min(10, 10), min(10, 20)),
            ),
            gapMinutes = 15,
            nowMs = min(12, 0),
            inOffice = false,
            openOfficeName = null,
        )
        assertEquals(2, stays.size)
        assertEquals(min(9, 0), stays[0].inMs)
        assertEquals(min(9, 40), stays[0].outMs)
        assertEquals(min(9, 55), stays[1].inMs)
        assertEquals(min(10, 20), stays[1].outMs)
    }

    @Test
    fun loneInstantBecomesOneMinute() {
        val stays = mergeVisitFragments(
            listOf(VisitFragment("egl", "EGL", min(10, 49), min(10, 49))),
            gapMinutes = 15,
            nowMs = min(12, 0),
            inOffice = false,
            openOfficeName = null,
        )
        assertEquals(min(10, 49), stays[0].inMs)
        assertEquals(min(10, 50), stays[0].outMs)
    }

    @Test
    fun gapOfFifteenMinutesStartsANewVisit() {
        val stays = mergeVisitFragments(
            listOf(
                VisitFragment("egl", "EGL", min(9, 0), min(9, 30)),
                VisitFragment("egl", "EGL", min(9, 45), min(10, 0)),
            ),
            gapMinutes = 15,
            nowMs = min(12, 0),
            inOffice = false,
            openOfficeName = null,
        )
        assertEquals(2, stays.size)
    }

    @Test
    fun differentOfficesStaySeparate() {
        val stays = mergeVisitFragments(
            listOf(
                VisitFragment("a", "EGL", min(9, 0), min(9, 30)),
                VisitFragment("b", "Other", min(9, 31), min(10, 0)),
            ),
            gapMinutes = 15,
            nowMs = min(12, 0),
            inOffice = false,
            openOfficeName = null,
        )
        assertEquals(2, stays.size)
    }

    @Test
    fun zeroPolicyGapUsesFifteenMinutes() {
        assertEquals(15, editorGapMinutes(0))
        assertEquals(15, editorGapMinutes(15))
    }

    @Test
    fun twelveHourTextParsesAndBlankDoesNot() {
        assertEquals(9 to 5, parseHmStrict("9:05 am"))
        assertEquals(18 to 0, parseHmStrict("6:00 pm"))
        assertEquals(11 to 52, parseHmStrict("11:52"))
        assertNull(parseHmStrict(""))
        assertNull(parseHmStrict("am"))
    }

    @Test
    fun laterOutIsAcceptedAndReversalIsRejected() {
        assertNull(visitOrderError("01:49", "05:49", stillIn = false))
        assertNull(visitOrderError("11:30 am", "12:15 pm", stillIn = false))
        assertEquals("Out must be after In", visitOrderError("05:49", "01:49", stillIn = false))
    }

    @Test
    fun splitNeedsTwoMinutes() {
        assertEquals("10:30", splitHm("10:00", "11:00"))
        assertNull(splitHm("10:49", "10:49"))
        assertNull(splitHm("10:00", "10:01"))
    }

    @Test
    fun subMinuteStayNeverShowsEqualTimes() {
        val stays = mergeVisitFragments(
            listOf(VisitFragment("egl", "EGL", min(6, 3) + 10_000L, min(6, 3) + 50_000L)),
            gapMinutes = 15,
            nowMs = min(12, 0),
            inOffice = false,
            openOfficeName = null,
        )
        val zone = ZoneOffset.UTC
        assertEquals("06:03", localHm(stays[0].inMs, zone))
        assertEquals("06:04", localHm(stays[0].outMs, zone))
    }

    private val day = "2026-10-30"
    private val ist = ZoneId.of("Asia/Kolkata")
    private fun ready(rows: List<FixVisit>): JSONObject {
        val p = buildFixTodayBody(day, "fix", rows, ist)
        assertTrue("expected Ready, got $p", p is FixTodayPayload.Ready)
        return (p as FixTodayPayload.Ready).body
    }
    private fun invalid(rows: List<FixVisit>) = buildFixTodayBody(day, "fix", rows, ist) as FixTodayPayload.Invalid

    @Test
    fun noRowsMeansShouldNotCount() {
        val body = ready(emptyList())
        assertEquals("should_not_count", body.getString("issue"))
        assertTrue(body.getJSONObject("requested").getBoolean("remove"))
    }

    @Test
    fun emptyStaysOpenFixTodayWithNoInventedRow() {
        assertTrue(staysToFixVisits(emptyList(), ist).isEmpty())
        val rows = staysToFixVisits(
            listOf(MergedStay("egl", "EGL", min(9, 0), min(10, 0), stillIn = false)),
            ZoneOffset.UTC,
        )
        assertEquals(1, rows.size)
        assertEquals("egl", rows[0].officeId)
        assertEquals("09:00", rows[0].inHm)
    }

    @Test
    fun everyRowKeepsItsOwnOffice() {
        val body = ready(
            listOf(
                FixVisit("egl", "EGL", "09:00", "11:00", false),
                FixVisit("salt", "Salt Lake", "12:00", "15:30", false),
                FixVisit("egl", "EGL", "16:00", "", true),
            ),
        )
        val visits = body.getJSONObject("requested").getJSONArray("visits")
        assertEquals(3, visits.length())
        assertEquals(listOf("egl", "salt", "egl"), (0 until 3).map { visits.getJSONObject(it).getString("office_id") })
        assertEquals("2026-10-30T06:30:00Z", visits.getJSONObject(1).getString("in_at"))
        assertTrue(visits.getJSONObject(2).isNull("out_at"))
        assertEquals("egl", body.getString("officeLocationId"))
    }

    @Test
    fun rowsAreSentInTimeOrderWithLegacyFirstPair() {
        val body = ready(
            listOf(
                FixVisit("salt", "Salt Lake", "13:00", "14:00", false),
                FixVisit("egl", "EGL", "09:00", "10:00", false),
            ),
        )
        val requested = body.getJSONObject("requested")
        assertEquals("egl", requested.getJSONArray("visits").getJSONObject(0).getString("office_id"))
        assertEquals("2026-10-30T03:30:00Z", requested.getString("in_at"))
        assertEquals("2026-10-30T04:30:00Z", requested.getString("out_at"))
        assertEquals("egl", requested.getString("office_id"))
        assertEquals("2026-10-30T04:30:00Z", body.getString("proposedEnd"))
    }

    @Test
    fun stillInOnlyOnTheLastRow() {
        val bad = invalid(
            listOf(
                FixVisit("egl", "EGL", "09:00", "", true),
                FixVisit("salt", "Salt Lake", "11:00", "12:00", false),
            ),
        )
        assertEquals(1, bad.row)
        assertEquals("Only the last visit can be Still In", bad.message)
    }

    @Test
    fun overlapNamesTheLaterRow() {
        val bad = invalid(
            listOf(
                FixVisit("egl", "EGL", "09:00", "11:00", false),
                FixVisit("salt", "Salt Lake", "10:30", "12:00", false),
            ),
        )
        assertEquals(2, bad.row)
        assertEquals("This visit overlaps the one before it", bad.message)
    }

    @Test
    fun backToBackRowsAreFine() {
        ready(
            listOf(
                FixVisit("egl", "EGL", "09:00", "11:00", false),
                FixVisit("salt", "Salt Lake", "11:00", "12:00", false),
            ),
        )
    }

    @Test
    fun reversedOrBlankRowReportsItsRow() {
        val reversed = invalid(listOf(FixVisit("egl", "EGL", "09:00", "10:00", false), FixVisit("egl", "EGL", "14:00", "13:00", false)))
        assertEquals(2, reversed.row)
        assertEquals("Out must be after In", reversed.message)
        val blank = invalid(listOf(FixVisit("egl", "EGL", "09:00", "", false)))
        assertEquals("Enter an Out time", blank.message)
    }

    @Test
    fun blankOfficeIsLeftOut() {
        val body = ready(listOf(FixVisit("", "Office", "09:00", "10:00", false)))
        assertFalse(body.getJSONObject("requested").getJSONArray("visits").getJSONObject(0).has("office_id"))
        assertFalse(body.has("officeLocationId"))
    }
}
