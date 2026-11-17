package com.pwc.officepresence.notify

import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class WeeklySummaryTest {
    private val zone = ZoneId.of("Asia/Kolkata")

    @Test
    fun nextRunIsTheComingMonday9am() {
        val tuesday = ZonedDateTime.of(2026, 11, 17, 10, 0, 0, 0, zone)
        assertEquals(ZonedDateTime.of(2026, 11, 23, 9, 0, 0, 0, zone), WeeklySummary.nextRun(tuesday))
    }

    @Test
    fun nextRunOnMondayBefore9IsToday() {
        val early = ZonedDateTime.of(2026, 11, 16, 8, 0, 0, 0, zone)
        assertEquals(ZonedDateTime.of(2026, 11, 16, 9, 0, 0, 0, zone), WeeklySummary.nextRun(early))
    }

    @Test
    fun nextRunAtExactly9IsNextWeek() {
        val at9 = ZonedDateTime.of(2026, 11, 16, 9, 0, 0, 0, zone)
        assertEquals(ZonedDateTime.of(2026, 11, 23, 9, 0, 0, 0, zone), WeeklySummary.nextRun(at9))
    }

    @Test
    fun previousWeekIsMondayToSunday() {
        val (start, end) = WeeklySummary.previousWeek(LocalDate.of(2026, 11, 16))
        assertEquals(LocalDate.of(2026, 11, 9), start)
        assertEquals(LocalDate.of(2026, 11, 15), end)
    }

    @Test
    fun visitDaysCountsDaysWithPointsInRange() {
        val days = listOf("2026-11-08" to 1, "2026-11-09" to 1, "2026-11-10" to 0, "2026-11-12" to 3, "bad" to 1)
        assertEquals(2, WeeklySummary.visitDays(days, LocalDate.of(2026, 11, 9), LocalDate.of(2026, 11, 15)))
    }

    @Test
    fun bodyUsesPointsAndNoDashes() {
        val (_, toGo) = WeeklySummary.body(2, 5, 8, "November")
        assertEquals("This week: 2 visit days. Month so far: 5 of 8 points, 3 to go.", toGo)
        val (_, met) = WeeklySummary.body(1, 8, 8, "November")
        assertEquals("This week: 1 visit day. Goal met for November: 8 of 8 points.", met)
        assertFalse(toGo.contains('\u2014') || toGo.contains('\u2013'))
    }
}
