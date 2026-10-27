package com.pwc.officepresence.ui

import android.os.Bundle
import android.text.InputType
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.snackbar.Snackbar
import com.pwc.officepresence.R
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.data.ok
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * Admin-only: create/delete users, seed demo peers, simulate In/Out for dummy accounts.
 * Does not steal another user's device token.
 */
class AdminActivity : AppCompatActivity() {
    private lateinit var prefs: AppPrefs
    private lateinit var repo: PresenceRepository
    private lateinit var content: LinearLayout
    private lateinit var root: android.view.View
    private var users: List<JSONObject> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        repo = PresenceRepository(this)
        prefs = repo.prefs()
        prefs.applyTheme()
        super.onCreate(savedInstanceState)
        if (prefs.role != "admin") {
            finish()
            return
        }
        setContentView(R.layout.activity_container)
        root = findViewById(R.id.root)
        findViewById<MaterialToolbar>(R.id.toolbar).apply {
            title = getString(R.string.admin)
            setNavigationOnClickListener { finish() }
        }
        content = findViewById(R.id.content)
        load()
    }

    private fun load() {
        content.removeAllViews()
        content.addView(Ui.text(this, "Loading...", 14f, muted = true))
        thread {
            val res = runCatching { repo.api.adminUsers() }.getOrNull()
            runOnUiThread {
                if (isFinishing) return@runOnUiThread
                if (res == null || !res.ok()) {
                    content.removeAllViews()
                    Ui.card(content, "Admin", res?.optString("error") ?: "Could not load users")
                    return@runOnUiThread
                }
                val arr = res.optJSONArray("users")
                users = if (arr == null) emptyList() else (0 until arr.length()).map { arr.getJSONObject(it) }
                render()
            }
        }
    }

    private fun render() {
        content.removeAllViews()
        val tools = Ui.card(content, "Demo peers", "Seed dummy users for the colleague board. Safe to delete later.")
        Ui.button(tools, "Seed demo users") {
            thread {
                val res = runCatching { repo.api.adminSeedDummies() }.getOrNull()
                runOnUiThread {
                    Snackbar.make(
                        root,
                        if (res != null && res.ok()) "Demo users ready" else res?.optString("error") ?: "Failed",
                        Snackbar.LENGTH_LONG,
                    ).show()
                    load()
                }
            }
        }
        Ui.button(tools, "Create user", com.google.android.material.R.attr.materialButtonOutlinedStyle) { createUserDialog() }

        val list = Ui.card(content, "Users (${users.size})", "Simulate In/Out only on dummy accounts.")
        if (users.isEmpty()) {
            list.addView(Ui.text(this, "No users", 14f, muted = true))
            return
        }
        for (u in users) {
            val email = u.optString("email")
            val name = u.optString("name").takeIf { it.isNotBlank() && it != "null" }
            val dummy = u.optBoolean("isDummy")
            val status = u.optJSONObject("status")
            val inOffice = status?.optBoolean("inOffice") == true
            val office = status?.optString("officeName")?.takeIf { it.isNotBlank() && it != "null" }
            val line = buildString {
                append(name ?: email.substringBefore("@"))
                if (dummy) append(" (demo)")
                append(" - ")
                append(if (inOffice) "In${office?.let { " $it" } ?: ""}" else "Out")
            }
            list.addView(Ui.text(this, line, 14f, bold = true).apply { setPadding(0, Ui.dp(context, 10), 0, 0) })
            list.addView(Ui.text(this, email, 12f, muted = true))

            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                )
            }
            if (dummy) {
                row.addView(smallBtn("Set In") { simulate(u.getString("id"), true) })
                row.addView(smallBtn("Set Out") { simulate(u.getString("id"), false) })
            }
            if (email != prefs.email) {
                row.addView(smallBtn("Delete") {
                    AlertDialog.Builder(this)
                        .setTitle("Delete user?")
                        .setMessage(email)
                        .setPositiveButton("Delete") { _, _ ->
                            thread {
                                val res = runCatching { repo.api.adminDeleteUser(u.getString("id")) }.getOrNull()
                                runOnUiThread {
                                    Snackbar.make(
                                        root,
                                        if (res != null && res.ok()) "Deleted" else "Delete failed",
                                        Snackbar.LENGTH_SHORT,
                                    ).show()
                                    load()
                                }
                            }
                        }
                        .setNegativeButton("Cancel", null)
                        .show()
                })
            }
            if (row.childCount > 0) list.addView(row)
        }
    }

    private fun smallBtn(label: String, onClick: () -> Unit): MaterialButton {
        return MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
            text = label
            textSize = 12f
            minimumHeight = 0
            minHeight = Ui.dp(this@AdminActivity, 40)
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginEnd = Ui.dp(this@AdminActivity, 4)
            }
            setOnClickListener { onClick() }
        }
    }

    private fun simulate(userId: String, inOffice: Boolean) {
        thread {
            val officeId = prefs.offices().firstOrNull()?.id
            val res = runCatching { repo.api.adminSimulate(userId, inOffice, officeId) }.getOrNull()
            runOnUiThread {
                Snackbar.make(
                    root,
                    if (res != null && res.ok()) (if (inOffice) "Set In" else "Set Out")
                    else res?.optString("error") ?: "Failed",
                    Snackbar.LENGTH_SHORT,
                ).show()
                load()
            }
        }
    }

    private fun createUserDialog() {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = Ui.dp(context, 16)
            setPadding(p, p, p, 0)
        }
        val email = EditText(this).apply {
            hint = "email@pwc.com or dummy@example.pwc.local"
            inputType = InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        }
        val name = EditText(this).apply { hint = "Display name (optional)" }
        box.addView(email)
        box.addView(name)
        AlertDialog.Builder(this)
            .setTitle("Create user")
            .setView(box)
            .setPositiveButton("Create") { _, _ ->
                val e = email.text.toString().trim()
                if (e.isEmpty()) return@setPositiveButton
                val dummy = e.endsWith("@example.pwc.local") || e.startsWith("dummy.")
                thread {
                    val res = runCatching {
                        repo.api.adminCreateUser(e, name.text.toString().trim().ifBlank { null }, "user", dummy)
                    }.getOrNull()
                    runOnUiThread {
                        Snackbar.make(
                            root,
                            if (res != null && res.ok()) "Created" else res?.optString("error") ?: "Failed",
                            Snackbar.LENGTH_LONG,
                        ).show()
                        load()
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}
