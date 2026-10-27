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

    var email: String?
        get() = prefs.getString("email", null)
        set(v) = putStr("email", v)

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
        get() = int("sampleIntervalMinutes", 5)
        set(v) = putInt("sampleIntervalMinutes", v)

    var fenceRadius: Float
        get() = float("fenceRadius", 100f)
        set(v) = putFloat("fenceRadius", v)

    // Notification prefs, mirrored from /api/me/notification-prefs.
    var notifyOfficeDetected: Boolean
        get() = bool("notifyOfficeDetected", true)
        set(v) = putBool("notifyOfficeDetected", v)

    var notifyGoalMet: Boolean
        get() = bool("notifyGoalMet", true)
        set(v) = putBool("notifyGoalMet", v)

    var notifyDailySummary: Boolean
        get() = bool("notifyDailySummary", true)
        set(v) = putBool("notifyDailySummary", v)

    var notificationToneId: String
        get() = str("notificationToneId", "default")
        set(v) = putStr("notificationToneId", v)

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

    fun clearSession() {
        prefs.edit()
            .remove("token")
            .remove("deviceId")
            .remove("fastTest")
            .remove("developerMode")
            .remove("officesJson")
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
