package com.pwc.officepresence.ui

import android.Manifest
import android.content.Intent
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
    private lateinit var emailText: TextView
    private lateinit var officeNameText: TextView
    private lateinit var officeDetailText: TextView
    private lateinit var pointsText: TextView
    private lateinit var pointsMeter: LinearProgressIndicator
    private lateinit var pointsDetailText: TextView
    private lateinit var hoursText: TextView
    private lateinit var officesList: TextView
    private lateinit var eventList: TextView
    private lateinit var banner: TextView
    private lateinit var versionText: TextView
    private lateinit var toolbar: MaterialToolbar
    private lateinit var swipe: SwipeRefreshLayout
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
        emailText = findViewById(R.id.emailText)
        officeNameText = findViewById(R.id.officeNameText)
        officeDetailText = findViewById(R.id.officeDetailText)
        pointsText = findViewById(R.id.pointsText)
        pointsMeter = findViewById(R.id.pointsMeter)
        pointsDetailText = findViewById(R.id.pointsDetailText)
        hoursText = findViewById(R.id.hoursText)
        officesList = findViewById(R.id.officesList)
        eventList = findViewById(R.id.eventList)
        banner = findViewById(R.id.banner)
        versionText = findViewById(R.id.versionText)
        swipe = findViewById(R.id.swipe)
        swipe.setColorSchemeResources(R.color.pwc_orange)
        swipe.setOnRefreshListener { syncNow() }

        toolbar = findViewById(R.id.toolbar)
        toolbar.setOnMenuItemClickListener {
            when (it.itemId) {
                R.id.action_settings -> startActivity(Intent(this, SettingsActivity::class.java))
                R.id.action_peers -> startActivity(Intent(this, PeersActivity::class.java))
                R.id.action_developer -> startActivity(Intent(this, DeveloperActivity::class.java))
                else -> return@setOnMenuItemClickListener false
            }
            true
        }
        versionText.setOnLongClickListener {
            if (prefs.developerMode) startActivity(Intent(this, DeveloperActivity::class.java))
            true
        }

        findViewById<MaterialButton>(R.id.permissionsBtn).setOnClickListener { requestAllPermissions() }
        findViewById<MaterialButton>(R.id.checkIn).setOnClickListener { manual("check_in") }
        findViewById<MaterialButton>(R.id.checkOut).setOnClickListener { manual("check_out") }
        findViewById<MaterialButton>(R.id.syncBtn).setOnClickListener { syncNow() }
        render(repo.cached())
        syncNow()
    }

    override fun onResume() {
        super.onResume()
        if (::root.isInitialized) render(repo.cached())
    }

    private fun manual(type: String) {
        thread {
            val state = repo.recordManual(type)
            runOnUiThread {
                render(state)
                val label = if (type == "check_in") "Checked in" else "Checked out"
                val body = if (state.ok) {
                    "$label. Web status: ${if (state.inOffice) "In" else "Out"}"
                } else {
                    state.message ?: "Could not sync"
                }
                Snackbar.make(root, body, Snackbar.LENGTH_LONG).show()
            }
        }
    }

    private fun syncNow() {
        swipe.isRefreshing = true
        thread {
            val state = repo.uploadAndSync()
            if (state.ok) DailySummaryWorker.schedule(this)
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

    private fun render(state: PresenceRepository.SyncState) {
        val tz = prefs.timezone
        banner.visibility = if (prefs.fastTest && prefs.developerMode) View.VISIBLE else View.GONE
        emailText.text = prefs.email ?: ""
        toolbar.menu.findItem(R.id.action_developer)?.isVisible = prefs.developerMode
        versionText.text = if (prefs.developerMode) "v${BuildConfig.VERSION_NAME}  long-press for developer settings"
        else "v${BuildConfig.VERSION_NAME}"

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
            else -> "Not in an office"
        }
        officeDetailText.text = buildString {
            if (state.inOffice && state.sinceAt != null) append("Since ${Ui.fmtTime(state.sinceAt, tz)}")
            if (state.inOffice && current != null) {
                if (isNotEmpty()) append("  -  ")
                append("${current.pointsPerVisitDay} pt${if (current.pointsPerVisitDay == 1) "" else "s"} per visit day")
                current.addressLabel?.let { append("\n").append(it) }
            }
        }
        officeDetailText.visibility = if (officeDetailText.text.isNullOrBlank()) View.GONE else View.VISIBLE

        val target = state.pointsTarget.coerceAtLeast(1)
        pointsText.text = "${state.monthPoints} / $target points"
        pointsMeter.setProgressCompat(((state.monthPoints * 100) / target).coerceIn(0, 100), true)
        pointsDetailText.text = if (state.targetMet) {
            "Goal met. ${state.monthVisitDays} visit day${if (state.monthVisitDays == 1) "" else "s"} this month."
        } else {
            val left = (target - state.monthPoints).coerceAtLeast(0)
            "$left to go. ${state.monthVisitDays} visit day${if (state.monthVisitDays == 1) "" else "s"} this month."
        }
        hoursText.text = "Hours today ${"%.1f".format(state.hoursToday)} (FYI, advised ${"%.0f".format(prefs.dayHours)}h)"

        officesList.text = if (offices.isEmpty()) getString(R.string.no_offices) else offices.joinToString("\n") { o ->
            val alias = if (o.alias != null) " (${o.adminName})" else ""
            val addr = o.addressLabel?.let { "\n   $it" } ?: ""
            "${o.displayName}$alias  -  ${o.pointsPerVisitDay} pt$addr"
        }
        eventList.text = repo.log().recent(15).joinToString("\n").ifBlank { "No events yet" }
    }

    private fun requestAllPermissions() {
        AlertDialog.Builder(this)
            .setTitle("Permissions")
            .setMessage("Office Presence needs location all the time, notifications, and a battery exemption so visits close when you leave.")
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
