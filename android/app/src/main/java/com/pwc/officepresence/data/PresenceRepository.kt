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
        val pointsToday: Int,
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

    /**
     * Clear the device session after 401 (deleted or deactivated account).
     * Posts a local shade notification and stores a Login banner message.
     */
    fun forceSignOut(
        message: String = "This account is no longer available. Sign in again.",
        source: String = "sync_401",
    ) {
        val hadToken = !prefs.token.isNullOrBlank()
        prefs.pendingSignInMessage = message
        prefs.clearSession()
        PresenceService.stop(context)
        if (hadToken) {
            com.pwc.officepresence.ui.analytics.OpAnalytics.log(
                context,
                "force_sign_out",
                mapOf("source" to source),
            )
            Notifier.signedOut(context, message)
        }
    }

    fun cached(message: String? = null, ok: Boolean = true, unauthorized: Boolean = false) = SyncState(
        inOffice = prefs.cachedInOffice,
        officeName = prefs.cachedOfficeName.ifBlank { null },
        sinceAt = prefs.cachedSinceAt.ifBlank { null },
        hoursToday = prefs.cachedHoursToday.toDouble(),
        pointsToday = prefs.cachedPointsToday,
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
            if (err != null) {
                val unauth = err == "Unauthorized"
                if (unauth) forceSignOut()
                return cached(err, ok = false, unauthorized = unauth)
            }
            prefs.lastIngestFlushAtMs = System.currentTimeMillis()
            var state = applySync(client.sync(monthVersionsQuery()))
            // Server In but phone clearly Out (or unknown office): push check_out once, no polling.
            if (reconcileServerInMismatch()) {
                val err2 = uploadQueue(client)
                if (err2 == null) {
                    prefs.lastIngestFlushAtMs = System.currentTimeMillis()
                    state = applySync(client.sync(monthVersionsQuery()))
                }
            }
            state
        } catch (e: Exception) {
            cached(e.message ?: "Sync failed", ok = false)
        }
    }

    /**
     * When the server still says In but this phone is outside every fence (and office is unknown
     * or sinceAt is older than the visit gap), queue a check_out so live status matches reality.
     * Hobby-friendly: only runs after an existing sync/upload, never on a timer.
     */
    fun reconcileServerInMismatch(): Boolean {
        if (prefs.isViewAsReadonly) return false
        if (!prefs.cachedInOffice) return false
        val phoneOut = prefs.lastSampleOfficeId.isEmpty()
        if (!phoneOut) return false
        val officeUnknown = prefs.cachedOfficeName.isBlank()
        val sinceStale = isSinceOlderThanGap(prefs.cachedSinceAt, prefs.gapMinutes)
        if (!officeUnknown && !sinceStale) return false
        recordLocal(type = "check_out")
        prefs.cachedInOffice = false
        prefs.cachedOfficeName = ""
        prefs.cachedSinceAt = ""
        PresenceService.stop(context)
        return true
    }

    private fun isSinceOlderThanGap(sinceIso: String, gapMinutes: Int): Boolean {
        if (sinceIso.isBlank()) return true
        return try {
            val sinceMs = Instant.parse(sinceIso).toEpochMilli()
            val gapMs = gapMinutes.coerceAtLeast(1) * 60_000L
            System.currentTimeMillis() - sinceMs > gapMs
        } catch (_: Exception) {
            true
        }
    }

    fun syncOnly(): SyncState {
        if (prefs.token == null) return cached("Signed out", ok = false, unauthorized = true)
        return try {
            applySync(api.sync(monthVersionsQuery()))
        } catch (e: Exception) {
            cached(e.message ?: "Sync failed", ok = false)
        }
    }

    /** True when Sync should run on screen open (cache older than 24 h, or never synced). */
    fun shouldRefreshOnOpen(nowMs: Long = System.currentTimeMillis()): Boolean {
        if (prefs.token == null) return false
        if (prefs.lastSyncAtMs <= 0L) return true
        return nowMs - prefs.lastSyncAtMs > TWENTY_FOUR_H_MS
    }

    /** True when the last sync was on the same local calendar day (tz from prefs). */
    fun syncedToday(nowMs: Long = System.currentTimeMillis()): Boolean {
        val last = prefs.lastSyncAtMs
        if (last <= 0L) return false
        val zone = try {
            java.time.ZoneId.of(prefs.timezone)
        } catch (_: Exception) {
            java.time.ZoneId.of("Asia/Kolkata")
        }
        val lastDay = java.time.Instant.ofEpochMilli(last).atZone(zone).toLocalDate()
        val today = java.time.Instant.ofEpochMilli(nowMs).atZone(zone).toLocalDate()
        return lastDay == today
    }

    /** True when the Sync button may run (not in the 5 min post-success cooldown). */
    fun canManualSync(nowMs: Long = System.currentTimeMillis()): Boolean {
        if (prefs.token == null) return false
        if (prefs.lastSuccessfulSyncAtMs <= 0L) return true
        return nowMs - prefs.lastSuccessfulSyncAtMs >= SYNC_COOLDOWN_MS
    }

    /**
     * Refresh sync when cache is stale (>24 h) or [force] is true.
     * Manual Sync respects the 5 min cooldown unless [bypassCooldown] (WorkManager).
     */
    fun refreshIfNeeded(force: Boolean = false, bypassCooldown: Boolean = false): SyncState {
        if (prefs.token == null) return cached("Signed out", ok = false, unauthorized = true)
        val now = System.currentTimeMillis()
        if (!force && !shouldRefreshOnOpen(now)) return cached()
        if (force && !bypassCooldown && !canManualSync(now)) return cached("Synced recently")
        return if (prefs.isViewAsReadonly) syncOnly() else uploadAndSync()
    }

    /** Colleagues (admins): refresh when older than 15 minutes. */
    fun shouldRefreshPeers(nowMs: Long = System.currentTimeMillis()): Boolean {
        if (prefs.peersFetchedAtMs <= 0L) return true
        return nowMs - prefs.peersFetchedAtMs > PEERS_FRESH_MS
    }

    fun markMonthDirty(monthKey: String) {
        if (!monthKey.matches(Regex("""\d{4}-\d{2}"""))) return
        val set = prefs.dirtyMonthsCsv.split(",").map { it.trim() }.filter { it.isNotBlank() }.toMutableSet()
        set += monthKey
        prefs.dirtyMonthsCsv = set.joinToString(",")
    }

    private fun monthVersionsQuery(): String? {
        val raw = prefs.monthVersionsJson
        if (raw.isBlank() || raw == "{}") return null
        return try {
            val obj = JSONObject(raw)
            val parts = mutableListOf<String>()
            val keys = obj.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                parts += "$k:${obj.optString(k)}"
            }
            if (parts.isEmpty()) null else parts.joinToString(",")
        } catch (_: Exception) {
            null
        }
    }

    private fun applyStatus(res: JSONObject) {
        if (res.has("inOffice")) prefs.cachedInOffice = res.optBoolean("inOffice")
        prefs.cachedOfficeName = res.optString("officeName", "").takeIf { it != "null" }.orEmpty()
        prefs.cachedSinceAt = res.optString("sinceAt", "").takeIf { it != "null" }.orEmpty()
        if (res.has("hoursToday")) prefs.cachedHoursToday = res.optDouble("hoursToday", 0.0).toFloat()
        if (res.has("pointsToday")) prefs.cachedPointsToday = res.optInt("pointsToday")
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
        val http = sync.optInt("_httpStatus")
        if (http == 304) {
            val now = System.currentTimeMillis()
            prefs.lastSyncAtMs = now
            prefs.lastSuccessfulSyncAtMs = now
            return cached()
        }
        if (!sync.ok()) {
            val unauth = http == 401
            if (unauth) forceSignOut()
            return cached(sync.optString("error", "Sync failed"), ok = false, unauthorized = unauth)
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
        sync.optJSONArray("todayOffices")?.let { prefs.cachedTodayOfficesJson = it.toString() }
            ?: run { prefs.cachedTodayOfficesJson = "[]" }
        val now = System.currentTimeMillis()
        prefs.lastSyncAtMs = now
        prefs.lastSuccessfulSyncAtMs = now
        sync.optJSONObject("monthVersions")?.let { prefs.monthVersionsJson = it.toString() }
        sync.optJSONArray("dirtyMonths")?.let { arr ->
            val set = prefs.dirtyMonthsCsv.split(",").map { it.trim() }.filter { it.isNotBlank() }.toMutableSet()
            for (i in 0 until arr.length()) {
                val m = arr.optString(i)
                if (m.matches(Regex("""\d{4}-\d{2}"""))) set += m
            }
            prefs.dirtyMonthsCsv = set.joinToString(",")
        }
        sync.optJSONArray("correctionDecisions")?.let { arr ->
            for (i in 0 until arr.length()) {
                val day = arr.optJSONObject(i)?.optString("dayKey").orEmpty()
                if (day.length >= 7) markMonthDirty(day.take(7))
            }
        }
        if (prefs.cachedInOffice && !prefs.cachedOfficeName.isBlank()) {
            prefs.lastOfficeName = prefs.cachedOfficeName
        }
        return cached()
    }

    companion object {
        private const val TWENTY_FOUR_H_MS = 24L * 60L * 60L * 1000L
        private const val SYNC_COOLDOWN_MS = 5L * 60L * 1000L
        private const val PEERS_FRESH_MS = 15L * 60L * 1000L
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
