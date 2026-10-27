package com.pwc.officepresence.data

import android.content.Context
import com.pwc.officepresence.BuildConfig
import com.pwc.officepresence.notify.Notifier
import com.pwc.officepresence.presence.GeofenceHelper
import com.pwc.officepresence.presence.PresenceService
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime

/** Single path for local event -> upload -> sync so the phone and web share one contract. */
class PresenceRepository(private val context: Context) {
    private val prefs = AppPrefs(context)
    private val log = EventLog(context)
    val api get() = ApiClient(BuildConfig.API_BASE_URL) { prefs.token }

    data class SyncState(
        val inOffice: Boolean,
        val officeName: String?,
        val sinceAt: String?,
        val hoursToday: Double,
        val monthPoints: Int,
        val monthVisitDays: Int,
        val pointsTarget: Int,
        val targetMet: Boolean,
        val message: String? = null,
        val ok: Boolean = true,
        val unauthorized: Boolean = false,
    )

    fun prefs(): AppPrefs = prefs
    fun log(): EventLog = log

    fun cached(message: String? = null, ok: Boolean = true, unauthorized: Boolean = false) = SyncState(
        inOffice = prefs.cachedInOffice,
        officeName = prefs.cachedOfficeName.ifBlank { null },
        sinceAt = prefs.cachedSinceAt.ifBlank { null },
        hoursToday = prefs.cachedHoursToday.toDouble(),
        monthPoints = prefs.cachedMonthPoints,
        monthVisitDays = prefs.cachedMonthVisitDays,
        pointsTarget = prefs.monthlyPointsTarget,
        targetMet = prefs.cachedTargetMet,
        message = message,
        ok = ok,
        unauthorized = unauthorized,
    )

    fun recordManual(type: String): SyncState {
        // Stop sampling before check_out so a late sample cannot flip status back to In.
        if (type == "check_out") PresenceService.stop(context)
        log.add(type = type, recordedAtIso = Instant.now().toString())
        if (type == "check_in") PresenceService.start(context)
        return uploadAndSync()
    }

    fun recordLocal(
        type: String,
        lat: Double? = null,
        lng: Double? = null,
        accuracy: Double? = null,
        simulated: Boolean = false,
        officeId: String? = null,
    ) {
        log.add(
            type = type,
            recordedAtIso = Instant.now().toString(),
            lat = lat,
            lng = lng,
            accuracy = accuracy,
            simulated = simulated,
            officeId = officeId,
        )
    }

    /** Returns null on success, else an error message. */
    private fun uploadQueue(client: ApiClient): String? {
        repeat(5) {
            val batch = log.pendingBatch()
            if (batch.length() == 0) return null
            val ids = (0 until batch.length()).map { batch.getJSONObject(it).getString("clientEventId") }
            val res = client.ingest(batch, prefs.deviceName)
            if (!res.ok()) return res.optString("error", "Upload failed")
            log.markUploaded(ids)
            applyStatus(res)
        }
        return null
    }

    fun uploadPendingOnly(): Boolean {
        if (prefs.token == null) return false
        return try {
            uploadQueue(api) == null
        } catch (_: Exception) {
            false
        }
    }

    fun uploadAndSync(): SyncState {
        if (prefs.token == null) return cached("Signed out", ok = false, unauthorized = true)
        return try {
            val client = api
            val err = uploadQueue(client)
            if (err != null) return cached(err, ok = false, unauthorized = err == "Unauthorized")
            applySync(client.sync())
        } catch (e: Exception) {
            cached(e.message ?: "Sync failed", ok = false)
        }
    }

    fun syncOnly(): SyncState {
        if (prefs.token == null) return cached("Signed out", ok = false, unauthorized = true)
        return try {
            applySync(api.sync())
        } catch (e: Exception) {
            cached(e.message ?: "Sync failed", ok = false)
        }
    }

    private fun applyStatus(res: JSONObject) {
        if (res.has("inOffice")) prefs.cachedInOffice = res.optBoolean("inOffice")
        prefs.cachedOfficeName = res.optString("officeName", "").takeIf { it != "null" }.orEmpty()
        prefs.cachedSinceAt = res.optString("sinceAt", "").takeIf { it != "null" }.orEmpty()
        if (res.has("hoursToday")) prefs.cachedHoursToday = res.optDouble("hoursToday", 0.0).toFloat()
        if (res.has("monthPoints")) prefs.cachedMonthPoints = res.optInt("monthPoints")
        if (res.has("monthVisitDays")) prefs.cachedMonthVisitDays = res.optInt("monthVisitDays")
        if (res.has("pointsTarget")) prefs.monthlyPointsTarget = res.optInt("pointsTarget", prefs.monthlyPointsTarget)
        if (res.has("targetMet")) prefs.cachedTargetMet = res.optBoolean("targetMet")
        maybeNotifyGoal()
    }

    private fun maybeNotifyGoal() {
        if (!prefs.cachedTargetMet) return
        val month = ZonedDateTime.now(zone()).toLocalDate().toString().take(7)
        if (prefs.goalNotifiedMonth == month) return
        prefs.goalNotifiedMonth = month
        Notifier.goalMet(context, prefs.cachedMonthPoints, prefs.monthlyPointsTarget)
    }

    private fun zone(): ZoneId = try { ZoneId.of(prefs.timezone) } catch (_: Exception) { ZoneId.of("Asia/Kolkata") }

    private fun applySync(sync: JSONObject): SyncState {
        if (!sync.ok()) {
            val status = sync.optInt("_httpStatus")
            return cached(sync.optString("error", "Sync failed"), ok = false, unauthorized = status == 401)
        }
        sync.optJSONObject("policy")?.let { p ->
            prefs.gapMinutes = p.optInt("gapMinutes", prefs.gapMinutes)
            prefs.dayHours = p.optDouble("dayHours", prefs.dayHours.toDouble()).toFloat()
            prefs.monthlyPointsTarget = p.optInt("monthlyPointsTarget", prefs.monthlyPointsTarget)
            prefs.timezone = p.optString("timezone", prefs.timezone)
            prefs.sampleIntervalMinutes = p.optInt("sampleIntervalMinutes", prefs.sampleIntervalMinutes)
            prefs.fenceRadius = p.optDouble("fenceRadiusMeters", prefs.fenceRadius.toDouble()).toFloat()
        }
        sync.optJSONObject("user")?.let { u ->
            prefs.developerMode = u.optBoolean("developerMode", false)
            prefs.sharePresenceWithPeers = u.optBoolean("sharePresenceWithPeers", false)
            prefs.role = u.optString("role", "user")
            u.optString("timezone", "").takeIf { it.isNotBlank() }?.let { prefs.timezone = it }
        }
        sync.optJSONObject("device")?.let { d -> d.optString("id", "").takeIf { it.isNotBlank() }?.let { prefs.deviceId = it } }
        sync.optJSONObject("prefs")?.let { applyPrefs(it) }
        sync.optJSONArray("offices")?.let { arr ->
            val json = Office.listToJson(Office.listFromJson(arr)).toString()
            if (json != prefs.officesJson) {
                prefs.officesJson = json
                GeofenceHelper.registerAll(context, prefs.offices())
            }
        }
        applyStatus(sync)
        return cached()
    }

    fun applyPrefs(p: JSONObject) {
        prefs.notifyOfficeDetected = p.optBoolean("notifyOfficeDetected", true)
        prefs.notifyGoalMet = p.optBoolean("notifyGoalMet", true)
        prefs.notifyDailySummary = p.optBoolean("notifyDailySummary", true)
        prefs.notificationToneId = p.optString("notificationToneId", "default")
        prefs.launchSoundEnabled = p.optBoolean("launchSoundEnabled", false)
    }
}
