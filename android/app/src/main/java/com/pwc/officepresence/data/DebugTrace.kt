package com.pwc.officepresence.data

import android.util.Log
import org.json.JSONObject
import java.io.File

/** Temporary runtime tracing for presence and correction debugging. */
object DebugTrace {
    private const val TAG = "OfficePresenceDebug"
    private const val SESSION_ID = "86cc26"
    private const val LOG_PATH = "debug-86cc26.log"
    private val deviceLog = File("/data/user/0/com.pwc.officepresence/files/debug-86cc26.log")

    fun write(hypothesisId: String, location: String, message: String, data: Map<String, Any?> = emptyMap()) {
        try {
            val payload = JSONObject()
                .put("sessionId", SESSION_ID)
                .put("runId", "initial")
                .put("hypothesisId", hypothesisId)
                .put("location", location)
                .put("message", message)
                .put("data", JSONObject(data))
                .put("timestamp", System.currentTimeMillis())
            val line = "${payload}\n"
            try {
                deviceLog.appendText(line)
            } catch (_: Exception) {
            }
            try {
                File(LOG_PATH).appendText(line)
            } catch (_: Exception) {
            }
            Log.d(TAG, payload.toString())
        } catch (_: Exception) {
            // Debug tracing must never affect presence tracking.
        }
    }
}
