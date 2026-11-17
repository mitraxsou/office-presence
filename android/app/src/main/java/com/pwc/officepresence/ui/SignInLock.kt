package com.pwc.officepresence.ui

import org.json.JSONObject

/** Sign-in lock after the server answers 429 (frames 1.1 and 2.1). */
object SignInLock {
    private const val DEFAULT_SECONDS = 15 * 60

    fun isThrottled(res: JSONObject): Boolean = res.optInt("_httpStatus", 0) == 429

    fun retryAfterSeconds(res: JSONObject): Int {
        val s = res.optInt("retryAfterSeconds", 0)
        return if (s > 0) s else DEFAULT_SECONDS
    }

    fun unlockAtMs(res: JSONObject, nowMs: Long): Long = nowMs + retryAfterSeconds(res) * 1000L

    fun remainingSeconds(untilMs: Long, nowMs: Long): Int {
        if (untilMs <= nowMs) return 0
        return ((untilMs - nowMs + 999L) / 1000L).toInt()
    }

    /** "14:32" style countdown. */
    fun label(seconds: Int): String {
        val s = seconds.coerceAtLeast(0)
        return "${s / 60}:${(s % 60).toString().padStart(2, '0')}"
    }

    fun body(seconds: Int, password: Boolean): String = if (password) {
        "Wait ${label(seconds)}, then try again. You can also sign in with a Teams code after that."
    } else {
        "Wait ${label(seconds)}, then try again. Ask for a new code after that."
    }
}
