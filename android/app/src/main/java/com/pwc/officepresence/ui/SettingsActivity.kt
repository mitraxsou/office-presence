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

    private fun tonePicker(parent: LinearLayout, label: String, current: String, onPick: (String) -> Unit) {
        val btn = Ui.button(
            parent,
            "$label: ${Notifier.TONES[current] ?: current}",
            com.google.android.material.R.attr.materialButtonOutlinedStyle,
        ) {}
        btn.setOnClickListener {
            val ids = Notifier.TONES.keys.toList()
            AlertDialog.Builder(this)
                .setTitle(label)
                .setSingleChoiceItems(
                    Notifier.TONES.values.toTypedArray(),
                    ids.indexOf(current).coerceAtLeast(0),
                ) { d, i ->
                    Notifier.previewTone(this, ids[i])
                    onPick(ids[i])
                    btn.text = "$label: ${Notifier.TONES[ids[i]]}"
                    d.dismiss()
                }
                .setNegativeButton("Cancel", null)
                .show()
        }
    }

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

        val notif = Ui.card(content, "Notifications")
        Ui.switch(notif, "Office enter alert", prefs.notifyOfficeEnter) { _, c ->
            prefs.notifyOfficeEnter = c
            prefs.notifyOfficeDetected = c || prefs.notifyOfficeLeave
            patchPrefs(JSONObject().put("notifyOfficeEnter", c))
        }
        tonePicker(notif, "Enter tone", prefs.toneEnterId) { id ->
            prefs.toneEnterId = id
            patchPrefs(JSONObject().put("toneEnterId", id))
        }
        Ui.switch(notif, "Office leave alert", prefs.notifyOfficeLeave) { _, c ->
            prefs.notifyOfficeLeave = c
            prefs.notifyOfficeDetected = c || prefs.notifyOfficeEnter
            patchPrefs(JSONObject().put("notifyOfficeLeave", c))
        }
        tonePicker(notif, "Leave tone", prefs.toneLeaveId) { id ->
            prefs.toneLeaveId = id
            patchPrefs(JSONObject().put("toneLeaveId", id))
        }
        Ui.switch(notif, "Goal met", prefs.notifyGoalMet) { _, c ->
            prefs.notifyGoalMet = c
            patchPrefs(JSONObject().put("notifyGoalMet", c))
        }
        tonePicker(notif, "Goal tone", prefs.toneGoalId) { id ->
            prefs.toneGoalId = id
            patchPrefs(JSONObject().put("toneGoalId", id))
        }
        Ui.switch(notif, "Morning summary", prefs.notifyDailySummary) { _, c ->
            prefs.notifyDailySummary = c
            if (c) DailySummaryWorker.schedule(this) else DailySummaryWorker.cancel(this)
            patchPrefs(JSONObject().put("notifyDailySummary", c))
        }
        tonePicker(notif, "Summary tone", prefs.toneSummaryId) { id ->
            prefs.toneSummaryId = id
            patchPrefs(JSONObject().put("toneSummaryId", id))
        }
        Ui.switch(notif, "Launch sound", prefs.launchSoundEnabled) { _, c ->
            prefs.launchSoundEnabled = c
            patchPrefs(JSONObject().put("launchSoundEnabled", c))
        }
        Ui.textButton(notif, "How notifications work") {
            AlertDialog.Builder(this)
                .setTitle("Notifications")
                .setMessage(
                    "Turn enter and leave on or off separately, each with its own tone " +
                        "(or Silent for a banner only). Morning summary skips once your monthly days goal is met. " +
                        "Sounds never bypass Do Not Disturb.",
                )
                .setPositiveButton("OK", null)
                .show()
        }

        aliasesBox = Ui.card(content, "Office names")
        renderAliases()

        devicesBox = Ui.card(content, "Devices")
        devicesBox.addView(Ui.text(this, "Loading...", 14f, muted = true))

        val peers = Ui.card(content, "Colleagues")
        peerSwitch = Ui.switch(peers, "Share my presence", prefs.sharePresenceWithPeers) { s, c -> onPeerToggle(s, c) }
        Ui.textButton(peers, "Open colleagues") { startActivity(Intent(this, PeersActivity::class.java)) }
        Ui.textButton(peers, "What is shared?") {
            AlertDialog.Builder(this)
                .setTitle("Sharing")
                .setMessage(getString(R.string.peer_consent))
                .setPositiveButton("OK", null)
                .show()
        }

        policyBox = Ui.card(content, getString(R.string.policy_title))
        renderPolicy()

        val dev = Ui.card(content, "Developer")
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

    private fun clearAfterTitle(box: LinearLayout) {
        while (box.childCount > 1) box.removeViewAt(box.childCount - 1)
    }

    private fun renderPolicy() {
        clearAfterTitle(policyBox)
        val text = buildString {
            appendLine("${prefs.monthlyPointsTarget} days / month")
            appendLine("Gap ${prefs.gapMinutes}m - ${prefs.timezone}")
            append("Hours FYI (advised ${"%.0f".format(prefs.dayHours)}h)")
        }
        policyBox.addView(Ui.text(this, text, 14f).apply { setPadding(0, Ui.dp(context, 8), 0, 0) })
        Ui.textButton(policyBox, "How days work") {
            AlertDialog.Builder(this)
                .setTitle("Days")
                .setMessage("Any time in an office that calendar day is a visit. Days come from the highest counts-as office you visited. Hours never fail the month.")
                .setPositiveButton("OK", null)
                .show()
        }
    }

    private fun renderAliases() {
        clearAfterTitle(aliasesBox)
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
        clearAfterTitle(devicesBox)
        Ui.textButton(devicesBox, "How multi-phone works") {
            AlertDialog.Builder(this)
                .setTitle("Devices")
                .setMessage(getString(R.string.multi_phone_help))
                .setPositiveButton("OK", null)
                .show()
        }
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
            if (res?.ok() == true) {
                res.optJSONObject("prefs")?.let { applyPrefsFromServer(it) }
            } else {
                runOnUiThread { toast("Saved on this phone. Server sync failed.") }
            }
        }
    }

    private fun applyPrefsFromServer(p: JSONObject) {
        prefs.notifyOfficeEnter = if (p.has("notifyOfficeEnter")) p.optBoolean("notifyOfficeEnter", true)
        else p.optBoolean("notifyOfficeDetected", true)
        prefs.notifyOfficeLeave = if (p.has("notifyOfficeLeave")) p.optBoolean("notifyOfficeLeave", true)
        else p.optBoolean("notifyOfficeDetected", true)
        prefs.notifyOfficeDetected = p.optBoolean("notifyOfficeDetected", prefs.notifyOfficeEnter || prefs.notifyOfficeLeave)
        prefs.notifyGoalMet = p.optBoolean("notifyGoalMet", prefs.notifyGoalMet)
        prefs.notifyDailySummary = p.optBoolean("notifyDailySummary", prefs.notifyDailySummary)
        if (p.has("toneEnterId")) prefs.toneEnterId = p.optString("toneEnterId", prefs.toneEnterId)
        if (p.has("toneLeaveId")) prefs.toneLeaveId = p.optString("toneLeaveId", prefs.toneLeaveId)
        if (p.has("toneGoalId")) prefs.toneGoalId = p.optString("toneGoalId", prefs.toneGoalId)
        if (p.has("toneSummaryId")) prefs.toneSummaryId = p.optString("toneSummaryId", prefs.toneSummaryId)
        prefs.launchSoundEnabled = p.optBoolean("launchSoundEnabled", prefs.launchSoundEnabled)
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
