package com.pwc.officepresence.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.chip.Chip
import com.google.android.material.progressindicator.LinearProgressIndicator
import com.google.android.material.snackbar.Snackbar
import com.pwc.officepresence.BuildConfig
import com.pwc.officepresence.R
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.notify.DailySummaryWorker
import com.pwc.officepresence.presence.GeofenceHelper
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {
    private lateinit var repo: PresenceRepository
    private lateinit var prefs: AppPrefs
    private lateinit var statusChip: Chip
    private lateinit var trackingChip: Chip
    private lateinit var emailText: TextView
    private lateinit var officeNameText: TextView
    private lateinit var officeDetailText: TextView
    private lateinit var pointsText: TextView
    private lateinit var pointsMeter: LinearProgressIndicator
    private lateinit var pointsDetailText: TextView
    private lateinit var hoursText: TextView
    private lateinit var eventList: TextView
    private lateinit var banner: TextView
    private lateinit var versionText: TextView
    private lateinit var toolbar: MaterialToolbar
    private lateinit var swipe: SwipeRefreshLayout
    private lateinit var forceDetectBtn: MaterialButton
    private lateinit var root: View

    override fun onCreate(savedInstanceState: Bundle?) {
        repo = PresenceRepository(this)
        prefs = repo.prefs()
        prefs.applyTheme()
        super.onCreate(savedInstanceState)
        if (prefs.token.isNullOrBlank()) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }
        setContentView(R.layout.activity_main)
        root = findViewById(R.id.root)
        statusChip = findViewById(R.id.statusChip)
        trackingChip = findViewById(R.id.trackingChip)
        emailText = findViewById(R.id.emailText)
        officeNameText = findViewById(R.id.officeNameText)
        officeDetailText = findViewById(R.id.officeDetailText)
        pointsText = findViewById(R.id.pointsText)
        pointsMeter = findViewById(R.id.pointsMeter)
        pointsDetailText = findViewById(R.id.pointsDetailText)
        hoursText = findViewById(R.id.hoursText)
        eventList = findViewById(R.id.eventList)
        banner = findViewById(R.id.banner)
        versionText = findViewById(R.id.versionText)
        forceDetectBtn = findViewById(R.id.forceDetectBtn)
        swipe = findViewById(R.id.swipe)
        swipe.setColorSchemeResources(R.color.pwc_orange)
        swipe.setOnRefreshListener { syncNow() }

        toolbar = findViewById(R.id.toolbar)
        toolbar.setOnMenuItemClickListener {
            when (it.itemId) {
                R.id.action_reports -> startActivity(Intent(this, ReportsActivity::class.java))
                R.id.action_settings -> startActivity(Intent(this, SettingsActivity::class.java))
                R.id.action_peers -> startActivity(Intent(this, PeersActivity::class.java))
                R.id.action_admin -> startActivity(Intent(this, AdminActivity::class.java))
                R.id.action_developer -> startActivity(Intent(this, DeveloperActivity::class.java))
                else -> return@setOnMenuItemClickListener false
            }
            true
        }
        versionText.setOnLongClickListener {
            if (prefs.developerMode) startActivity(Intent(this, DeveloperActivity::class.java))
            true
        }

        findViewById<MaterialButton>(R.id.reportsBtn).setOnClickListener {
            startActivity(Intent(this, ReportsActivity::class.java))
        }
        findViewById<MaterialButton>(R.id.permissionsBtn).setOnClickListener { requestAllPermissions() }
        forceDetectBtn.setOnClickListener { forceDetectNow() }
        trackingChip.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Tracking")
                .setMessage(buildTrackingDetail())
                .setPositiveButton("OK", null)
                .show()
        }
        render(repo.cached())
        syncNow()
    }

    override fun onResume() {
        super.onResume()
        if (::root.isInitialized) {
            GeofenceHelper.registerAll(this, prefs.offices())
            render(repo.cached())
        }
    }

    private fun syncNow() {
        swipe.isRefreshing = true
        thread {
            val state = repo.uploadAndSync()
            if (state.ok) {
                DailySummaryWorker.schedule(this)
                GeofenceHelper.registerAll(this, prefs.offices())
            }
            runOnUiThread {
                swipe.isRefreshing = false
                render(state)
                if (state.unauthorized) {
                    prefs.clearSession()
                    startActivity(Intent(this, LoginActivity::class.java))
                    finish()
                } else if (!state.ok && state.message != null) {
                    Snackbar.make(root, state.message, Snackbar.LENGTH_LONG).show()
                }
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun forceDetectNow() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) {
            Snackbar.make(root, "Grant location first", Snackbar.LENGTH_LONG).show()
            requestAllPermissions()
            return
        }
        forceDetectBtn.isEnabled = false
        forceDetectBtn.text = "Detecting..."
        val cts = CancellationTokenSource()
        LocationServices.getFusedLocationProviderClient(this)
            .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token)
            .addOnSuccessListener { loc ->
                if (loc == null) {
                    forceDetectBtn.isEnabled = true
                    forceDetectBtn.text = getString(R.string.force_detect)
                    Snackbar.make(root, "No location fix", Snackbar.LENGTH_LONG).show()
                    return@addOnSuccessListener
                }
                thread {
                    val state = repo.forceDetect(loc.latitude, loc.longitude, loc.accuracy.toDouble())
                    runOnUiThread {
                        forceDetectBtn.isEnabled = true
                        forceDetectBtn.text = getString(R.string.force_detect)
                        render(state)
                        val msg = when {
                            !state.ok -> state.message ?: "Detect failed"
                            state.inOffice -> "In ${state.officeName ?: "office"}"
                            else -> "Outside office"
                        }
                        Snackbar.make(root, msg, Snackbar.LENGTH_LONG).show()
                    }
                }
            }
            .addOnFailureListener {
                forceDetectBtn.isEnabled = true
                forceDetectBtn.text = getString(R.string.force_detect)
                Snackbar.make(root, "Location failed", Snackbar.LENGTH_LONG).show()
            }
    }

    private fun render(state: PresenceRepository.SyncState) {
        val tz = prefs.timezone
        banner.visibility = if (prefs.fastTest && prefs.developerMode) View.VISIBLE else View.GONE
        emailText.text = prefs.email ?: ""
        toolbar.menu.findItem(R.id.action_developer)?.isVisible = prefs.developerMode
        toolbar.menu.findItem(R.id.action_admin)?.isVisible = prefs.role == "admin"
        versionText.text = "v${BuildConfig.VERSION_NAME}"

        if (state.inOffice) {
            statusChip.text = getString(R.string.status_in)
            statusChip.setChipBackgroundColorResource(R.color.status_in_container)
            statusChip.setTextColor(ContextCompat.getColor(this, R.color.status_in))
        } else {
            statusChip.text = getString(R.string.status_out)
            statusChip.setChipBackgroundColorResource(R.color.status_out_container)
            statusChip.setTextColor(ContextCompat.getColor(this, R.color.status_out))
        }

        val offices = prefs.offices()
        val current = offices.firstOrNull { it.displayName == state.officeName || it.adminName == state.officeName }
        officeNameText.text = when {
            state.inOffice && state.officeName != null -> state.officeName
            state.inOffice -> "In office"
            else -> "Away"
        }
        officeDetailText.text = buildString {
            if (state.inOffice && state.sinceAt != null) append(Ui.fmtTime(state.sinceAt, tz))
            if (state.inOffice && current != null) {
                if (isNotEmpty()) append(" - ")
                val n = current.pointsPerVisitDay
                append(if (n == 1) "Counts as 1 day" else "Counts as $n days")
            }
        }
        officeDetailText.visibility = if (officeDetailText.text.isNullOrBlank()) View.GONE else View.VISIBLE

        val target = state.pointsTarget.coerceAtLeast(1)
        pointsText.text = "${state.monthPoints} / $target days"
        pointsMeter.setProgressCompat(((state.monthPoints * 100) / target).coerceIn(0, 100), true)
        pointsDetailText.text = if (state.targetMet) "Goal met"
        else "${(target - state.monthPoints).coerceAtLeast(0)} to go, ${state.monthVisitDays} visits"
        hoursText.text = "Hours ${"%.1f".format(state.hoursToday)} (FYI)"

        trackingChip.text = compactTracking()
        eventList.text = repo.log().recent(6).joinToString("\n").ifBlank { "" }
    }

    private fun compactTracking(): String {
        val fence = prefs.geofenceStatus
        return when {
            fence.contains("failed", ignoreCase = true) || fence.contains("missing", ignoreCase = true) ->
                "Tracking issue · tap for details"
            fence.contains("Watching", ignoreCase = true) -> fence
            prefs.offices().isEmpty() -> "No offices yet"
            else -> "Geofence · tap for details"
        }
    }

    private fun buildTrackingDetail(): String = buildString {
        appendLine(prefs.geofenceStatus.ifBlank { "Geofences not registered yet." })
        appendLine()
        appendLine("Presence is automatic. Use Force detect if status looks wrong.")
        if (Build.VERSION.SDK_INT >= 33) {
            val ok = ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
            if (!ok) appendLine("Notification permission is off.")
        }
        val fine = ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
        if (!fine) appendLine("Location permission is off.")
    }.trim()

    private fun requestAllPermissions() {
        AlertDialog.Builder(this)
            .setTitle("Permissions")
            .setMessage("Location (all the time), notifications, and battery exemption keep visits accurate.")
            .setPositiveButton("Continue") { _, _ ->
                val need = mutableListOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                )
                if (Build.VERSION.SDK_INT >= 33) need += Manifest.permission.POST_NOTIFICATIONS
                ActivityCompat.requestPermissions(this, need.toTypedArray(), 100)
            }
            .show()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        GeofenceHelper.registerAll(this, prefs.offices())
        if (::trackingChip.isInitialized) trackingChip.text = compactTracking()
        if (requestCode == 100 && Build.VERSION.SDK_INT >= 29) {
            ActivityCompat.requestPermissions(
                this, arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION), 101,
            )
        }
        if (requestCode == 101) {
            val pm = getSystemService(PowerManager::class.java)
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                startActivity(
                    Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:$packageName")
                    },
                )
            }
        }
    }
}
