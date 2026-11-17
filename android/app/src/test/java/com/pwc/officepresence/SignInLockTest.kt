package com.pwc.officepresence

import com.pwc.officepresence.ui.SignInLock
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SignInLockTest {
    @Test
    fun readsRetryAfterFromA429() {
        val res = JSONObject().put("_httpStatus", 429).put("retryAfterSeconds", 872)
        assertTrue(SignInLock.isThrottled(res))
        assertEquals(872, SignInLock.retryAfterSeconds(res))
        assertEquals(1_000L + 872_000L, SignInLock.unlockAtMs(res, 1_000L))
    }

    @Test
    fun defaultsTo15MinutesWithoutABody() {
        val res = JSONObject().put("_httpStatus", 429)
        assertEquals(900, SignInLock.retryAfterSeconds(res))
        assertFalse(SignInLock.isThrottled(JSONObject().put("_httpStatus", 401)))
    }

    @Test
    fun countsDownAndFormats() {
        assertEquals(872, SignInLock.remainingSeconds(872_000L, 0L))
        assertEquals(1, SignInLock.remainingSeconds(1_500L, 1_000L))
        assertEquals(0, SignInLock.remainingSeconds(1_000L, 2_000L))
        assertEquals("14:32", SignInLock.label(872))
        assertEquals("0:05", SignInLock.label(5))
        assertEquals(
            "Wait 14:32, then try again. Ask for a new code after that.",
            SignInLock.body(872, password = false),
        )
    }
}
