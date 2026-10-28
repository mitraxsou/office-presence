package com.pwc.officepresence.ui.analytics

import android.content.Context
import android.os.Bundle
import com.google.firebase.analytics.FirebaseAnalytics

/** Client analytics only. No email, name, or coordinates in params. */
object OpAnalytics {
    fun log(context: Context, name: String, params: Map<String, String> = emptyMap()) {
        try {
            val b = Bundle()
            params.forEach { (k, v) ->
                if (k.isNotBlank() && v.isNotBlank()) b.putString(k.take(40), v.take(100))
            }
            FirebaseAnalytics.getInstance(context).logEvent(name.take(40), b)
        } catch (_: Exception) {
        }
    }

    fun screen(context: Context, screenName: String) {
        log(
            context,
            FirebaseAnalytics.Event.SCREEN_VIEW,
            mapOf(
                FirebaseAnalytics.Param.SCREEN_NAME to screenName.take(36),
                FirebaseAnalytics.Param.SCREEN_CLASS to screenName.take(36),
            ),
        )
    }
}
