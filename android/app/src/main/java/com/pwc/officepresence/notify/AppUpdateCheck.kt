package com.pwc.officepresence.notify

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Pure version check, kept separate so it can be unit tested. */
object AppUpdateCheck {
    fun isOutdated(installedVersionCode: Int, publishedVersionCode: Int): Boolean =
        publishedVersionCode > 0 && installedVersionCode < publishedVersionCode

    /** One reminder per local calendar day while the installed build is behind. */
    fun shouldRemind(
        installedVersionCode: Int,
        publishedVersionCode: Int,
        lastRemindDay: String,
        today: String,
    ): Boolean = isOutdated(installedVersionCode, publishedVersionCode) && lastRemindDay != today

    fun downloadPage(apiBase: String): String {
        val base = apiBase.trim().trimEnd('/').ifBlank { "https://office-presence-psi.vercel.app" }
        return "$base/download"
    }

    fun notice(versionName: String): String {
        val name = versionName.trim().takeIf { it.isNotEmpty() && it != "null" }
        return if (name == null) {
            "A new version is ready. Open the download page to install it."
        } else {
            "Version $name is ready. Open the download page to install it."
        }
    }
}

/** Bumped after sync stores the published version, so the open screen can ask. */
object AppUpdateSignals {
    private val ticks = MutableStateFlow(0)
    val tick: StateFlow<Int> = ticks

    fun bump() {
        ticks.value = ticks.value + 1
    }
}
