package com.pwc.officepresence.ui

/** UI helpers for monthly points. API fields already use points. */
object PointsFormat {
    fun meter(current: Int, target: Int): Triple<String, String, Boolean> {
        val c = current.coerceAtLeast(0)
        val t = target.coerceAtLeast(1)
        val met = c >= t
        val side = if (met) "Goal met" else "${(t - c).coerceAtLeast(0)} to go"
        return Triple("$c / $t points", side, met)
    }

    fun countsAs(n: Int): String {
        val v = n.coerceAtLeast(0)
        return if (v == 1) "Counts as 1 point" else "Counts as $v points"
    }

    fun pointsCounted(n: Int): String {
        val v = n.coerceAtLeast(0)
        return if (v == 1) "1 point counted" else "$v points counted"
    }

    /** Visit days are information only (SPEC §20). */
    fun visitDaysFyi(n: Int): String {
        val v = n.coerceAtLeast(0)
        return if (v == 1) "1 visit day" else "$v visit days"
    }
}
