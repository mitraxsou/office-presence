package com.pwc.officepresence.presence

import java.time.Instant
import java.time.ZoneId

object MidnightBoundary {
    fun zone(timezone: String): ZoneId = try {
        ZoneId.of(timezone)
    } catch (_: Exception) {
        ZoneId.of("Asia/Kolkata")
    }

    fun currentDayStartMs(nowMs: Long, timezone: String): Long =
        Instant.ofEpochMilli(nowMs)
            .atZone(zone(timezone))
            .toLocalDate()
            .atStartOfDay(zone(timezone))
            .toInstant()
            .toEpochMilli()

    fun nextDayStartMs(nowMs: Long, timezone: String): Long =
        Instant.ofEpochMilli(nowMs)
            .atZone(zone(timezone))
            .toLocalDate()
            .plusDays(1)
            .atStartOfDay(zone(timezone))
            .toInstant()
            .toEpochMilli()

    fun dayKey(boundaryMs: Long, timezone: String): String =
        Instant.ofEpochMilli(boundaryMs).atZone(zone(timezone)).toLocalDate().toString()

    fun sampleSupportsBoundary(
        sampleAtMs: Long,
        boundaryMs: Long,
        gapMinutes: Int,
        sampleIntervalMinutes: Int,
    ): Boolean {
        if (sampleAtMs <= 0L) return false
        val freshnessMs =
            maxOf(gapMinutes.coerceAtLeast(1), sampleIntervalMinutes.coerceAtLeast(1) * 2) * 60_000L
        return kotlin.math.abs(sampleAtMs - boundaryMs) <= freshnessMs
    }
}
