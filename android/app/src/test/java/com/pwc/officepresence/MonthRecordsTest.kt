package com.pwc.officepresence

import com.pwc.officepresence.ui.compose.DayMark
import com.pwc.officepresence.ui.compose.MonthLeaveRules
import com.pwc.officepresence.ui.compose.MonthRecords
import com.pwc.officepresence.ui.compose.markFor
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MonthRecordsTest {
    private fun report() = JSONObject()
        .put("month", "2026-11")
        .put("allowSelfLeave", true)
        .put("holidays", JSONArray().put(JSONObject().put("dayKey", "2026-11-24").put("name", "Guru Nanak Jayanti")))
        .put("leaveDays", JSONArray().put(JSONObject().put("dayKey", "2026-11-19").put("kind", "leave").put("note", JSONObject.NULL).put("source", "self")))
        .put(
            "exceptionDays",
            JSONArray().put(
                JSONObject().put("dayKey", "2026-11-13").put("points", 1).put("officeName", "Gurugram")
                    .put("homeOffice", true).put("reason", "Client workshop").put("grantedBy", "Anjali Desai"),
            ),
        )

    @Test
    fun oldServerResponseWithoutNewFieldsDoesNotCrash() {
        val r = MonthRecords.parse(JSONObject().put("month", "2026-11").put("monthPoints", 3))
        assertTrue(r.isEmpty)
        assertFalse(r.allowSelfLeave)
        assertNull(r.markFor("2026-11-13"))
        assertTrue(MonthRecords.parse(null).isEmpty)
        val malformed = MonthRecords.parse(JSONObject().put("holidays", "nope").put("leaveDays", JSONArray().put(3)))
        assertTrue(malformed.isEmpty)
    }

    @Test
    fun parsesRecordsAndMarks() {
        val r = MonthRecords.parse(report())
        assertEquals("Guru Nanak Jayanti", r.holidays["2026-11-24"])
        assertNull(r.leave["2026-11-19"]?.note)
        assertEquals(DayMark.Exception, r.markFor("2026-11-13"))
        assertEquals(DayMark.Holiday, r.markFor("2026-11-24"))
        assertEquals(DayMark.Leave, r.markFor("2026-11-19"))
        assertEquals("Gurugram home office", MonthLeaveRules.exceptionOffice(r.exceptions.getValue("2026-11-13")))
        assertEquals("Includes 1 HR exception day", MonthLeaveRules.includesExceptions(1))
        assertNull(MonthLeaveRules.includesExceptions(0))
    }

    @Test
    fun leaveOnlyOnOpenWorkingDays() {
        val r = MonthRecords.parse(report())
        fun can(day: String, hasVisit: Boolean = false, readonly: Boolean = false) =
            MonthLeaveRules.canMarkLeave(day, r, hasVisit, "2026-11", readonly)
        assertTrue(can("2026-11-18"))
        assertTrue(can("2026-10-30"))
        assertTrue(can("2026-11-19"))
        assertFalse(can("2026-11-21"))
        assertFalse(can("2026-11-24"))
        assertFalse(can("2026-11-13"))
        assertFalse(can("2026-11-18", hasVisit = true))
        assertFalse(can("2026-11-18", readonly = true))
        assertFalse(can("2026-09-30"))
        assertFalse(MonthLeaveRules.canMarkLeave("2026-11-18", MonthRecords.parse(JSONObject()), false, "2026-11", false))
    }

    @Test
    fun todayNoticeReadsCachedJson() {
        val (holiday, leave) = MonthRecords.parseToday(
            """[{"dayKey":"2026-11-24","name":"Guru Nanak Jayanti"}]""",
            "not json",
            "2026-11-24",
        )
        assertEquals("Guru Nanak Jayanti", holiday)
        assertNull(leave)
    }
}
