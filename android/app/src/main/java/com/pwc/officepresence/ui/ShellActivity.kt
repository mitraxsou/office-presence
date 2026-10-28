package com.pwc.officepresence.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.pwc.officepresence.ui.analytics.OpAnalytics
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.notify.Notifier
import com.pwc.officepresence.presence.GeofenceHelper
import com.pwc.officepresence.presence.PresenceService
import com.pwc.officepresence.ui.compose.ColleaguesScreen
import com.pwc.officepresence.ui.compose.MonthScreen
import com.pwc.officepresence.ui.compose.OpFormat
import com.pwc.officepresence.ui.compose.OpNoticeBanner
import com.pwc.officepresence.ui.compose.TodayScreen
import com.pwc.officepresence.ui.compose.ViewAsBanner
import com.pwc.officepresence.ui.compose.YearScreen
import com.pwc.officepresence.ui.compose.YouScreen
import com.pwc.officepresence.ui.theme.LocalOpPalette
import com.pwc.officepresence.ui.theme.OfficePresenceTheme
import com.pwc.officepresence.ui.theme.OpColor
import com.pwc.officepresence.ui.theme.OpShape
import com.pwc.officepresence.ui.theme.OpType
import kotlin.concurrent.thread

class ShellActivity : AppCompatActivity() {
    private lateinit var repo: PresenceRepository
    private lateinit var prefs: AppPrefs

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        GeofenceHelper.registerAll(this, prefs.offices())
        maybeBackgroundAndBattery()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        repo = PresenceRepository(this)
        prefs = repo.prefs()
        prefs.applyTheme()
        super.onCreate(savedInstanceState)
        if (prefs.token.isNullOrBlank() && prefs.viewAsAdminToken.isNullOrBlank()) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }
        // SPEC: view-as ends on process restart (not Activity recreation / rotation).
        if (!viewAsCheckedThisProcess) {
            viewAsCheckedThisProcess = true
            if (!prefs.viewAsSessionId.isNullOrBlank()) {
                val adminTok = prefs.viewAsAdminToken
                val sid = prefs.viewAsSessionId
                prefs.clearViewAsLocal()
                if (!adminTok.isNullOrBlank()) {
                    thread {
                        runCatching { repo.api.endViewAs(sid, adminTok) }
                        runOnUiThread { PresenceService.start(this) }
                    }
                }
            }
        } else if (prefs.isViewAsReadonly) {
            PresenceService.stop(this)
        }
        Notifier.ensureAllChannels(this)
        setContent {
            val dark = when (prefs.themeMode) {
                "dark" -> true
                "light" -> false
                else -> isSystemInDarkTheme()
            }
            OfficePresenceTheme(dark = dark) {
                ShellApp(
                    repo = repo,
                    prefs = prefs,
                    onRequestPermissions = { requestPerms() },
                    onOpenDeveloper = { startActivity(Intent(this, DeveloperActivity::class.java)) },
                    onForceDetect = { onDone -> forceDetect(onDone) },
                    onEndViewAs = {
                        val adminTok = prefs.viewAsAdminToken
                        val sid = prefs.viewAsSessionId
                        prefs.clearViewAsLocal()
                        thread {
                            if (!adminTok.isNullOrBlank()) {
                                runCatching { repo.api.endViewAs(sid, adminTok) }
                            }
                            runOnUiThread { PresenceService.start(this) }
                        }
                    },
                    onSignOut = {
                        val adminTok = prefs.viewAsAdminToken
                        val sid = prefs.viewAsSessionId
                        val hadViewAs = !sid.isNullOrBlank()
                        prefs.clearViewAsLocal()
                        thread {
                            if (hadViewAs && !adminTok.isNullOrBlank()) {
                                runCatching { repo.api.endViewAs(sid, adminTok) }
                            }
                            runOnUiThread {
                                PresenceService.stop(this)
                                prefs.clearSession()
                                startActivity(Intent(this, LoginActivity::class.java))
                                finish()
                            }
                        }
                    },
                    onUnauthorized = { goToLoginAfterUnauthorized() },
                )
            }
        }
    }

    private fun goToLoginAfterUnauthorized() {
        PresenceService.stop(this)
        startActivity(Intent(this, LoginActivity::class.java))
        finish()
    }

    private fun requestPerms() {
        val need = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        )
        if (Build.VERSION.SDK_INT >= 33) need += Manifest.permission.POST_NOTIFICATIONS
        permissionLauncher.launch(need.toTypedArray())
    }

    private fun maybeBackgroundAndBattery() {
        if (Build.VERSION.SDK_INT >= 29 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) {
            permissionLauncher.launch(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION))
            return
        }
        val pm = getSystemService(PowerManager::class.java)
        if (!pm.isIgnoringBatteryOptimizations(packageName)) {
            startActivity(
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                },
            )
        }
    }

    private fun forceDetect(onDone: (String) -> Unit) {
        if (prefs.isViewAsReadonly) {
            onDone("Not available while viewing as ${prefs.viewAsTargetName.ifBlank { "another user" }}")
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) {
            onDone("Location permission needed")
            requestPerms()
            return
        }
        val cts = CancellationTokenSource()
        LocationServices.getFusedLocationProviderClient(this)
            .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token)
            .addOnSuccessListener { loc ->
                if (loc == null) {
                    onDone("No fix yet")
                    return@addOnSuccessListener
                }
                thread {
                    val state = repo.forceDetect(loc.latitude, loc.longitude, loc.accuracy.toDouble())
                    runOnUiThread {
                        if (state.unauthorized) {
                            goToLoginAfterUnauthorized()
                            return@runOnUiThread
                        }
                        onDone(
                            if (state.ok) {
                                if (state.inOffice) "In at ${state.officeName ?: "office"}" else "Out of office"
                            } else state.message ?: "Check failed",
                        )
                    }
                }
            }
            .addOnFailureListener { onDone(it.message ?: "Check failed") }
    }

    companion object {
        /** Cleared when the process dies; survives Activity recreation. */
        private var viewAsCheckedThisProcess = false
    }
}

private enum class Tab(val label: String, val icon: ImageVector) {
    Today("Today", Icons.Outlined.LocationOn),
    Month("Month", Icons.Outlined.CalendarMonth),
    Year("Year", Icons.Outlined.BarChart),
    Colleagues("Colleagues", Icons.Outlined.Groups),
    You("You", Icons.Outlined.Person),
}

/** Colleagues tab is admin-only. View-as follows the target (never admin). */
private fun showColleaguesTab(prefs: AppPrefs): Boolean =
    prefs.role == "admin" && !prefs.isViewAsActive

@Composable
private fun ShellApp(
    repo: PresenceRepository,
    prefs: AppPrefs,
    onRequestPermissions: () -> Unit,
    onOpenDeveloper: () -> Unit,
    onForceDetect: ((String) -> Unit) -> Unit,
    onEndViewAs: () -> Unit,
    onSignOut: () -> Unit,
    onUnauthorized: () -> Unit,
) {
    var tab by remember { mutableStateOf(Tab.Today) }
    var monthFocus by remember { mutableStateOf<String?>(null) }
    var viewAsEpoch by remember { mutableStateOf(0) }
    var viewAsEndedNotice by remember { mutableStateOf<String?>(null) }
    val p = LocalOpPalette.current
    val ctx = LocalContext.current
    val colleaguesTab = showColleaguesTab(prefs)
    val tabs = remember(colleaguesTab, viewAsEpoch) {
        buildList {
            add(Tab.Today)
            add(Tab.Month)
            add(Tab.Year)
            if (colleaguesTab) add(Tab.Colleagues)
            add(Tab.You)
        }
    }
    LaunchedEffect(tabs) {
        if (tab !in tabs) tab = Tab.Today
    }
    LaunchedEffect(tab) {
        OpAnalytics.screen(ctx, tab.label)
    }
    LaunchedEffect(viewAsEndedNotice) {
        if (viewAsEndedNotice != null) {
            kotlinx.coroutines.delay(8_000)
            viewAsEndedNotice = null
        }
    }
    Scaffold(
        containerColor = p.bg,
        bottomBar = {
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(p.surface)
                    .navigationBarsPadding()
                    .height(88.dp)
                    .padding(horizontal = 4.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                tabs.forEach { t ->
                    val selected = t == tab
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier
                            .clip(OpShape.Pill)
                            .background(if (selected) OpColor.AccentWash else p.surface)
                            .clickable { tab = t }
                            .padding(horizontal = if (tabs.size > 4) 10.dp else 14.dp, vertical = 10.dp),
                    ) {
                        Icon(
                            t.icon,
                            contentDescription = t.label,
                            tint = if (selected) OpColor.Accent else p.ink3,
                        )
                        Text(
                            t.label,
                            color = if (selected) p.ink else p.ink2,
                            style = OpType.Meta,
                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                        )
                    }
                }
            }
        },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            if (prefs.isViewAsActive) {
                ViewAsBanner(
                    prefs = prefs,
                    onEnd = {
                        val target = prefs.viewAsTargetName.ifBlank { "another user" }
                        val mins = prefs.minutesSpentInViewAs()
                        val self = OpFormat.greetingName(
                            prefs.preferredName,
                            prefs.firstName,
                            prefs.displayName,
                            prefs.email,
                        )
                        onEndViewAs()
                        viewAsEpoch += 1
                        tab = Tab.You
                        viewAsEndedNotice =
                            "You are back as $self. Viewing as $target ended after $mins min. Your tracking is on again."
                    },
                )
            }
            viewAsEndedNotice?.let { msg ->
                OpNoticeBanner(msg, Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when (tab) {
                    Tab.Today -> TodayScreen(
                        repo = repo,
                        prefs = prefs,
                        onRequestPermissions = onRequestPermissions,
                        onForceDetect = onForceDetect,
                        onOpenColleagues = {
                            if (showColleaguesTab(prefs)) tab = Tab.Colleagues
                        },
                        onOpenMonth = { tab = Tab.Month },
                        onUnauthorized = onUnauthorized,
                    )
                    Tab.Month -> MonthScreen(
                        repo = repo,
                        prefs = prefs,
                        initialMonthKey = monthFocus,
                        onInitialMonthConsumed = { monthFocus = null },
                    )
                    Tab.Year -> YearScreen(
                        repo = repo,
                        prefs = prefs,
                        onOpenMonth = { key ->
                            monthFocus = key
                            tab = Tab.Month
                        },
                    )
                    Tab.Colleagues -> ColleaguesScreen(
                        repo = repo,
                        prefs = prefs,
                        onTurnOnSharing = { },
                        onReviewSharing = { tab = Tab.You },
                    )
                    Tab.You -> YouScreen(
                        repo = repo,
                        prefs = prefs,
                        onForceDetect = onForceDetect,
                        onOpenDeveloper = onOpenDeveloper,
                        onSignOut = onSignOut,
                        onUnauthorized = onUnauthorized,
                        onViewAsStarted = {
                            viewAsEpoch += 1
                            tab = Tab.Today
                        },
                    )
                }
            }
        }
    }
}
