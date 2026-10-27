package com.pwc.officepresence.ui

import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.snackbar.Snackbar
import com.pwc.officepresence.R
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.Office
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.data.ok
import org.json.JSONObject
import java.time.LocalDateTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.concurrent.thread

/** Month calendar, day drill-down, and correction requests. Uses the phone device token. */
class ReportsActivity : AppCompatActivity() {
    private lateinit var prefs: AppPrefs
    private lateinit var repo: PresenceRepository
    private lateinit var content: LinearLayout
    private lateinit var root: android.view.View
    private var monthKey: String? = null
    private var currentMonth: String? = null
    private var report: JSONObject? = null
    private var selectedDay: String? = null
    private var offices: List<Office> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        repo = PresenceRepository(this)
        prefs = repo.prefs()
        prefs.applyTheme()
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_container)
        root = findViewById(R.id.root)
        findViewById<MaterialToolbar>(R.id.toolbar).apply {
            title = getString(R.string.reports)
            setNavigationOnClickListener { finish() }
        }
        content = findViewById(R.id.content)
        load(null)
    }

    private fun load(month: String?) {
        content.removeAllViews()
        content.addView(Ui.text(this, "Loading...", 14f, muted = true))
        thread {
            val res = runCatching { repo.api.reports(month) }.getOrNull()
            val officeRes = runCatching { repo.api.offices() }.getOrNull()
            val list = if (officeRes != null && officeRes.ok()) {
                val arr = officeRes.optJSONArray("offices")
                if (arr == null) emptyList() else Office.listFromJson(arr)
            } else prefs.offices()
            runOnUiThread {
                if (isFinishing) return@runOnUiThread
                offices = list
                if (res == null || !res.ok()) {
                    content.removeAllViews()
                    Ui.card(content, "Could not load", res?.optString("error") ?: "Check your connection and try again.")
                    return@runOnUiThread
                }
                report = res
                monthKey = res.optString("month")
                currentMonth = res.optString("currentMonth")
                if (selectedDay != null && !selectedDay!!.startsWith(monthKey!!)) selectedDay = null
                render()
            }
        }
    }

    private fun render() {
        val data = report ?: return
        content.removeAllViews()
        val tz = data.optString("timezone", prefs.timezone)
        val points = data.optInt("monthPoints")
        val target = data.optInt("pointsTarget").coerceAtLeast(1)
        val visitDays = data.optInt("monthVisitDays")
        val summary = Ui.card(content, "$points / $target points", "$visitDays visit day${if (visitDays == 1) "" else "s"} this month")
        if (data.optBoolean("targetMet")) {
            summary.addView(Ui.text(this, "Goal met", 14f, bold = true).apply {
                setTextColor(getColor(R.color.pwc_orange))
                setPadding(0, Ui.dp(context, 6), 0, 0)
            })
        }
        val today = data.optJSONObject("today")
        if (today != null && monthKey == currentMonth) {
            val status = if (today.optBoolean("inOffice")) {
                "In${today.optString("officeName").takeIf { it.isNotBlank() && it != "null" }?.let { " at $it" } ?: ""}"
            } else "Out"
            summary.addView(
                Ui.text(
                    this,
                    "Today: $status. Hours ${"%.1f".format(today.optDouble("hoursToday"))} (FYI).",
                    13f,
                    muted = true,
                ).apply { setPadding(0, Ui.dp(context, 6), 0, 0) },
            )
        }

        val nav = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                .apply { topMargin = Ui.dp(context, 12) }
        }
        val prev = MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
            text = "Prev"
            setOnClickListener { monthKey?.let { load(shiftMonth(it, -1)) } }
        }
        val next = MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
            text = "Next"
            isEnabled = monthKey != null && monthKey != currentMonth
            setOnClickListener { monthKey?.let { load(shiftMonth(it, 1)) } }
        }
        val label = TextView(this).apply {
            text = monthKey ?: ""
            textSize = 18f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        nav.addView(prev)
        nav.addView(label)
        nav.addView(next)
        content.addView(nav)

        val dayMap = HashMap<String, JSONObject>()
        val days = data.optJSONArray("days")
        if (days != null) {
            for (i in 0 until days.length()) {
                val d = days.getJSONObject(i)
                dayMap[d.getString("dayKey")] = d
            }
        }
        val cal = data.optJSONArray("calendar")
        if (cal != null) {
            for (i in 0 until cal.length()) {
                val d = cal.getJSONObject(i)
                val key = d.getString("dayKey")
                if (!dayMap.containsKey(key)) dayMap[key] = d
            }
        }

        val ym = YearMonth.parse(monthKey)
        val lead = (ym.atDay(1).dayOfWeek.value + 6) % 7
        val grid = GridLayout(this).apply {
            columnCount = 7
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                .apply { topMargin = Ui.dp(context, 8) }
        }
        listOf("M", "T", "W", "T", "F", "S", "S").forEach { dow ->
            grid.addView(TextView(this).apply {
                text = dow
                gravity = Gravity.CENTER
                textSize = 12f
                setTextColor(Ui.attrColor(context, com.google.android.material.R.attr.colorOnSurfaceVariant))
                layoutParams = GridLayout.LayoutParams().apply {
                    width = 0
                    height = Ui.dp(context, 28)
                    columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f)
                }
            })
        }
        repeat(lead) {
            grid.addView(TextView(this).apply {
                layoutParams = GridLayout.LayoutParams().apply {
                    width = 0
                    height = Ui.dp(context, 48)
                    columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f)
                }
            })
        }
        for (day in 1..ym.lengthOfMonth()) {
            val key = "%s-%02d".format(monthKey, day)
            val row = dayMap[key]
            val btn = MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
                text = if (row != null && row.optInt("points") > 0) "$day\n+${row.optInt("points")}" else "$day"
                textSize = 12f
                minHeight = 0
                minimumHeight = 0
                insetTop = 0
                insetBottom = 0
                setPadding(0, Ui.dp(context, 4), 0, Ui.dp(context, 4))
                if (key == selectedDay) {
                    setBackgroundColor(getColor(R.color.pwc_orange_container))
                }
                setOnClickListener {
                    selectedDay = key
                    render()
                }
                layoutParams = GridLayout.LayoutParams().apply {
                    width = 0
                    height = Ui.dp(context, 52)
                    columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f)
                    setMargins(Ui.dp(context, 2), Ui.dp(context, 2), Ui.dp(context, 2), Ui.dp(context, 2))
                }
            }
            grid.addView(btn)
        }
        content.addView(grid)

        val sel = selectedDay
        if (sel == null) {
            content.addView(
                Ui.text(this, "Select a day for intervals, first in, last out, and which office counted.", 13f, muted = true)
                    .apply { setPadding(0, Ui.dp(context, 12), 0, 0) },
            )
            return
        }
        val day = dayMap[sel]
        val detail = Ui.card(
            content,
            sel,
            if (day != null && day.optInt("points") > 0) "+${day.optInt("points")} point${if (day.optInt("points") == 1) "" else "s"}"
            else "No visit",
        )
        if (day != null && day.has("firstIn")) {
            detail.addView(Ui.text(this, "First in  ${Ui.fmtTime(day.optString("firstIn").takeIf { it != "null" }, tz)}", 14f).apply {
                setPadding(0, Ui.dp(context, 8), 0, 0)
            })
            detail.addView(Ui.text(this, "Last out  ${Ui.fmtTime(day.optString("lastOut").takeIf { it != "null" }, tz)}", 14f))
            detail.addView(Ui.text(this, "Hours (FYI)  ${"%.1f".format(day.optDouble("hours"))}", 14f, muted = true))
            detail.addView(
                Ui.text(
                    this,
                    "Points from  ${day.optString("officeName").takeIf { it.isNotBlank() && it != "null" } ?: "Office"}",
                    14f,
                    muted = true,
                ),
            )
            val intervals = day.optJSONArray("intervals")
            if (intervals != null && intervals.length() > 0) {
                detail.addView(Ui.text(this, "Intervals", 14f, bold = true).apply { setPadding(0, Ui.dp(context, 10), 0, 0) })
                for (i in 0 until intervals.length()) {
                    val iv = intervals.getJSONObject(i)
                    val line =
                        "${Ui.fmtTime(iv.optString("startAt"), tz)} - ${Ui.fmtTime(iv.optString("endAt"), tz)}" +
                            "  ${"%.1f".format(iv.optDouble("hours"))}h" +
                            "  ${iv.optString("officeName").takeIf { it.isNotBlank() && it != "null" } ?: "-"}"
                    detail.addView(Ui.text(this, line, 12f, muted = true))
                }
            }
        } else if (day != null) {
            // calendar-only row without intervals: fetch full month again already has days page; show points only
            detail.addView(
                Ui.text(
                    this,
                    "Points from  ${day.optString("officeName").takeIf { it.isNotBlank() && it != "null" } ?: "Office"}",
                    14f,
                    muted = true,
                ).apply { setPadding(0, Ui.dp(context, 8), 0, 0) },
            )
        }
        Ui.button(detail, "Request correction") { showCorrectionDialog(sel, tz) }
    }

    private fun showCorrectionDialog(dayKey: String, tz: String) {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = Ui.dp(context, 16)
            setPadding(p, p, p, 0)
        }
        val inEt = EditText(this).apply {
            hint = "Check-in (HH:mm)"
            setText("09:30")
            inputType = InputType.TYPE_CLASS_DATETIME
        }
        val outEt = EditText(this).apply {
            hint = "Check-out (HH:mm)"
            setText("17:30")
            inputType = InputType.TYPE_CLASS_DATETIME
        }
        val reasonEt = EditText(this).apply {
            hint = "Reason"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
        }
        val names = offices.map { "${it.displayName} (${it.pointsPerVisitDay} pt)" }.ifEmpty { listOf("No offices") }
        val spinner = Spinner(this).apply {
            adapter = ArrayAdapter(this@ReportsActivity, android.R.layout.simple_spinner_dropdown_item, names)
        }
        box.addView(inEt)
        box.addView(outEt)
        box.addView(spinner)
        box.addView(reasonEt)
        AlertDialog.Builder(this)
            .setTitle("Correct $dayKey")
            .setMessage("Admin must approve before points change.")
            .setView(box)
            .setPositiveButton("Send") { _, _ ->
                val reason = reasonEt.text.toString().trim()
                if (reason.isEmpty()) {
                    Snackbar.make(root, "Reason is required", Snackbar.LENGTH_LONG).show()
                    return@setPositiveButton
                }
                val officeId = offices.getOrNull(spinner.selectedItemPosition)?.id
                val startIso = localToIso(dayKey, inEt.text.toString().trim(), tz) ?: run {
                    Snackbar.make(root, "Use HH:mm for check-in", Snackbar.LENGTH_LONG).show()
                    return@setPositiveButton
                }
                var endIso = localToIso(dayKey, outEt.text.toString().trim(), tz) ?: run {
                    Snackbar.make(root, "Use HH:mm for check-out", Snackbar.LENGTH_LONG).show()
                    return@setPositiveButton
                }
                if (java.time.Instant.parse(endIso).isBefore(java.time.Instant.parse(startIso)) ||
                    java.time.Instant.parse(endIso) == java.time.Instant.parse(startIso)
                ) {
                    endIso = java.time.Instant.parse(endIso).plusSeconds(24 * 3600).toString()
                }
                thread {
                    val res = runCatching {
                        repo.api.submitCorrection(dayKey, startIso, endIso, reason, officeId)
                    }.getOrNull()
                    runOnUiThread {
                        if (res != null && res.ok()) {
                            Snackbar.make(root, "Correction sent to admin", Snackbar.LENGTH_LONG).show()
                            load(monthKey)
                        } else {
                            Snackbar.make(root, res?.optString("error") ?: "Could not send", Snackbar.LENGTH_LONG).show()
                        }
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun localToIso(dayKey: String, hm: String, tz: String): String? {
        val normalized = if (hm.length == 4 && hm[1] == ':') "0$hm" else hm
        if (!Regex("^\\d{2}:\\d{2}$").matches(normalized)) return null
        return try {
            LocalDateTime.parse("${dayKey}T$normalized:00").atZone(ZoneId.of(tz)).toInstant().toString()
        } catch (_: Exception) {
            null
        }
    }

    private fun shiftMonth(key: String, delta: Int): String {
        val ym = YearMonth.parse(key).plusMonths(delta.toLong())
        return ym.format(DateTimeFormatter.ofPattern("yyyy-MM"))
    }
}
