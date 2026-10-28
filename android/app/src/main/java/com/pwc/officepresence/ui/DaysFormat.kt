package com.pwc.officepresence.ui

/** @deprecated Prefer [PointsFormat]. Delegates so old call sites keep compiling. */
@Deprecated("Use PointsFormat", ReplaceWith("PointsFormat"))
object DaysFormat {
    fun meter(current: Int, target: Int): Triple<String, String, Boolean> = PointsFormat.meter(current, target)

    fun countsAs(n: Int): String = PointsFormat.countsAs(n)

    fun daysCounted(n: Int): String = PointsFormat.pointsCounted(n)
}
