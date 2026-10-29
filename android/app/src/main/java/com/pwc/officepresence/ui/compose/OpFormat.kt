package com.pwc.officepresence.ui.compose

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

object OpFormat {
    fun zone(tz: String): ZoneId = try {
        ZoneId.of(tz)
    } catch (_: Exception) {
        ZoneId.of("Asia/Kolkata")
    }

    fun fmtTime(iso: String?, tz: String): String {
        if (iso.isNullOrBlank() || iso == "null") return ""
        return try {
            DateTimeFormatter.ofPattern("h:mm a", Locale.US)
                .format(Instant.parse(iso).atZone(zone(tz)))
                .lowercase(Locale.US)
        } catch (_: Exception) {
            ""
        }
    }

    fun fmtDayTitle(dayKey: String): String = try {
        val d = LocalDate.parse(dayKey)
        DateTimeFormatter.ofPattern("EEE d MMM", Locale.US).format(d)
    } catch (_: Exception) {
        dayKey
    }

    fun fmtMonthTitle(ym: String): String = try {
        DateTimeFormatter.ofPattern("MMMM yyyy", Locale.US).format(YearMonth.parse(ym))
    } catch (_: Exception) {
        ym
    }

    fun fmtMonthShort(ym: String): String = try {
        DateTimeFormatter.ofPattern("MMMM", Locale.US).format(YearMonth.parse(ym))
    } catch (_: Exception) {
        ym
    }

    fun durationHm(hours: Double): String {
        val totalMin = (hours * 60).roundToInt().coerceAtLeast(0)
        val h = totalMin / 60
        val m = totalMin % 60
        return when {
            h == 0 && m == 0 -> "0 h"
            h == 0 -> "$m m"
            m == 0 -> "$h h"
            else -> "$h h $m m"
        }
    }

    fun forSinceLabel(sinceIso: String?, tz: String, nowMs: Long = System.currentTimeMillis()): String {
        if (sinceIso.isNullOrBlank() || sinceIso == "null") return ""
        return try {
            val since = Instant.parse(sinceIso)
            val mins = Duration.between(since, Instant.ofEpochMilli(nowMs)).toMinutes().coerceAtLeast(0)
            val h = (mins / 60).toInt()
            val m = (mins % 60).toInt()
            val forPart = when {
                h == 0 -> "For $m m"
                m == 0 -> "For $h h"
                else -> "For $h h $m m"
            }
            val z = zone(tz)
            val sinceLocal = since.atZone(z)
            val today = Instant.ofEpochMilli(nowMs).atZone(z).toLocalDate()
            val sinceDay = sinceLocal.toLocalDate()
            val clock = DateTimeFormatter.ofPattern("h:mm a", Locale.US).format(sinceLocal).lowercase(Locale.US)
            val whenPart = when {
                sinceDay == today -> "since $clock"
                sinceDay == today.minusDays(1) -> "since $clock yesterday"
                else -> "since ${DateTimeFormatter.ofPattern("EEE", Locale.US).format(sinceLocal)} $clock"
            }
            "$forPart, $whenPart"
        } catch (_: Exception) {
            ""
        }
    }

    fun updatedAgo(lastSyncMs: Long, nowMs: Long = System.currentTimeMillis()): String {
        if (lastSyncMs <= 0L) return "Not synced yet"
        val mins = ((nowMs - lastSyncMs) / 60_000L).coerceAtLeast(0)
        return when {
            mins < 1 -> "Updated just now"
            mins == 1L -> "Updated 1 min ago"
            mins < 60 -> "Updated $mins min ago"
            mins < 120 -> "Updated 1 h ago"
            mins < 24 * 60 -> "Updated ${mins / 60} h ago"
            else -> "Updated ${mins / (24 * 60)} d ago"
        }
    }

    fun syncedAgo(lastSyncMs: Long, nowMs: Long = System.currentTimeMillis()): String {
        if (lastSyncMs <= 0L) return "Never synced"
        val mins = ((nowMs - lastSyncMs) / 60_000L).coerceAtLeast(0)
        return when {
            mins < 1 -> "Synced just now"
            mins == 1L -> "Synced 1 min ago"
            mins < 60 -> "Synced $mins min ago"
            mins < 120 -> "Last sync 1 h ago"
            mins < 24 * 60 -> "Last sync ${mins / 60} h ago"
            mins < 48 * 60 -> "Last sync 1 day ago"
            else -> "Last sync ${mins / (24 * 60)} days ago"
        }
    }

    fun initials(name: String): String {
        val parts = name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
        return when {
            parts.isEmpty() -> "?"
            parts.size == 1 -> parts[0].take(2).uppercase(Locale.US)
            else -> "${parts[0].first()}${parts[1].first()}".uppercase(Locale.US)
        }
    }

    fun nameFromEmail(email: String?): String {
        if (email.isNullOrBlank()) return "You"
        val local = email.substringBefore("@").replace('.', ' ').replace('_', ' ')
        return local.split(Regex("\\s+")).filter { it.isNotBlank() }
            .joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }
            .ifBlank { email }
    }

    fun emailValid(email: String): Boolean =
        Regex("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$").matches(email.trim())

    /**
     * preferredName, else firstName, else first segment of the email local-part
     * (before @, then before .), title-cased.
     */
    fun greetingName(
        preferredName: String?,
        firstName: String?,
        displayName: String?,
        email: String?,
    ): String {
        preferredName?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
        firstName?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
        val fromEmail = email?.trim()?.takeIf { it.isNotEmpty() }?.let { addr ->
            addr.substringBefore("@")
                .substringBefore(".")
                .trim()
                .takeIf { it.isNotEmpty() }
                ?.replaceFirstChar { c -> if (c.isLowerCase()) c.titlecase(Locale.US) else c.toString() }
        }
        if (!fromEmail.isNullOrBlank()) return fromEmail
        displayName?.trim()?.takeIf { it.isNotEmpty() }?.let { return it.split(Regex("\\s+")).first() }
        return "You"
    }

    /** Morning before 12:00, afternoon 12:00 to 17:00, evening after 17:00 (timezone). */
    fun dayPartLabel(tz: String, nowMs: Long = System.currentTimeMillis()): String {
        val hour = try {
            Instant.ofEpochMilli(nowMs).atZone(zone(tz)).hour
        } catch (_: Exception) {
            Instant.ofEpochMilli(nowMs).atZone(ZoneId.of("Asia/Kolkata")).hour
        }
        return when {
            hour < 12 -> "Good morning"
            hour < 17 -> "Good afternoon"
            else -> "Good evening"
        }
    }

    fun greetingLine(
        preferredName: String?,
        firstName: String?,
        displayName: String?,
        email: String?,
        tz: String,
        nowMs: Long = System.currentTimeMillis(),
    ): String = "${dayPartLabel(tz, nowMs)}, ${greetingName(preferredName, firstName, displayName, email)}"

    fun colleagueDisplayName(
        mode: String,
        firstName: String?,
        lastName: String?,
        preferredName: String?,
        fallback: String,
    ): String {
        val first = firstName?.trim().orEmpty()
        val last = lastName?.trim().orEmpty()
        val preferred = preferredName?.trim().orEmpty()
        return when (mode) {
            "preferred_only" -> preferred.ifBlank { first }.ifBlank { fallback }
            "preferred_last" -> {
                val left = preferred.ifBlank { first }
                when {
                    left.isNotBlank() && last.isNotBlank() -> "$left $last"
                    left.isNotBlank() -> left
                    last.isNotBlank() -> last
                    else -> fallback
                }
            }
            else -> when {
                first.isNotBlank() && last.isNotBlank() -> "$first $last"
                first.isNotBlank() -> first
                last.isNotBlank() -> last
                else -> fallback
            }
        }
    }

    fun todayDateLabel(tz: String, nowMs: Long = System.currentTimeMillis()): String {
        val z = zone(tz)
        val d = Instant.ofEpochMilli(nowMs).atZone(z).toLocalDate()
        return DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.US).format(d)
    }

    fun formatClockHm(hm: String): String {
        val parts = hm.split(":")
        if (parts.size < 2) return hm
        val h = parts[0].toIntOrNull() ?: return hm
        val m = parts[1].toIntOrNull() ?: 0
        val ampm = if (h < 12) "am" else "pm"
        val h12 = when {
            h == 0 -> 12
            h > 12 -> h - 12
            else -> h
        }
        return if (m == 0) "$h12:00 $ampm" else "$h12:${"%02d".format(m)} $ampm"
    }

    fun formatQuietHours(start: String, end: String): String {
        return "${formatClockHm(start)} to ${formatClockHm(end)}"
    }

    fun quietEndIsNextDay(start: String, end: String): Boolean {
        val s = hmMinutes(start) ?: return false
        val e = hmMinutes(end) ?: return false
        return e < s
    }

    fun quietListSubtitle(enabled: Boolean, start: String, end: String, days: String, custom: String): String {
        if (!enabled) return "Off"
        return "On, ${formatQuietHours(start, end)}, ${quietDayShort(days, custom)}"
    }

    fun quietFooter(start: String, end: String, days: String, custom: String): String {
        val window = formatQuietHours(start, end)
        val zone = "Uses this phone's time zone."
        return when {
            days == "weekdays" || (days == "custom" && customDaySet(custom) == WEEKDAYS) ->
                "Silent Monday to Friday from $window. Weekends follow your normal settings. $zone"
            days == "custom" && customDaySet(custom) != ALL_DAYS ->
                "Silent ${customDayPhrase(custom)} from $window. $zone"
            else -> "Silent every day from $window. $zone"
        }
    }

    private fun quietDayShort(days: String, custom: String): String = when {
        days == "weekdays" || (days == "custom" && customDaySet(custom) == WEEKDAYS) -> "weekdays"
        days == "custom" && customDaySet(custom) != ALL_DAYS -> customDayPhrase(custom)
        else -> "every day"
    }

    private fun customDayPhrase(custom: String): String {
        val names = customDaySet(custom).sorted().map { DAY_NAMES[it - 1] }
        return when (names.size) {
            0 -> "selected days"
            1 -> names[0]
            2 -> "${names[0]} and ${names[1]}"
            else -> names.dropLast(1).joinToString(", ") + ", and " + names.last()
        }
    }

    private fun customDaySet(custom: String): Set<Int> =
        custom.split(",").mapNotNull { it.trim().toIntOrNull() }.filter { it in 1..7 }.toSet()

    private fun hmMinutes(hm: String): Int? {
        val parts = hm.split(":")
        if (parts.size < 2) return null
        val h = parts[0].toIntOrNull() ?: return null
        val m = parts[1].toIntOrNull() ?: return null
        return h * 60 + m
    }

    private val DAY_NAMES = listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
    private val WEEKDAYS = setOf(1, 2, 3, 4, 5)
    private val ALL_DAYS = setOf(1, 2, 3, 4, 5, 6, 7)
}
