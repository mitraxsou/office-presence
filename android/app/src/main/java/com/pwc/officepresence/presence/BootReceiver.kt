package com.pwc.officepresence.presence

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.notify.DailySummaryWorker

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
        val prefs = AppPrefs(context)
        if (prefs.token.isNullOrBlank()) return
        GeofenceHelper.registerAll(context, prefs.offices())
        DailySummaryWorker.schedule(context)
    }
}
