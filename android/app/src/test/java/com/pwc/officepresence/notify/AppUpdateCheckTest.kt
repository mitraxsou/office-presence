package com.pwc.officepresence.notify

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppUpdateCheckTest {
    @Test
    fun upToDateOrUnknownIsNotOutdated() {
        assertFalse(AppUpdateCheck.isOutdated(16, 0))
        assertFalse(AppUpdateCheck.isOutdated(16, 16))
        assertFalse(AppUpdateCheck.isOutdated(17, 16))
    }

    @Test
    fun olderInstallIsOutdated() {
        assertTrue(AppUpdateCheck.isOutdated(15, 16))
    }

    @Test
    fun remindsOncePerDayUntilUpdated() {
        assertTrue(AppUpdateCheck.shouldRemind(15, 16, "", "2026-11-18"))
        assertFalse(AppUpdateCheck.shouldRemind(15, 16, "2026-11-18", "2026-11-18"))
        assertTrue(AppUpdateCheck.shouldRemind(15, 16, "2026-11-18", "2026-11-19"))
        assertFalse(AppUpdateCheck.shouldRemind(16, 16, "", "2026-11-19"))
        assertFalse(AppUpdateCheck.shouldRemind(15, 0, "", "2026-11-19"))
    }

    @Test
    fun downloadPageUsesTheApiHost() {
        assertEquals("https://example.com/download", AppUpdateCheck.downloadPage("https://example.com"))
        assertEquals("https://example.com/download", AppUpdateCheck.downloadPage("https://example.com/"))
    }

    @Test
    fun noticeNamesTheVersion() {
        assertEquals(
            "Version 2.2.0 is ready. Open the download page to install it.",
            AppUpdateCheck.notice("2.2.0"),
        )
        assertEquals(
            "A new version is ready. Open the download page to install it.",
            AppUpdateCheck.notice("  "),
        )
    }
}
