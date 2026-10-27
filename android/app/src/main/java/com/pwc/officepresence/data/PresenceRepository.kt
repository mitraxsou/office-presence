package com.pwc.officepresence.data

import android.content.Context
import com.pwc.officepresence.BuildConfig
import com.pwc.officepresence.notify.Notifier
import com.pwc.officepresence.presence.GeofenceHelper
import com.pwc.officepresence.presence.PresenceService
import com.pwc.officepresence.presence.VisitCalculator
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
        if (prefs.isViewAsReadonly) return false
        return try {
            uploadQueue(api) == null
        } catch (_: Exception) {
            false
        }
    }

    fun uploadAndSync(): SyncState {
        if (prefs.token == null) return cached("Signed out", ok = false, unauthorized = true)
        // Read-only view-as: fetch the viewed user's data, do not upload from this phone.
        if (prefs.isViewAsReadonly) return syncOnly()
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
            u.optString("name", "").takeIf { it.isNotBlank() && it != "null" }?.let { prefs.displayName = it }
            u.optString("email", "").takeIf { it.isNotBlank() && it != "null" }?.let { prefs.email = it }
            u.optString("timezone", "").takeIf { it.isNotBlank() }?.let { prefs.timezone = it }
            u.optString("firstName", "").takeIf { it != "null" }?.let { prefs.firstName = it }
            u.optString("lastName", "").takeIf { it != "null" }?.let { prefs.lastName = it }
            u.optString("preferredName", "").takeIf { it != "null" }?.let { prefs.preferredName = it }
            u.optString("colleagueDisplayMode", "").takeIf { it.isNotBlank() && it != "null" }
                ?.let { prefs.colleagueDisplayMode = it }
            u.optString("displayName", "").takeIf { it.isNotBlank() && it != "null" }?.let { prefs.displayName = it }
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
        prefs.lastSyncAtMs = System.currentTimeMillis()
        if (prefs.cachedInOffice && !prefs.cachedOfficeName.isBlank()) {
            prefs.lastOfficeName = prefs.cachedOfficeName
        }
        return cached()
    }

    fun applyPrefs(p: JSONObject) {
        val combined = p.optBoolean("notifyOfficeDetected", true)
        prefs.notifyOfficeDetected = combined
        prefs.notifyOfficeEnter = if (p.has("notifyOfficeEnter")) p.optBoolean("notifyOfficeEnter", true) else combined
        prefs.notifyOfficeLeave = if (p.has("notifyOfficeLeave")) p.optBoolean("notifyOfficeLeave", true) else combined
        prefs.notifyGoalMet = p.optBoolean("notifyGoalMet", true)
        prefs.notifyDailySummary = p.optBoolean("notifyDailySummary", true)
        if (p.has("notifyCorrections")) prefs.notifyCorrections = p.optBoolean("notifyCorrections", true)
        if (p.has("notifyTrackingProblems")) {
            prefs.notifyTrackingProblems = p.optBoolean("notifyTrackingProblems", true)
        }
        if (p.has("quietHoursStart")) {
            val s = p.optString("quietHoursStart", "").takeIf { it.isNotBlank() && it != "null" }.orEmpty()
            prefs.quietHoursStart = s
        }
        if (p.has("quietHoursEnd")) {
            val e = p.optString("quietHoursEnd", "").takeIf { it.isNotBlank() && it != "null" }.orEmpty()
            prefs.quietHoursEnd = e
        }
        prefs.notificationToneId = p.optString("notificationToneId", "default")
        prefs.toneEnterId = p.optString("toneEnterId", prefs.toneEnterId.ifBlank { "chime" })
        prefs.toneLeaveId = p.optString("toneLeaveId", prefs.toneLeaveId.ifBlank { "soft" })
        prefs.toneGoalId = p.optString("toneGoalId", prefs.toneGoalId.ifBlank { "pulse" })
        prefs.toneSummaryId = p.optString("toneSummaryId", prefs.toneSummaryId.ifBlank { "default" })
        prefs.launchSoundEnabled = p.optBoolean("launchSoundEnabled", false)
    }

    fun applyProfile(profile: JSONObject) {
        profile.optString("firstName", "").takeIf { it != "null" }?.let { prefs.firstName = it }
        profile.optString("lastName", "").takeIf { it != "null" }?.let { prefs.lastName = it }
        profile.optString("preferredName", "").takeIf { it != "null" }?.let { prefs.preferredName = it }
        profile.optString("colleagueDisplayMode", "").takeIf { it.isNotBlank() && it != "null" }
            ?.let { prefs.colleagueDisplayMode = it }
        profile.optString("displayName", "").takeIf { it.isNotBlank() && it != "null" }?.let { prefs.displayName = it }
            ?: profile.optString("name", "").takeIf { it.isNotBlank() && it != "null" }?.let { prefs.displayName = it }
        profile.optString("email", "").takeIf { it.isNotBlank() && it != "null" }?.let { prefs.email = it }
    }

    /**
     * End view-as on the server (admin token) and restore the admin device token locally.
     * Call from UI after End, and on app restart / sign out.
     */
    fun endViewAsSession(): Boolean {
        val adminTok = prefs.viewAsAdminToken ?: return false
        val sessionId = prefs.viewAsSessionId
        return try {
            val res = api.endViewAs(sessionId, adminTok)
            prefs.clearViewAsLocal()
            res.ok()
        } catch (_: Exception) {
            prefs.clearViewAsLocal()
            false
        }
    }

    /**
     * One-shot recovery: match the current fix to an office, record enter/exit,
     * sync, and notify. Not a standing manual check-in control.
     */
    fun forceDetect(lat: Double, lng: Double, accuracy: Double): SyncState {
        if (prefs.isViewAsReadonly) {
            return cached("Not available while viewing as ${prefs.viewAsTargetName.ifBlank { "another user" }}", ok = false)
        }
        val rules = prefs.rules()
        val offices = prefs.offices()
        val matched = VisitCalculator.matchNearestOffice(
            lat, lng, accuracy, offices.map { it.toFence() }, rules,
        )
        val prevId = prefs.lastSampleOfficeId
        if (matched != null) {
            recordLocal(
                type = if (prevId == matched.id) "sample" else "enter",
                lat = lat,
                lng = lng,
                accuracy = accuracy,
                officeId = matched.id,
            )
            val o = offices.firstOrNull { it.id == matched.id }
            if (prevId != matched.id && o != null) {
                Notifier.officeEntered(context, o.displayName, o.pointsPerVisitDay, force = true)
            }
            prefs.lastSampleOfficeId = matched.id ?: ""
            PresenceService.start(context)
        } else {
            recordLocal(type = if (prevId.isNotEmpty()) "exit" else "sample", lat = lat, lng = lng, accuracy = accuracy)
            if (prevId.isNotEmpty()) {
                val o = offices.firstOrNull { it.id == prevId }
                Notifier.officeLeft(context, o?.displayName ?: prefs.cachedOfficeName.ifBlank { "office" }, force = true)
                prefs.lastSampleOfficeId = ""
                PresenceService.stop(context)
            }
        }
        return uploadAndSync()
    }
}
