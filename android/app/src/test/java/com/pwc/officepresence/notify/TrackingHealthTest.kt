package com.pwc.officepresence.notify

import com.pwc.officepresence.notify.TrackingHealth.Inputs
import com.pwc.officepresence.notify.TrackingHealth.Problem
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TrackingHealthTest {
    private val zone = ZoneId.of("Asia/Kolkata")
    private val tuesday = ZonedDateTime.of(2026, 11, 17, 12, 0, 0, 0, zone)
    private val saturday = ZonedDateTime.of(2026, 11, 21, 12, 0, 0, 0, zone)
    private val ok = Inputs(true, true, true, tuesday.toInstant().toEpochMilli() - 3_600_000)

    @Test
    fun healthyPhoneHasNoProblems() {
        assertTrue(TrackingHealth.problems(ok, tuesday).isEmpty())
    }

    @Test
    fun missingBackgroundPermission() {
        assertEquals(listOf(Problem.Permission), TrackingHealth.problems(ok.copy(backgroundGranted = false), tuesday))
    }

    @Test
    fun locationOff() {
        assertEquals(listOf(Problem.LocationOff), TrackingHealth.problems(ok.copy(locationEnabled = false), tuesday))
    }

    @Test
    fun noSyncForADayOnlyOnWeekdays() {
        val stale = ok.copy(lastSuccessfulSyncAtMs = tuesday.toInstant().toEpochMilli() - 25 * 3_600_000L)
        assertEquals(listOf(Problem.NotSyncing), TrackingHealth.problems(stale, tuesday))
        val staleSat = ok.copy(lastSuccessfulSyncAtMs = saturday.toInstant().toEpochMilli() - 25 * 3_600_000L)
        assertTrue(TrackingHealth.problems(staleSat, saturday).isEmpty())
        assertTrue(TrackingHealth.problems(ok.copy(lastSuccessfulSyncAtMs = 0L), tuesday).isEmpty())
    }

    @Test
    fun atMostOncePerProblemPer24Hours() {
        val now = tuesday.toInstant().toEpochMilli()
        val last = mapOf("location_off" to now - 3_600_000L, "permission" to now - 25 * 3_600_000L)
        val due = TrackingHealth.due(listOf(Problem.Permission, Problem.LocationOff, Problem.NotSyncing), last, now)
        assertEquals(listOf(Problem.Permission, Problem.NotSyncing), due)
    }

    @Test
    fun encodeAndParseRoundTrip() {
        val map = mapOf("permission" to 1L, "not_syncing" to 2L)
        assertEquals(map, TrackingHealth.parse(TrackingHealth.encode(map)))
        assertTrue(TrackingHealth.parse("").isEmpty())
    }
}
