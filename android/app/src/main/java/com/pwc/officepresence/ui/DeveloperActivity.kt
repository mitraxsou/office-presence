package com.pwc.officepresence.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.firebase.messaging.FirebaseMessaging
import com.pwc.officepresence.BuildConfig
import com.pwc.officepresence.R
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.EventLog
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.data.ok
import com.pwc.officepresence.notify.DailySummaryWorker
import com.pwc.officepresence.notify.FcmTokenSync
import com.pwc.officepresence.presence.GeofenceHelper
import com.pwc.officepresence.presence.PresenceService
import com.pwc.officepresence.ui.compose.OpFormat
import kotlin.concurrent.thread

/** Shown only when the server says User.developerMode is on. */
class DeveloperActivity : AppCompatActivity() {
    private lateinit var prefs: AppPrefs
    private lateinit var repo: PresenceRepository
    private lateinit var log: EventLog
    private lateinit var statusView: TextView
    private lateinit var debugView: TextView
    private lateinit var fcmView: TextView
    private lateinit var recentView: TextView
    private lateinit var clearQueueBtn: MaterialButton
    private var fcmTokenPreview: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        repo = PresenceRepository(this)
        prefs = repo.prefs()
        prefs.applyTheme()
        super.onCreate(savedInstanceState)
        if (!prefs.developerMode) {
            finish()
            return
        }
        log = repo.log()
        setContentView(R.layout.activity_container)
        findViewById<MaterialToolbar>(R.id.toolbar).apply {
            title = getString(R.string.developer)
            setNavigationOnClickListener { finish() }
        }
        val content = findViewById<LinearLayout>(R.id.content)

        val debug = Ui.card(
            content,
            "This phone",
            "Live cache and tracking. Open Firebase Console for product Analytics.",
        )
        debugView = Ui.text(this, "", 13f, muted = true).apply {
            setPadding(0, Ui.dp(this@DeveloperActivity, 8), 0, 0)
        }
        debug.addView(debugView)
        Ui.button(debug, "Refresh details", com.google.android.material.R.attr.materialButtonOutlinedStyle) {
            refreshAll()
            setStatus("Details refreshed")
        }
        Ui.button(debug, "Check now (use current GPS)", com.google.android.material.R.attr.materialButtonOutlinedStyle) {
            checkNow()
        }

        val test = Ui.card(
            content,
            "Test mode",
            "15 second visit gap and 15 second samples for soak testing. Server policy is unchanged.",
        )
        Ui.switch(test, "15 second test gap", prefs.fastTest) { _, c ->
            prefs.fastTest = c
            if (prefs.cachedInOffice) {
                PresenceService.stop(this)
                PresenceService.start(this)
            }
            refreshAll()
            setStatus(if (c) "Test gap on (15 s)" else "Test gap off (server gap)")
        }

        val mock = Ui.card(content, "Mock GPS", getString(R.string.mock_location_help))
        Ui.button(mock, "Re-register geofences", com.google.android.material.R.attr.materialButtonOutlinedStyle) {
            GeofenceHelper.registerAll(this, prefs.offices())
            setStatus("Registered ${prefs.offices().size} office geofence(s)")
            refreshAll()
        }
        Ui.button(mock, "Send morning summary now", com.google.android.material.R.attr.materialButtonOutlinedStyle) {
            DailySummaryWorker.runNow(this)
            setStatus("Morning summary queued")
        }

        val fcm = Ui.card(
            content,
            "FCM and Analytics",
            "FCM wakes this phone for force logout and presence_check. Analytics events go to Firebase Console (Analytics, DebugView). No email, name, or GPS in event params.",
        )
        fcmView = Ui.text(this, "", 13f, muted = true).apply {
            setPadding(0, Ui.dp(this@DeveloperActivity, 8), 0, 0)
        }
        fcm.addView(fcmView)
        Ui.button(fcm, "Refresh FCM token", com.google.android.material.R.attr.materialButtonOutlinedStyle) {
            setStatus("Refreshing FCM token...")
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token ->
                    if (token.isNullOrBlank()) {
                        setStatus("No FCM token yet")
                        refreshFcmCard()
                        return@addOnSuccessListener
                    }
                    fcmTokenPreview = token
                    // Force re-upload even if unchanged.
                    prefs.lastUploadedFcmToken = ""
                    FcmTokenSync.uploadIfSignedIn(this, token)
                    setStatus("FCM token requested. Uploading if signed in.")
                    window.decorView.postDelayed({ refreshFcmCard() }, 1200)
                }
                .addOnFailureListener {
                    setStatus(it.message ?: "FCM token failed")
                    refreshFcmCard()
                }
        }
        Ui.text(
            this,
            "Events this app logs: screen_view, sync_completed, force_sign_out, presence_check, fcm_token_refresh, sign-in.",
            12f,
            muted = true,
        ).also {
            it.setPadding(0, Ui.dp(this, 8), 0, 0)
            fcm.addView(it)
        }

        val activity = Ui.card(content, "Recent local events", "Newest first from this phone queue.")
        recentView = Ui.text(this, "", 12f, muted = true).apply {
            setPadding(0, Ui.dp(this@DeveloperActivity, 8), 0, 0)
            setTextIsSelectable(true)
        }
        activity.addView(recentView)

        val suggest = Ui.card(
            content,
            "Suggest an office",
            "Stand at the office and send its location. It stays pending until an admin approves it.",
        )
        Ui.button(suggest, "Suggest office here") { suggestHere() }

        val reset = Ui.card(content, "Reset")
        clearQueueBtn = Ui.button(
            reset,
            "Clear upload queue",
            com.google.android.material.R.attr.materialButtonOutlinedStyle,
        ) {
            log.clearQueue()
            setStatus("Queue cleared")
            refreshAll()
        }
        Ui.button(reset, "Reset this phone", com.google.android.material.R.attr.materialButtonOutlinedStyle) {
            AlertDialog.Builder(this)
                .setTitle("Reset this phone")
                .setMessage("Clears the local queue, geofences, and settings, then signs out.")
                .setPositiveButton("Reset") { _, _ ->
                    log.clearAll()
                    GeofenceHelper.clear(this)
                    PresenceService.stop(this)
                    DailySummaryWorker.cancel(this)
                    prefs.resetLocal()
                    startActivity(Intent(this, LoginActivity::class.java))
                    finishAffinity()
                }
                .setNegativeButton("Cancel", null)
                .show()
        }

        statusView = Ui.text(this, "", 14f).apply {
            setPadding(0, Ui.dp(this@DeveloperActivity, 12), 0, 0)
        }
        content.addView(statusView)
        refreshAll()
    }

    override fun onResume() {
        super.onResume()
        if (::prefs.isInitialized && prefs.developerMode) refreshAll()
    }

    private fun setStatus(msg: String) {
        if (::statusView.isInitialized) statusView.text = msg
    }

    private fun checkNow() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            Toast.makeText(this, "Grant location first", Toast.LENGTH_SHORT).show()
            return
        }
        setStatus("Getting a location fix...")
        LocationServices.getFusedLocationProviderClient(this)
            .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, CancellationTokenSource().token)
            .addOnSuccessListener { loc ->
                if (loc == null) {
                    setStatus("No fix yet. Try again outdoors, near a window, or with mock GPS on.")
                    return@addOnSuccessListener
                }
                val mockTag = if (isMockLocation(loc)) " (mock GPS)" else ""
                setStatus("Checking ${"%.5f".format(loc.latitude)}, ${"%.5f".format(loc.longitude)} ${loc.accuracy.toInt()} m$mockTag...")
                thread {
                    val state = runCatching {
                        repo.forceDetect(loc.latitude, loc.longitude, loc.accuracy.toDouble())
                    }.getOrNull()
                    runOnUiThread {
                        val line = when {
                            state == null -> "Check failed"
                            !state.ok -> state.message?.takeIf { it.isNotBlank() } ?: "Check failed"
                            state.inOffice -> "In at ${state.officeName ?: "office"}$mockTag"
                            else -> "Out$mockTag"
                        }
                        setStatus(line)
                        refreshAll()
                    }
                }
            }
            .addOnFailureListener { setStatus(it.message ?: "Location failed") }
    }

    private fun suggestHere() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            Toast.makeText(this, "Grant location first", Toast.LENGTH_SHORT).show()
            return
        }
        setStatus("Getting a location fix...")
        LocationServices.getFusedLocationProviderClient(this)
            .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, CancellationTokenSource().token)
            .addOnSuccessListener { loc ->
                if (loc == null) {
                    setStatus("No fix yet. Try again outdoors or near a window.")
                    return@addOnSuccessListener
                }
                val input = EditText(this).apply {
                    hint = "Office name"
                    inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS
                }
                AlertDialog.Builder(this)
                    .setTitle("Suggest office")
                    .setMessage("${"%.5f".format(loc.latitude)}, ${"%.5f".format(loc.longitude)}  accuracy ${loc.accuracy.toInt()} m")
                    .setView(input)
                    .setPositiveButton("Send") { _, _ ->
                        val name = input.text.toString().trim().ifBlank { "New office" }
                        thread {
                            val res = runCatching {
                                repo.api.suggestOffice(
                                    name,
                                    loc.latitude,
                                    loc.longitude,
                                    prefs.fenceRadius.toDouble(),
                                )
                            }.getOrNull()
                            runOnUiThread {
                                setStatus(
                                    if (res?.ok() == true) "Sent. Waiting for admin approval."
                                    else res?.optString("error") ?: "Could not send",
                                )
                            }
                        }
                    }
                    .setNegativeButton("Cancel", null)
                    .show()
            }
            .addOnFailureListener { setStatus(it.message ?: "Location failed") }
    }

    private fun refreshAll() {
        refreshDebugCard()
        refreshFcmCard()
        refreshRecent()
        if (::clearQueueBtn.isInitialized) {
            clearQueueBtn.text = "Clear upload queue (${log.pendingCount()} pending)"
        }
    }

    private fun refreshDebugCard() {
        if (!::debugView.isInitialized) return
        val r = prefs.rules()
        val gap = if (r.gapSeconds != null) "${r.gapSeconds} s" else "${r.gapMinutes} min"
        val sampleSec = if (prefs.fastTest) 15 else r.sampleIntervalMinutes * 60
        val status = if (prefs.cachedInOffice) {
            val office = prefs.cachedOfficeName.ifBlank { "Office" }
            "In - $office"
        } else {
            "Out"
        }
        val since = if (prefs.cachedSinceAt.isNotBlank()) {
            "Since ${Ui.fmtDateTime(prefs.cachedSinceAt, prefs.timezone)}"
        } else {
            "Since -"
        }
        debugView.text = buildString {
            appendLine("App ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
            appendLine("Status $status")
            appendLine(since)
            appendLine(OpFormat.syncedAgo(prefs.lastSyncAtMs))
            appendLine(
                "Ingest flush ${
                    if (prefs.lastIngestFlushAtMs > 0) OpFormat.syncedAgo(prefs.lastIngestFlushAtMs)
                        .replace("Synced ", "flushed ")
                        .replace("Last sync ", "flushed ")
                    else "never"
                }",
            )
            appendLine("Gap $gap, sample every ${sampleSec}s")
            appendLine("Fence radius ${prefs.fenceRadius.toInt()} m")
            appendLine("Offices cached ${prefs.offices().size}")
            appendLine("Queue ${log.pendingCount()} pending")
            appendLine("Device ${prefs.deviceName}")
            append("Timezone ${prefs.timezone}")
        }
    }

    private fun refreshFcmCard() {
        if (!::fcmView.isInitialized) return
        val uploaded = prefs.lastUploadedFcmToken
        val preview = when {
            fcmTokenPreview.isNotBlank() -> maskToken(fcmTokenPreview)
            uploaded.isNotBlank() -> maskToken(uploaded)
            else -> "none"
        }
        val registered = if (uploaded.length > 20) "Yes (uploaded to server)" else "No (not uploaded yet)"
        fcmView.text = buildString {
            appendLine("FCM registered: $registered")
            appendLine("Token preview: $preview")
            appendLine("Analytics: Firebase Console > Analytics (DebugView for live)")
            append("Project events are delayed in reports; use DebugView while testing.")
        }
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token ->
                if (!token.isNullOrBlank()) {
                    fcmTokenPreview = token
                    if (::fcmView.isInitialized) {
                        val up = prefs.lastUploadedFcmToken
                        val reg = if (up.length > 20) "Yes (uploaded to server)" else "No (not uploaded yet)"
                        fcmView.text = buildString {
                            appendLine("FCM registered: $reg")
                            appendLine("Token preview: ${maskToken(token)}")
                            appendLine(
                                if (up == token) "Upload: matches last uploaded token"
                                else if (up.isBlank()) "Upload: waiting"
                                else "Upload: local token differs from last upload",
                            )
                            appendLine("Analytics: Firebase Console > Analytics (DebugView for live)")
                            append("Project events are delayed in reports; use DebugView while testing.")
                        }
                    }
                }
            }
    }

    private fun refreshRecent() {
        if (!::recentView.isInitialized) return
        val lines = log.recent(12)
        recentView.text = if (lines.isEmpty()) "No local events yet."
        else lines.joinToString("\n")
    }

    private fun maskToken(token: String): String {
        if (token.length <= 12) return token
        return "${token.take(6)}...${token.takeLast(6)} (${token.length} chars)"
    }

    private fun isMockLocation(loc: Location): Boolean =
        if (Build.VERSION.SDK_INT >= 31) loc.isMock
        else @Suppress("DEPRECATION") loc.isFromMockProvider
}
