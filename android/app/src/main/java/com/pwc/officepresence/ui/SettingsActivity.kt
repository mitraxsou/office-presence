package com.pwc.officepresence.ui

import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.materialswitch.MaterialSwitch
import com.pwc.officepresence.R
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.data.ok
import com.pwc.officepresence.notify.DailySummaryWorker
import com.pwc.officepresence.notify.Notifier
import com.pwc.officepresence.presence.GeofenceHelper
import com.pwc.officepresence.presence.PresenceService
import org.json.JSONObject
import kotlin.concurrent.thread

class SettingsActivity : AppCompatActivity() {
    private lateinit var prefs: AppPrefs
    private lateinit var repo: PresenceRepository
    private lateinit var content: LinearLayout
    private lateinit var devicesBox: LinearLayout
    private lateinit var aliasesBox: LinearLayout
    private lateinit var peerSwitch: MaterialSwitch
    private lateinit var devSwitch: MaterialSwitch
    private lateinit var policyBox: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        repo = PresenceRepository(this)
        prefs = repo.prefs()
        prefs.applyTheme()
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_container)
        findViewById<MaterialToolbar>(R.id.toolbar).apply {
            title = getString(R.string.settings)
            setNavigationOnClickListener { finish() }
        }
        content = findViewById(R.id.content)
        build()
        refreshFromServer()
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    private fun build() {
        val appearance = Ui.card(content, "Appearance")
        val themes = listOf("system" to "Follow system", "light" to "Light", "dark" to "Dark")
        Ui.button(appearance, "Theme: ${themes.first { it.first == prefs.themeMode }.second}", com.google.android.material.R.attr.materialButtonOutlinedStyle) {
            AlertDialog.Builder(this)
                .setTitle("Theme")
                .setSingleChoiceItems(themes.map { it.second }.toTypedArray(), themes.indexOfFirst { it.first == prefs.themeMode }) { d, i ->
                    prefs.themeMode = themes[i].first
                    prefs.applyTheme()
                    d.dismiss()
                    recreate()
                }
                .show()
        }

        val notif = Ui.card(content, "Notifications", "Never louder than your phone: Do Not Disturb and silent mode are respected.")
        Ui.switch(notif, "Office detected", prefs.notifyOfficeDetected) { _, c ->
            prefs.notifyOfficeDetected = c
            patchPrefs(JSONObject().put("notifyOfficeDetected", c))
        }
        Ui.switch(notif, "Monthly points goal met", prefs.notifyGoalMet) { _, c ->
            prefs.notifyGoalMet = c
            patchPrefs(JSONObject().put("notifyGoalMet", c))
        }
        Ui.switch(notif, "Morning summary (9:00, only if goal not met)", prefs.notifyDailySummary) { _, c ->
            prefs.notifyDailySummary = c
            if (c) DailySummaryWorker.schedule(this) else DailySummaryWorker.cancel(this)
            patchPrefs(JSONObject().put("notifyDailySummary", c))
        }
        val toneBtn = Ui.button(notif, "Tone: ${Notifier.TONES[prefs.notificationToneId] ?: "System default"}", com.google.android.material.R.attr.materialButtonOutlinedStyle) {}
        toneBtn.setOnClickListener {
            val ids = Notifier.TONES.keys.toList()
            AlertDialog.Builder(this)
                .setTitle("Notification tone")
                .setSingleChoiceItems(Notifier.TONES.values.toTypedArray(), ids.indexOf(prefs.notificationToneId).coerceAtLeast(0)) { _, i ->
                    Notifier.previewTone(this, ids[i])
                    prefs.notificationToneId = ids[i]
                    toneBtn.text = "Tone: ${Notifier.TONES[ids[i]]}"
                    patchPrefs(JSONObject().put("notificationToneId", ids[i]))
                }
                .setPositiveButton("Done", null)
                .show()
        }
        Ui.switch(notif, "Play a short sound when the app opens", prefs.launchSoundEnabled) { _, c ->
            prefs.launchSoundEnabled = c
            patchPrefs(JSONObject().put("launchSoundEnabled", c))
        }

        aliasesBox = Ui.card(content, "My office names", "Rename an office for yourself only. Admin names stay the same for everyone else.")
        renderAliases()

        devicesBox = Ui.card(content, "My devices", getString(R.string.multi_phone_help))
        devicesBox.addView(Ui.text(this, "Loading...", 14f, muted = true))

        val peers = Ui.card(content, "Share presence with colleagues", getString(R.string.peer_consent))
        peerSwitch = Ui.switch(peers, "Share my presence", prefs.sharePresenceWithPeers) { s, c -> onPeerToggle(s, c) }
        Ui.textButton(peers, "See colleagues in office") { startActivity(Intent(this, PeersActivity::class.java)) }

        policyBox = Ui.card(content, getString(R.string.policy_title), getString(R.string.policy_readonly))
        renderPolicy()

        val dev = Ui.card(content, "Developer", "Adds test tools: 15 second test gap, mock GPS notes, and suggesting a new office.")
        devSwitch = Ui.switch(dev, "Developer mode", prefs.developerMode) { s, c -> onDevToggle(s, c) }
        if (prefs.developerMode) {
            Ui.textButton(dev, getString(R.string.developer)) { startActivity(Intent(this, DeveloperActivity::class.java)) }
        }

        Ui.textButton(content, "Sign out") {
            AlertDialog.Builder(this)
                .setTitle("Sign out")
                .setMessage("Stops tracking on this phone. Your visits stay on the server.")
                .setPositiveButton("Sign out") { _, _ ->
                    PresenceService.stop(this)
                    GeofenceHelper.clear(this)
                    DailySummaryWorker.cancel(this)
                    prefs.clearSession()
                    startActivity(Intent(this, LoginActivity::class.java))
                    finishAffinity()
                }
                .setNegativeButton("Cancel", null)
                .show()
        }
    }

    private fun renderPolicy() {
        policyBox.removeViews(2, (policyBox.childCount - 2).coerceAtLeast(0))
        val text = buildString {
            appendLine("Monthly goal: ${prefs.monthlyPointsTarget} points")
            appendLine("Any time in an office counts as a visit day. Each day earns the highest points of the offices you visited, once.")
            appendLine("Hours are FYI only (advised ${"%.0f".format(prefs.dayHours)}h).")
            appendLine("Visit gap: ${prefs.gapMinutes} minutes")
            appendLine("Timezone: ${prefs.timezone}")
            append("Sample interval: ${prefs.sampleIntervalMinutes} minutes")
        }
        policyBox.addView(Ui.text(this, text, 14f).apply { setPadding(0, Ui.dp(context, 8), 0, 0) })
    }

    private fun renderAliases() {
        aliasesBox.removeViews(2, (aliasesBox.childCount - 2).coerceAtLeast(0))
        val offices = prefs.offices()
        if (offices.isEmpty()) {
            aliasesBox.addView(Ui.text(this, getString(R.string.no_offices), 14f, muted = true))
            return
        }
        offices.forEach { o ->
            val label = if (o.alias != null) "${o.alias} (${o.adminName})" else o.adminName
            Ui.button(aliasesBox, label, com.google.android.material.R.attr.materialButtonOutlinedStyle) {
                val input = EditText(this).apply {
                    setText(o.alias ?: "")
                    hint = o.adminName
                    inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS
                }
                AlertDialog.Builder(this)
                    .setTitle("Name for ${o.adminName}")
                    .setMessage("Leave empty to use the admin name.")
                    .setView(input)
                    .setPositiveButton("Save") { _, _ ->
                        val name = input.text.toString().trim()
                        thread {
                            val res = runCatching { repo.api.setAlias(o.id, name) }.getOrNull()
                            if (res?.ok() == true) repo.syncOnly()
                            runOnUiThread {
                                toast(if (res?.ok() == true) "Saved" else res?.optString("error") ?: "Save failed")
                                renderAliases()
                            }
                        }
                    }
                    .setNegativeButton("Cancel", null)
                    .show()
            }
        }
    }

    private fun renderDevices(list: List<JSONObject>?) {
        devicesBox.removeViews(2, (devicesBox.childCount - 2).coerceAtLeast(0))
        if (list == null) {
            devicesBox.addView(Ui.text(this, "Could not load devices.", 14f, muted = true))
            return
        }
        list.forEach { d ->
            val id = d.optString("id")
            val current = d.optBoolean("current")
            val label = d.optString("label").takeIf { it.isNotBlank() && it != "null" } ?: "Unnamed device"
            val seen = Ui.fmtDateTime(d.optString("lastSeenAt").takeIf { it != "null" }, prefs.timezone)
            Ui.button(
                devicesBox,
                "$label${if (current) " (this phone)" else ""}  -  seen $seen",
                com.google.android.material.R.attr.materialButtonOutlinedStyle,
            ) {
                val actions = arrayOf("Rename", if (current) "Sign out this phone" else "Sign out that device")
                AlertDialog.Builder(this)
                    .setTitle(label)
                    .setItems(actions) { _, which ->
                        if (which == 0) renameDevice(id, label, current) else revokeDevice(id, current)
                    }
                    .show()
            }
        }
    }

    private fun renameDevice(id: String, label: String, current: Boolean) {
        val input = EditText(this).apply {
            setText(label)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS
        }
        AlertDialog.Builder(this)
            .setTitle("Rename device")
            .setView(input)
            .setPositiveButton("Save") { _, _ ->
                val name = input.text.toString().trim()
                if (name.isBlank()) return@setPositiveButton
                if (current) prefs.deviceName = name
                thread {
                    val res = runCatching { repo.api.renameDevice(id, name) }.getOrNull()
                    runOnUiThread {
                        toast(if (res?.ok() == true) "Renamed" else res?.optString("error") ?: "Rename failed")
                        loadDevices()
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun revokeDevice(id: String, current: Boolean) {
        AlertDialog.Builder(this)
            .setTitle("Sign out device")
            .setMessage(if (current) "This phone will stop sending presence." else "That device must sign in again to send presence.")
            .setPositiveButton("Sign out") { _, _ ->
                thread {
                    val res = runCatching { repo.api.revokeDevice(id) }.getOrNull()
                    runOnUiThread {
                        if (res?.ok() == true && current) {
                            PresenceService.stop(this)
                            GeofenceHelper.clear(this)
                            prefs.clearSession()
                            startActivity(Intent(this, LoginActivity::class.java))
                            finishAffinity()
                        } else {
                            toast(if (res?.ok() == true) "Signed out" else res?.optString("error") ?: "Failed")
                            loadDevices()
                        }
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun onPeerToggle(s: MaterialSwitch, enable: Boolean) {
        if (!enable) {
            setPrivacy(s, false)
            return
        }
        AlertDialog.Builder(this)
            .setTitle("Share presence?")
            .setMessage(getString(R.string.peer_consent))
            .setPositiveButton("I agree, share") { _, _ -> setPrivacy(s, true) }
            .setNegativeButton("Cancel") { _, _ -> Ui.setQuiet(s, false) }
            .setOnCancelListener { Ui.setQuiet(s, false) }
            .show()
    }

    private fun setPrivacy(s: MaterialSwitch, share: Boolean) {
        thread {
            val res = runCatching { repo.api.setPrivacy(share) }.getOrNull()
            runOnUiThread {
                if (res?.ok() == true) {
                    prefs.sharePresenceWithPeers = share
                    toast(if (share) "Sharing on" else "Sharing off")
                } else {
                    Ui.setQuiet(s, prefs.sharePresenceWithPeers)
                    toast(res?.optString("error") ?: "Could not update")
                }
            }
        }
    }

    private fun onDevToggle(s: MaterialSwitch, enable: Boolean) {
        val apply = {
            thread {
                val res = runCatching { repo.api.setDeveloper(enable) }.getOrNull()
                runOnUiThread {
                    if (res?.ok() == true) {
                        prefs.developerMode = enable
                        if (!enable && prefs.fastTest) {
                            prefs.fastTest = false
                            if (prefs.cachedInOffice) {
                                PresenceService.stop(this)
                                PresenceService.start(this)
                            }
                        }
                        recreate()
                    } else {
                        Ui.setQuiet(s, prefs.developerMode)
                        toast(res?.optString("error") ?: "Could not update")
                    }
                }
            }
        }
        if (!enable) {
            apply()
            return
        }
        AlertDialog.Builder(this)
            .setTitle("Turn on developer mode?")
            .setMessage("Developer tools change how this phone samples location while testing. Turn it off when you are done.")
            .setPositiveButton("Turn on") { _, _ -> apply() }
            .setNegativeButton("Cancel") { _, _ -> Ui.setQuiet(s, false) }
            .setOnCancelListener { Ui.setQuiet(s, false) }
            .show()
    }

    private fun patchPrefs(patch: JSONObject) {
        thread {
            val res = runCatching { repo.api.patchNotificationPrefs(patch) }.getOrNull()
            if (res?.ok() != true) runOnUiThread { toast("Saved on this phone. Server sync failed.") }
        }
    }

    private fun loadDevices() {
        thread {
            val res = runCatching { repo.api.devices() }.getOrNull()
            val list = if (res?.ok() == true) {
                res.optJSONArray("devices")?.let { arr -> (0 until arr.length()).map { arr.getJSONObject(it) } }
            } else null
            runOnUiThread { if (!isFinishing) renderDevices(list) }
        }
    }

    private fun refreshFromServer() {
        loadDevices()
        thread {
            val state = repo.syncOnly()
            runOnUiThread {
                if (isFinishing) return@runOnUiThread
                renderPolicy()
                renderAliases()
                Ui.setQuiet(peerSwitch, prefs.sharePresenceWithPeers)
                Ui.setQuiet(devSwitch, prefs.developerMode)
                if (!state.ok && state.message != null) toast(state.message)
            }
        }
    }
}
