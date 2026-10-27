package com.pwc.officepresence.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
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
import com.pwc.officepresence.R
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.EventLog
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.data.ok
import com.pwc.officepresence.notify.DailySummaryWorker
import com.pwc.officepresence.presence.GeofenceHelper
import com.pwc.officepresence.presence.PresenceService
import java.time.Instant
import kotlin.concurrent.thread

/** Shown only when the server says User.developerMode is on. */
class DeveloperActivity : AppCompatActivity() {
    private lateinit var prefs: AppPrefs
    private lateinit var repo: PresenceRepository
    private lateinit var log: EventLog
    private lateinit var info: TextView
    private lateinit var status: TextView

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

        val test = Ui.card(content, "Test mode", "15 second visit gap and 15 second samples for soak testing. Server policy is unchanged.")
        Ui.switch(test, "15 second test gap", prefs.fastTest) { _, c ->
            prefs.fastTest = c
            if (prefs.cachedInOffice) {
                PresenceService.stop(this)
                PresenceService.start(this)
            }
            refresh()
        }
        info = Ui.text(this, "", 13f, muted = true).apply { setPadding(0, Ui.dp(context, 8), 0, 0) }
        test.addView(info)

        val mock = Ui.card(content, "Mock location", getString(R.string.mock_location_help))
        Ui.button(mock, "Inject simulated enter", com.google.android.material.R.attr.materialButtonOutlinedStyle) { inject("enter") }
        Ui.button(mock, "Inject simulated sample", com.google.android.material.R.attr.materialButtonOutlinedStyle) { inject("sample") }
        Ui.button(mock, "Inject simulated exit", com.google.android.material.R.attr.materialButtonOutlinedStyle) { inject("exit") }
        Ui.button(mock, "Re-register geofences") {
            GeofenceHelper.registerAll(this, prefs.offices())
            status.text = "Registered ${prefs.offices().size} office geofence(s)"
        }
        Ui.button(mock, "Send morning summary now") {
            DailySummaryWorker.runNow(this)
            status.text = "Morning summary queued"
        }

        val suggest = Ui.card(content, "Suggest an office", "Stand at the office and send its location. It stays pending until an admin approves it.")
        Ui.button(suggest, "Suggest office here") { suggestHere() }

        val reset = Ui.card(content, "Reset")
        Ui.button(reset, "Clear upload queue (${log.pendingCount()} pending)", com.google.android.material.R.attr.materialButtonOutlinedStyle) {
            log.clearQueue()
            status.text = "Queue cleared"
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

        status = Ui.text(this, "", 14f).apply { setPadding(0, Ui.dp(context, 12), 0, 0) }
        content.addView(status)
        refresh()
    }

    private fun inject(type: String) {
        val office = prefs.offices().firstOrNull()
        repo.recordLocal(
            type = type,
            lat = office?.latitude ?: 12.97,
            lng = office?.longitude ?: 77.59,
            accuracy = 15.0,
            simulated = true,
            officeId = office?.id,
        )
        status.text = "Injected simulated $type (does not count toward days)"
    }

    private fun suggestHere() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "Grant location first", Toast.LENGTH_SHORT).show()
            return
        }
        status.text = "Getting a location fix..."
        LocationServices.getFusedLocationProviderClient(this)
            .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, CancellationTokenSource().token)
            .addOnSuccessListener { loc ->
                if (loc == null) {
                    status.text = "No fix yet. Try again outdoors or near a window."
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
                                repo.api.suggestOffice(name, loc.latitude, loc.longitude, prefs.fenceRadius.toDouble())
                            }.getOrNull()
                            runOnUiThread {
                                status.text = if (res?.ok() == true) "Sent. Waiting for admin approval."
                                else res?.optString("error") ?: "Could not send"
                            }
                        }
                    }
                    .setNegativeButton("Cancel", null)
                    .show()
            }
            .addOnFailureListener { status.text = it.message ?: "Location failed" }
    }

    private fun refresh() {
        val r = prefs.rules()
        val gap = if (r.gapSeconds != null) "${r.gapSeconds}s" else "${r.gapMinutes} min"
        info.text = buildString {
            appendLine("Gap $gap")
            appendLine("Sample ${if (prefs.fastTest) 15 else r.sampleIntervalMinutes * 60}s")
            append("Offices cached: ${prefs.offices().size}")
        }
    }
}
