package com.pwc.officepresence.presence

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.notify.DailySummaryWorker
import com.pwc.officepresence.notify.SyncRefreshWorker

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != Intent.ACTION_MY_PACKAGE_REPLACED &&
            action != "android.intent.action.QUICKBOOT_POWERON"
        ) {
            return
        }
        val prefs = AppPrefs(context)
        if (prefs.token.isNullOrBlank()) return
        GeofenceHelper.registerAll(context, prefs.offices())
        DailySummaryWorker.schedule(context)
        SyncRefreshWorker.schedule(context)
        // If we were In when the process died, resume sampling.
        if (prefs.cachedInOffice || prefs.lastSampleOfficeId.isNotBlank()) {
            PresenceService.start(context)
        }
    }
}
