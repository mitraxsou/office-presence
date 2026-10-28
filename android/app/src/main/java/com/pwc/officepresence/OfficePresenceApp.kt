package com.pwc.officepresence

import android.app.Application
import com.google.firebase.crashlytics.FirebaseCrashlytics
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.notify.FcmTokenSync

class OfficePresenceApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // Auto-collection is on by default. Custom keys must not include email, name, or GPS.
        FirebaseCrashlytics.getInstance().apply {
            setCustomKey("version_name", BuildConfig.VERSION_NAME)
            setCustomKey("version_code", BuildConfig.VERSION_CODE)
            setCustomKey("build_type", BuildConfig.BUILD_TYPE)
        }
        AppPrefs(this).applyTheme()
        FcmTokenSync.refreshAndUpload(this)
    }
}
