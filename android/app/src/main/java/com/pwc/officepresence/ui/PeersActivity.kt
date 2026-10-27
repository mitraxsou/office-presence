package com.pwc.officepresence.ui

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.LinearLayout
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.appbar.MaterialToolbar
import com.pwc.officepresence.R
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.data.ok
import org.json.JSONObject
import kotlin.concurrent.thread

/** Colleagues who opted in to sharing. Polls every 60s while visible. */
class PeersActivity : AppCompatActivity() {
    private lateinit var prefs: AppPrefs
    private lateinit var repo: PresenceRepository
    private lateinit var content: LinearLayout
    private val handler = Handler(Looper.getMainLooper())
    private val poll = object : Runnable {
        override fun run() {
            load()
            handler.postDelayed(this, 60_000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        repo = PresenceRepository(this)
        prefs = repo.prefs()
        prefs.applyTheme()
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_container)
        findViewById<MaterialToolbar>(R.id.toolbar).apply {
            title = getString(R.string.peers)
            setNavigationOnClickListener { finish() }
        }
        content = findViewById(R.id.content)
    }

    override fun onResume() {
        super.onResume()
        handler.post(poll)
    }

    override fun onPause() {
        handler.removeCallbacks(poll)
        super.onPause()
    }

    private fun load() {
        thread {
            val res = runCatching { repo.api.peers() }.getOrNull()
            runOnUiThread { if (!isFinishing) render(res) }
        }
    }

    private fun render(res: JSONObject?) {
        content.removeAllViews()
        if (res == null || !res.ok()) {
            Ui.card(content, "Could not load", res?.optString("error") ?: "Check your connection and try again.")
            return
        }
        if (!res.optBoolean("optedIn")) {
            val c = Ui.card(content, "Sharing is off", "You see colleagues only after you choose to share your own presence. ${getString(R.string.peer_consent)}")
            Ui.button(c, "Open settings") { startActivity(Intent(this, SettingsActivity::class.java)) }
            return
        }
        val arr = res.optJSONArray("peers")
        val peers = if (arr == null) emptyList() else (0 until arr.length()).map { arr.getJSONObject(it) }
        val inNow = peers.filter { it.optBoolean("inOffice") }
        val box = Ui.card(content, "In office now (${inNow.size})", "Updates every minute. Only colleagues who opted in are shown.")
        if (inNow.isEmpty()) box.addView(Ui.text(this, "Nobody right now.", 14f, muted = true))
        inNow.forEach { p ->
            val office = p.optString("officeName").takeIf { it.isNotBlank() && it != "null" } ?: "Office"
            val since = Ui.fmtTime(p.optString("sinceAt").takeIf { it != "null" }, prefs.timezone)
            val demo = if (p.optBoolean("isDummy")) " (demo)" else ""
            box.addView(Ui.text(this, p.optString("name") + demo, 15f, bold = true).apply { setPadding(0, Ui.dp(context, 10), 0, 0) })
            box.addView(Ui.text(this, "$office${if (since.isNotBlank()) "  -  since $since" else ""}", 13f, muted = true))
        }
        val out = peers.filter { !it.optBoolean("inOffice") }
        if (out.isNotEmpty()) {
            val o = Ui.card(content, "Not in office (${out.size})")
            o.addView(Ui.text(this, out.joinToString("\n") { it.optString("name") }, 14f, muted = true).apply { setPadding(0, Ui.dp(context, 8), 0, 0) })
        }
    }
}
