package com.pwc.officepresence.notify

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ExceptionNoticesTest {
    private fun added(id: String, vararg days: String, points: Int = 1, office: String = "Gurugram") =
        ExceptionNotices.Added(id, days.toList(), points, office)

    @Test
    fun firstSyncIsSilentAndMarksSeen() {
        val r = ExceptionNotices.process(null, listOf(added("a", "2026-11-13")))
        assertTrue(r.toNotify.isEmpty())
        assertEquals(listOf("a"), r.seen)
    }

    @Test
    fun newIdNotifiesOnce() {
        val first = ExceptionNotices.process(listOf("a"), listOf(added("a", "2026-11-13"), added("b", "2026-11-16")))
        assertEquals(listOf("b"), first.toNotify.map { it.id })
        val again = ExceptionNotices.process(first.seen, listOf(added("b", "2026-11-16")))
        assertTrue(again.toNotify.isEmpty())
    }

    @Test
    fun bodyMatchesTheFrame() {
        assertEquals("Fri 13 Nov counts as 1 point (Gurugram).", ExceptionNotices.body(added("a", "2026-11-13")))
        assertEquals(
            "Mon 9 Nov to Fri 13 Nov count as 4 points a day (Pune).",
            ExceptionNotices.body(added("b", "2026-11-09", "2026-11-13", points = 4, office = "Pune")),
        )
    }

    @Test
    fun parsesServerRowsAndToleratesOldServers() {
        assertTrue(ExceptionNotices.parse(null).isEmpty())
        val arr = JSONArray()
            .put(JSONObject().put("id", "x").put("days", JSONArray().put("2026-11-13")).put("pointsPerDay", 1).put("officeName", "Gurugram"))
            .put(JSONObject().put("id", "y").put("startDay", "2026-11-16"))
            .put(JSONObject().put("days", JSONArray()))
        val parsed = ExceptionNotices.parse(arr)
        assertEquals(listOf("x", "y"), parsed.map { it.id })
        assertEquals(listOf("2026-11-16"), parsed[1].days)
        assertEquals("Office", parsed[1].officeName)
    }
}
