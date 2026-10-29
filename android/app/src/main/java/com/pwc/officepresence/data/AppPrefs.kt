package com.pwc.officepresence.data

import android.content.Context
import android.os.Build
import androidx.appcompat.app.AppCompatDelegate
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.pwc.officepresence.presence.PresenceRules
import org.json.JSONArray
import java.util.UUID

class AppPrefs(context: Context) {
    private val master = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
    private val prefs = EncryptedSharedPreferences.create(
        context,
        "office_presence_secure",
        master,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    private fun str(key: String, def: String) = prefs.getString(key, def) ?: def
    private fun putStr(key: String, v: String?) = prefs.edit().putString(key, v).apply()
    private fun bool(key: String, def: Boolean) = prefs.getBoolean(key, def)
    private fun putBool(key: String, v: Boolean) = prefs.edit().putBoolean(key, v).apply()
    private fun int(key: String, def: Int) = prefs.getInt(key, def)
    private fun putInt(key: String, v: Int) = prefs.edit().putInt(key, v).apply()
    private fun float(key: String, def: Float) = prefs.getFloat(key, def)
    private fun putFloat(key: String, v: Float) = prefs.edit().putFloat(key, v).apply()

    var token: String?
        get() = prefs.getString("token", null)
        set(v) = putStr("token", v)

    /**
     * Shown once on Login after forced sign-out (deleted/deactivated account).
     * Not cleared by [clearSession].
     */
    var pendingSignInMessage: String
        get() = str("pendingSignInMessage", "")
        set(v) = putStr("pendingSignInMessage", v)

    var email: String?
        get() = prefs.getString("email", null)
        set(v) = putStr("email", v)

    var displayName: String
        get() = str("displayName", "")
        set(v) = putStr("displayName", v)

    var firstName: String
        get() = str("firstName", "")
        set(v) = putStr("firstName", v)

    var lastName: String
        get() = str("lastName", "")
        set(v) = putStr("lastName", v)

    var preferredName: String
        get() = str("preferredName", "")
        set(v) = putStr("preferredName", v)

    /** first_last | preferred_last | preferred_only */
    var colleagueDisplayMode: String
        get() = str("colleagueDisplayMode", "first_last")
        set(v) = putStr("colleagueDisplayMode", v)

    var lastSyncAtMs: Long
        get() = prefs.getLong("lastSyncAtMs", 0L)
        set(v) = prefs.edit().putLong("lastSyncAtMs", v).apply()

    /** Successful sync timestamp used for the 5 min cooldown. */
    var lastSuccessfulSyncAtMs: Long
        get() = prefs.getLong("lastSuccessfulSyncAtMs", 0L)
        set(v) = prefs.edit().putLong("lastSuccessfulSyncAtMs", v).apply()

    /** JSON map of monthKey -> version string from sync. */
    var monthVersionsJson: String
        get() = str("monthVersionsJson", "{}")
        set(v) = putStr("monthVersionsJson", v)

    /** Comma-separated dirty month keys that need a reports refetch. */
    var dirtyMonthsCsv: String
        get() = str("dirtyMonthsCsv", "")
        set(v) = putStr("dirtyMonthsCsv", v)

    fun isMonthDirty(monthKey: String): Boolean {
        if (monthKey.isBlank()) return false
        return dirtyMonthsCsv.split(",").map { it.trim() }.any { it == monthKey }
    }

    fun clearMonthDirty(monthKey: String) {
        if (monthKey.isBlank()) return
        val next = dirtyMonthsCsv.split(",").map { it.trim() }.filter { it.isNotBlank() && it != monthKey }
        dirtyMonthsCsv = next.joinToString(",")
    }

    var yearFetchedAtMs: Long
        get() = prefs.getLong("yearFetchedAtMs", 0L)
        set(v) = prefs.edit().putLong("yearFetchedAtMs", v).apply()

    var peersFetchedAtMs: Long
        get() = prefs.getLong("peersFetchedAtMs", 0L)
        set(v) = prefs.edit().putLong("peersFetchedAtMs", v).apply()

    fun cachedYearJson(year: Int): org.json.JSONObject? {
        val raw = prefs.getString("yearCache_$year", null) ?: return null
        return try {
            org.json.JSONObject(raw)
        } catch (_: Exception) {
            null
        }
    }

    fun storeYearJson(year: Int, json: String) {
        prefs.edit().putString("yearCache_$year", json).apply()
    }

    fun cachedReportJson(monthKey: String): org.json.JSONObject? {
        if (monthKey.isBlank()) return null
        val raw = prefs.getString("reportCache_$monthKey", null) ?: return null
        return try {
            org.json.JSONObject(raw)
        } catch (_: Exception) {
            null
        }
    }

    fun storeReportJson(monthKey: String, json: String) {
        if (monthKey.isBlank()) return
        prefs.edit().putString("reportCache_$monthKey", json).apply()
    }

    fun reportFetchedAtMs(monthKey: String): Long {
        if (monthKey.isBlank()) return 0L
        return prefs.getLong("reportFetchedAt_$monthKey", 0L)
    }

    fun storeReportFetchedAt(monthKey: String, atMs: Long) {
        if (monthKey.isBlank()) return
        prefs.edit().putLong("reportFetchedAt_$monthKey", atMs).apply()
    }

    var lastOfficeName: String
        get() = str("lastOfficeName", "")
        set(v) = putStr("lastOfficeName", v)

    var deviceId: String?
        get() = prefs.getString("deviceId", null)
        set(v) = putStr("deviceId", v)

    /** Device label sent to the server. Defaults to the phone model; user can rename. */
    var deviceName: String
        get() = str("deviceName", "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}".trim())
        set(v) = putStr("deviceName", v)

    val installId: String
        get() {
            val existing = prefs.getString("installId", null)
            if (existing != null) return existing
            val id = UUID.randomUUID().toString()
            putStr("installId", id)
            return id
        }

    /** Developer only: 15s gap, fast samples. */
    var fastTest: Boolean
        get() = bool("fastTest", false)
        set(v) = putBool("fastTest", v)

    /** Server flag User.developerMode. */
    var developerMode: Boolean
        get() = bool("developerMode", false)
        set(v) = putBool("developerMode", v)

    var sharePresenceWithPeers: Boolean
        get() = bool("sharePeers", false)
        set(v) = putBool("sharePeers", v)

    var role: String
        get() = str("role", "user")
        set(v) = putStr("role", v)

    /** light | dark | system */
    var themeMode: String
        get() = str("themeMode", "system")
        set(v) = putStr("themeMode", v)

    var officesJson: String
        get() = str("officesJson", "[]")
        set(v) = putStr("officesJson", v)

    fun offices(): List<Office> = try {
        Office.listFromJson(JSONArray(officesJson))
    } catch (_: Exception) {
        emptyList()
    }

    var gapMinutes: Int
        get() = int("gapMinutes", 15)
        set(v) = putInt("gapMinutes", v)

    var dayHours: Float
        get() = float("dayHours", 5f)
        set(v) = putFloat("dayHours", v)

    var monthlyPointsTarget: Int
        get() = int("monthlyPointsTarget", 8)
        set(v) = putInt("monthlyPointsTarget", v)

    var timezone: String
        get() = str("timezone", "Asia/Kolkata")
        set(v) = putStr("timezone", v)

    var sampleIntervalMinutes: Int
        get() = int("sampleIntervalMinutes", 10)
        set(v) = putInt("sampleIntervalMinutes", v)

    /** Last successful sample-ingest flush (debounce uploads while In). */
    var lastIngestFlushAtMs: Long
        get() = prefs.getLong("lastIngestFlushAtMs", 0L)
        set(v) = prefs.edit().putLong("lastIngestFlushAtMs", v).apply()

    /** JSON array of today's office groups from sync (avoids a separate reports call). */
    var cachedTodayOfficesJson: String
        get() = str("cachedTodayOfficesJson", "[]")
        set(v) = putStr("cachedTodayOfficesJson", v)

    var fenceRadius: Float
        get() = float("fenceRadius", 100f)
        set(v) = putFloat("fenceRadius", v)

    // Notification prefs, mirrored from /api/me/notification-prefs.
    var notifyOfficeDetected: Boolean
        get() = bool("notifyOfficeDetected", true)
        set(v) = putBool("notifyOfficeDetected", v)

    var notifyOfficeEnter: Boolean
        get() = bool("notifyOfficeEnter", true)
        set(v) = putBool("notifyOfficeEnter", v)

    var notifyOfficeLeave: Boolean
        get() = bool("notifyOfficeLeave", true)
        set(v) = putBool("notifyOfficeLeave", v)

    var notifyGoalMet: Boolean
        get() = bool("notifyGoalMet", true)
        set(v) = putBool("notifyGoalMet", v)

    var notifyDailySummary: Boolean
        get() = bool("notifyDailySummary", true)
        set(v) = putBool("notifyDailySummary", v)

    var notifyCorrections: Boolean
        get() = bool("notifyCorrections", true)
        set(v) = putBool("notifyCorrections", v)

    var notifyTrackingProblems: Boolean
        get() = bool("notifyTrackingProblems", true)
        set(v) = putBool("notifyTrackingProblems", v)

    /** HH:MM or empty when quiet hours are off. */
    var quietHoursStart: String
        get() = str("quietHoursStart", "")
        set(v) = putStr("quietHoursStart", v)

    var quietHoursEnd: String
        get() = str("quietHoursEnd", "")
        set(v) = putStr("quietHoursEnd", v)

    /** Last start/end shown while quiet hours are off. Not sent to the server. */
    var quietHoursStartKept: String
        get() = str("quietHoursStartKept", "21:00")
        set(v) = putStr("quietHoursStartKept", v)

    var quietHoursEndKept: String
        get() = str("quietHoursEndKept", "08:00")
        set(v) = putStr("quietHoursEndKept", v)

    val quietHoursEnabled: Boolean
        get() = quietHoursStart.isNotBlank() && quietHoursEnd.isNotBlank()

    /** all, weekdays, or custom. */
    var quietHoursDays: String
        get() = str("quietHoursDays", "all")
        set(v) = putStr("quietHoursDays", v)

    /** Comma-separated weekday numbers, Monday = 1 through Sunday = 7. */
    var quietHoursCustomDays: String
        get() = str("quietHoursCustomDays", "1,2,3,4,5")
        set(v) = putStr("quietHoursCustomDays", v)

    var quietAlertTracking: Boolean
        get() = bool("quietAlertTracking", true)
        set(v) = putBool("quietAlertTracking", v)

    var quietAlertCorrections: Boolean
        get() = bool("quietAlertCorrections", false)
        set(v) = putBool("quietAlertCorrections", v)

    var notificationToneId: String
        get() = str("notificationToneId", "default")
        set(v) = putStr("notificationToneId", v)

    /** Per-channel system ringtone URI (empty = channel default / built-in tone). */
    fun channelSoundUri(channelId: String): String = str("channelSoundUri_$channelId", "")

    fun setChannelSoundUri(channelId: String, uri: String) = putStr("channelSoundUri_$channelId", uri)

    fun channelSoundTitle(channelId: String): String = str("channelSoundTitle_$channelId", "")

    fun setChannelSoundTitle(channelId: String, title: String) = putStr("channelSoundTitle_$channelId", title)

    var toneEnterId: String
        get() = str("toneEnterId", "chime")
        set(v) = putStr("toneEnterId", v)

    var toneLeaveId: String
        get() = str("toneLeaveId", "soft")
        set(v) = putStr("toneLeaveId", v)

    var toneGoalId: String
        get() = str("toneGoalId", "pulse")
        set(v) = putStr("toneGoalId", v)

    var toneSummaryId: String
        get() = str("toneSummaryId", "default")
        set(v) = putStr("toneSummaryId", v)

    var launchSoundEnabled: Boolean
        get() = bool("launchSoundEnabled", false)
        set(v) = putBool("launchSoundEnabled", v)

    // Cached status for offline display.
    var cachedInOffice: Boolean
        get() = bool("cachedInOffice", false)
        set(v) = putBool("cachedInOffice", v)

    var cachedOfficeName: String
        get() = str("cachedOfficeName", "")
        set(v) = putStr("cachedOfficeName", v)

    var cachedSinceAt: String
        get() = str("cachedSinceAt", "")
        set(v) = putStr("cachedSinceAt", v)

    var cachedHoursToday: Float
        get() = float("cachedHoursToday", 0f)
        set(v) = putFloat("cachedHoursToday", v)

    var cachedPointsToday: Int
        get() = int("cachedPointsToday", 0)
        set(v) = putInt("cachedPointsToday", v)

    var cachedMonthPoints: Int
        get() = int("cachedMonthPoints", 0)
        set(v) = putInt("cachedMonthPoints", v)

    var cachedMonthVisitDays: Int
        get() = int("cachedMonthVisitDays", 0)
        set(v) = putInt("cachedMonthVisitDays", v)

    var cachedTargetMet: Boolean
        get() = bool("cachedTargetMet", false)
        set(v) = putBool("cachedTargetMet", v)

    /** YYYY-MM for which the goal-met notification was shown. */
    var goalNotifiedMonth: String
        get() = str("goalNotifiedMonth", "")
        set(v) = putStr("goalNotifiedMonth", v)

    /** Last enter heads-up time (epoch ms). Debounce is per direction. */
    var lastPresenceEnterAlertAtMs: Long
        get() = prefs.getLong("lastPresenceEnterAlertAtMs", 0L)
        set(v) = prefs.edit().putLong("lastPresenceEnterAlertAtMs", v).apply()

    /** Last leave heads-up time (epoch ms). Debounce is per direction. */
    var lastPresenceLeaveAlertAtMs: Long
        get() = prefs.getLong("lastPresenceLeaveAlertAtMs", 0L)
        set(v) = prefs.edit().putLong("lastPresenceLeaveAlertAtMs", v).apply()

    /** Last office id from a sample (empty when outside). */
    var lastSampleOfficeId: String
        get() = str("lastSampleOfficeId", "")
        set(v) = putStr("lastSampleOfficeId", v)

    /** Human-readable geofence registration status for the home screen. */
    var geofenceStatus: String
        get() = str("geofenceStatus", "")
        set(v) = putStr("geofenceStatus", v)

    // View as another user (admin). Admin device token is stored so End can restore it.
    var viewAsSessionId: String?
        get() = prefs.getString("viewAsSessionId", null)
        set(v) = putStr("viewAsSessionId", v)

    /** readonly | full */
    var viewAsMode: String
        get() = str("viewAsMode", "")
        set(v) = putStr("viewAsMode", v)

    var viewAsTargetName: String
        get() = str("viewAsTargetName", "")
        set(v) = putStr("viewAsTargetName", v)

    var viewAsTargetEmail: String
        get() = str("viewAsTargetEmail", "")
        set(v) = putStr("viewAsTargetEmail", v)

    var viewAsExpiresAtMs: Long
        get() = prefs.getLong("viewAsExpiresAtMs", 0L)
        set(v) = prefs.edit().putLong("viewAsExpiresAtMs", v).apply()

    /** Admin device token kept while view-as JWT is in [token]. */
    var viewAsAdminToken: String?
        get() = prefs.getString("viewAsAdminToken", null)
        set(v) = putStr("viewAsAdminToken", v)

    val isViewAsActive: Boolean
        get() = !viewAsSessionId.isNullOrBlank() &&
            !viewAsAdminToken.isNullOrBlank() &&
            viewAsExpiresAtMs > System.currentTimeMillis()

    val isViewAsReadonly: Boolean
        get() = isViewAsActive && viewAsMode == "readonly"

    val isViewAsFull: Boolean
        get() = isViewAsActive && viewAsMode == "full"

    fun minutesLeftInViewAs(nowMs: Long = System.currentTimeMillis()): Int {
        if (!isViewAsActive) return 0
        return ((viewAsExpiresAtMs - nowMs) / 60_000L).toInt().coerceAtLeast(0)
    }

    fun beginViewAs(
        sessionId: String,
        mode: String,
        targetName: String,
        targetEmail: String,
        expiresAtMs: Long,
        viewAsToken: String,
    ) {
        val adminTok = token ?: return
        prefs.edit()
            .putString("viewAsAdminToken", adminTok)
            .putString("viewAsSessionId", sessionId)
            .putString("viewAsMode", mode)
            .putString("viewAsTargetName", targetName)
            .putString("viewAsTargetEmail", targetEmail)
            .putLong("viewAsExpiresAtMs", expiresAtMs)
            .putLong("viewAsStartedAtMs", System.currentTimeMillis())
            .putString("token", viewAsToken)
            .apply()
    }

    var viewAsStartedAtMs: Long
        get() = prefs.getLong("viewAsStartedAtMs", 0L)
        set(v) = prefs.edit().putLong("viewAsStartedAtMs", v).apply()

    /** Minutes already spent in the current view-as session. */
    fun minutesSpentInViewAs(nowMs: Long = System.currentTimeMillis()): Int {
        val started = viewAsStartedAtMs
        if (started <= 0L) return 0
        return ((nowMs - started) / 60_000L).toInt().coerceAtLeast(0)
    }

    /** Restore admin token locally after End (or restart / sign out). */
    fun clearViewAsLocal() {
        val adminTok = viewAsAdminToken
        prefs.edit()
            .remove("viewAsSessionId")
            .remove("viewAsMode")
            .remove("viewAsTargetName")
            .remove("viewAsTargetEmail")
            .remove("viewAsExpiresAtMs")
            .remove("viewAsStartedAtMs")
            .remove("viewAsAdminToken")
            .apply()
        if (!adminTok.isNullOrBlank()) {
            token = adminTok
        }
    }

    /** Last FCM token successfully uploaded to the server. */
    var lastUploadedFcmToken: String
        get() = str("lastUploadedFcmToken", "")
        set(v) = putStr("lastUploadedFcmToken", v)

    fun clearSession() {
        prefs.edit()
            .remove("token")
            .remove("deviceId")
            .remove("fastTest")
            .remove("developerMode")
            .remove("officesJson")
            .remove("viewAsSessionId")
            .remove("viewAsMode")
            .remove("viewAsTargetName")
            .remove("viewAsTargetEmail")
            .remove("viewAsExpiresAtMs")
            .remove("viewAsStartedAtMs")
            .remove("viewAsAdminToken")
            .remove("lastUploadedFcmToken")
            .apply()
    }

    fun resetLocal() {
        prefs.edit().clear().apply()
    }

    fun applyTheme() {
        val mode = when (themeMode) {
            "dark" -> AppCompatDelegate.MODE_NIGHT_YES
            "light" -> AppCompatDelegate.MODE_NIGHT_NO
            else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        }
        AppCompatDelegate.setDefaultNightMode(mode)
    }

    fun rules(): PresenceRules {
        val testing = fastTest && developerMode
        return PresenceRules(
            gapMinutes = if (testing) 0 else gapMinutes,
            gapSeconds = if (testing) TEST_GAP_SECONDS else null,
            dayHours = dayHours.toDouble(),
            monthlyPointsTarget = monthlyPointsTarget,
            timezone = timezone,
            fenceRadiusMeters = fenceRadius.toDouble(),
            sampleIntervalMinutes = if (testing) 0 else sampleIntervalMinutes,
        )
    }

    companion object {
        const val TEST_GAP_SECONDS = 15
        const val TEST_SAMPLE_MS = 15_000L
    }
}
