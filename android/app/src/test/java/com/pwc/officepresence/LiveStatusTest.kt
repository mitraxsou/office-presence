package com.pwc.officepresence

import com.pwc.officepresence.data.Office
import com.pwc.officepresence.presence.LiveStatus
import com.pwc.officepresence.presence.PresenceRules
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveStatusTest {
    private val office = Office("o1", "Kolkata", "Home base", 22.5726, 88.3639, 100.0, 2, null)
    private val rules = PresenceRules(fenceRadiusMeters = 100.0)

    @Test
    fun accurateFixInsideIsIn() {
        val r = LiveStatus.fromFix(22.5726, 88.3639, 20.0, listOf(office), rules, 1_000L)!!
        assertTrue(r.inOffice)
        assertEquals("o1", r.officeId)
        assertEquals("Home base", r.officeName)
    }

    @Test
    fun accurateFixOutsideIsOut() {
        val r = LiveStatus.fromFix(22.60, 88.40, 20.0, listOf(office), rules, 1_000L)!!
        assertFalse(r.inOffice)
        assertNull(r.officeId)
    }

    @Test
    fun weakFixDecidesNothing() {
        assertNull(LiveStatus.fromFix(22.60, 88.40, 250.0, listOf(office), rules, 1_000L))
    }

    @Test
    fun sinceCarriesOverWhileReadingsAgree() {
        LiveStatus.publish(LiveStatus.Reading(true, "o1", "Home base", 1_000L))
        LiveStatus.publish(LiveStatus.Reading(true, "o1", "Home base", 6_000L))
        assertEquals(1_000L, LiveStatus.latest.value!!.sinceMs)
        LiveStatus.publish(LiveStatus.Reading(false, null, null, 11_000L))
        assertEquals(11_000L, LiveStatus.latest.value!!.sinceMs)
    }
}
