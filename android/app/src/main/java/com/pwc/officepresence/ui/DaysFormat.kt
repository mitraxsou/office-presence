package com.pwc.officepresence.ui

/** UI helpers: API still uses points; screens never say "points". */
object DaysFormat {
    fun meter(current: Int, target: Int): Triple<String, String, Boolean> {
        val c = current.coerceAtLeast(0)
        val t = target.coerceAtLeast(1)
        val met = c >= t
        val side = if (met) "Goal met" else "${(t - c).coerceAtLeast(0)} to go"
        return Triple("$c / $t days", side, met)
    }

    fun countsAs(n: Int): String {
        val v = n.coerceAtLeast(0)
        return if (v == 1) "Counts as 1 day" else "Counts as $v days"
    }

    fun daysCounted(n: Int): String {
        val v = n.coerceAtLeast(0)
        return if (v == 1) "1 day counted" else "$v days counted"
    }
}
