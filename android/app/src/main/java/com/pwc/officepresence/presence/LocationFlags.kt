package com.pwc.officepresence.presence

import android.location.Location
import android.os.Build

object LocationFlags {
    /** True when the fix came from a mock location app (Developer options). */
    fun isMock(loc: Location?): Boolean {
        if (loc == null) return false
        return if (Build.VERSION.SDK_INT >= 31) loc.isMock
        else @Suppress("DEPRECATION") loc.isFromMockProvider
    }
}
