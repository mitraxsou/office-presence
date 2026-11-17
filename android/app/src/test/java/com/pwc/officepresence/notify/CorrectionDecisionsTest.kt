package com.pwc.officepresence.notify

import com.pwc.officepresence.notify.CorrectionDecisions.Decision
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CorrectionDecisionsTest {
    private val a = Decision("a", "2026-11-10", "approved", null)
    private val b = Decision("b", "2026-11-11", "rejected", "Badge log shows WFH")

    @Test
    fun firstSyncIsSilentAndMarksAllSeen() {
        val r = CorrectionDecisions.process(null, listOf(a, b))
        assertTrue(r.toNotify.isEmpty())
        assertEquals(listOf("a", "b"), r.seen)
    }

    @Test
    fun newDecisionNotifiesOnce() {
        val first = CorrectionDecisions.process(listOf("a"), listOf(a, b))
        assertEquals(listOf(b), first.toNotify)
        val second = CorrectionDecisions.process(first.seen, listOf(a, b))
        assertTrue(second.toNotify.isEmpty())
    }

    @Test
    fun revertedIsSeenButNotNotified() {
        val r = CorrectionDecisions.process(emptyList(), listOf(Decision("c", "2026-11-12", "reverted", "x")))
        assertTrue(r.toNotify.isEmpty())
        assertEquals(listOf("c"), r.seen)
    }

    @Test
    fun keepsNewest100() {
        val seen = (1..100).map { "s$it" }
        val r = CorrectionDecisions.process(seen, listOf(a))
        assertEquals(100, r.seen.size)
        assertEquals("a", r.seen.last())
        assertEquals("s2", r.seen.first())
    }

    @Test
    fun dayLabel() {
        assertEquals("Tue 10 Nov", CorrectionDecisions.dayLabel("2026-11-10"))
        assertEquals("bad", CorrectionDecisions.dayLabel("bad"))
    }
}
