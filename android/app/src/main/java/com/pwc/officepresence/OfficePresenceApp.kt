package com.pwc.officepresence

import android.app.Application
import com.pwc.officepresence.data.AppPrefs

class OfficePresenceApp : Application() {
    override fun onCreate() {
        super.onCreate()
        AppPrefs(this).applyTheme()
    }
}
