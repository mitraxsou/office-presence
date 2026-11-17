package com.pwc.officepresence.ui.compose

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.pwc.officepresence.BuildConfig
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.ui.theme.LocalOpPalette
import com.pwc.officepresence.ui.theme.OpType
import kotlin.concurrent.thread

private const val STEPS = 6

private data class SetupState(
    val fine: Boolean,
    val background: Boolean,
    val notifications: Boolean,
    val battery: Boolean,
)

private fun readSetup(ctx: Context): SetupState {
    fun granted(p: String) = ContextCompat.checkSelfPermission(ctx, p) == PackageManager.PERMISSION_GRANTED
    val pm = ctx.getSystemService(PowerManager::class.java)
    return SetupState(
        fine = granted(Manifest.permission.ACCESS_FINE_LOCATION),
        background = Build.VERSION.SDK_INT < 29 || granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
        notifications = Build.VERSION.SDK_INT < 33 || granted(Manifest.permission.POST_NOTIFICATIONS),
        battery = pm?.isIgnoringBatteryOptimizations(ctx.packageName) == true,
    )
}

/**
 * Shown after sign in, before any tracking, when consent is missing or outdated (frame 1.2).
 * Steps: Welcome, Privacy, Location, Notifications, Battery, Done.
 */
@Composable
fun OnboardingScreen(
    repo: PresenceRepository,
    prefs: AppPrefs,
    onAccepted: () -> Unit,
    onFinished: () -> Unit,
    onSignOut: () -> Unit,
) {
    val p = LocalOpPalette.current
    val ctx = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val main = remember { Handler(Looper.getMainLooper()) }
    var step by remember { mutableIntStateOf(0) }
    var setup by remember { mutableStateOf(readSetup(ctx)) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var retention by remember { mutableIntStateOf(prefs.consentRetentionDays) }

    DisposableEffect(lifecycleOwner) {
        val obs = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) setup = readSetup(ctx)
        }
        lifecycleOwner.lifecycle.addObserver(obs)
        onDispose { lifecycleOwner.lifecycle.removeObserver(obs) }
    }

    LaunchedEffect(Unit) {
        thread {
            runCatching { repo.refreshConsent() }
            main.post {
                retention = prefs.consentRetentionDays
                // Accepted elsewhere (for example on the website): skip straight to tracking.
                if (prefs.hasTrackingConsent) {
                    onAccepted()
                    onFinished()
                }
            }
        }
    }

    val fineLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        setup = readSetup(ctx)
    }
    val backgroundLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        setup = readSetup(ctx)
    }
    val notifLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        setup = readSetup(ctx)
        step = 4
    }

    fun agree() {
        busy = true
        error = null
        val version = prefs.consentRequiredVersion.ifBlank { "1" }
        thread {
            val ok = runCatching { repo.acceptConsent(version) }.getOrDefault(false)
            main.post {
                busy = false
                if (ok) {
                    onAccepted()
                    step = 2
                } else {
                    error = "Could not save. Check your connection and try again."
                }
            }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(p.bg)
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            StepDots(step)
            Spacer(Modifier.weight(1f))
            if (step in 1..4) {
                Text(
                    "Back",
                    style = OpType.Label,
                    color = p.ink2,
                    modifier = Modifier.clickable { step -= 1 }.padding(8.dp),
                )
            }
        }
        Spacer(Modifier.height(24.dp))
        when (step) {
            0 -> {
                val name = OpFormat.greetingName(prefs.preferredName, prefs.firstName, prefs.displayName, prefs.email)
                Title("Welcome, $name")
                Body("Office Presence counts the days you are at a PwC office. Each office day earns points toward your monthly target.")
                Body("Setup takes about a minute.")
                Spacer(Modifier.height(32.dp))
                OpPrimaryButton("Continue", onClick = { step = 1 })
            }
            1 -> {
                Title("Your privacy")
                OpCard {
                    Check("We record when you are inside a PwC office: time, office and GPS accuracy.")
                    Check("We do not store where you are outside offices.")
                    Check("Raw location is deleted after $retention days. Your monthly totals stay.")
                    Check("Admins see your visits. Colleagues see In or Out only if you share.")
                    Check("You can withdraw at any time in You, Privacy.")
                }
                Spacer(Modifier.height(12.dp))
                OpGhostLink("Read the full notice", onClick = { openNotice(ctx) })
                error?.let {
                    Spacer(Modifier.height(12.dp))
                    Text(it, style = OpType.Label, color = p.ink)
                }
                Spacer(Modifier.height(32.dp))
                OpPrimaryButton("I agree", onClick = { agree() }, loading = busy)
                Spacer(Modifier.height(8.dp))
                SkipLink("Not now (signs you out)", onSignOut)
            }
            2 -> {
                Title("Location: All the time")
                Body("The app needs location all the time to notice when you arrive, even when it is closed. It checks near offices and a few times a day.")
                OpCard {
                    Text("On the next screen choose", style = OpType.Meta, color = p.ink2)
                    Text("Allow all the time", style = OpType.Body, color = p.ink, fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(12.dp))
                if (setup.fine) Check("Precise location allowed")
                if (setup.background) Check("Location all the time allowed")
                Spacer(Modifier.height(32.dp))
                when {
                    !setup.fine -> OpPrimaryButton("Allow location", onClick = {
                        fineLauncher.launch(
                            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                        )
                    })
                    !setup.background && Build.VERSION.SDK_INT >= 29 -> OpPrimaryButton("Open settings", onClick = {
                        backgroundLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    })
                    else -> OpPrimaryButton("Continue", onClick = { step = 3 })
                }
                Spacer(Modifier.height(8.dp))
                if (!setup.fine || !setup.background) SkipLink("Skip for now") { step = 3 }
            }
            3 -> {
                Title("Notifications")
                Body("Get told when you arrive, when a correction is decided, and if tracking stops working.")
                Spacer(Modifier.height(32.dp))
                if (!setup.notifications && Build.VERSION.SDK_INT >= 33) {
                    OpPrimaryButton("Allow notifications", onClick = {
                        notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    })
                    Spacer(Modifier.height(8.dp))
                    SkipLink("Skip for now") { step = 4 }
                } else {
                    Check("Notifications allowed")
                    Spacer(Modifier.height(16.dp))
                    OpPrimaryButton("Continue", onClick = { step = 4 })
                }
            }
            4 -> {
                Title("Battery")
                Body("Some phones stop apps in the background. Set battery to Unrestricted so visits are not missed.")
                OpCard {
                    SettingsRow("Battery now", value = if (setup.battery) "Unrestricted" else "Optimized")
                }
                Spacer(Modifier.height(32.dp))
                if (!setup.battery) {
                    OpPrimaryButton("Open battery settings", onClick = { openBattery(ctx) })
                    Spacer(Modifier.height(8.dp))
                    SkipLink("Skip for now") { step = 5 }
                } else {
                    OpPrimaryButton("Continue", onClick = { step = 5 })
                }
            }
            else -> {
                Title("You are set up")
                OpCard {
                    Check("Privacy accepted")
                    CheckOrFix("Location: All the time", setup.fine && setup.background) { step = 2 }
                    CheckOrFix(
                        if (setup.notifications) "Notifications: on" else "Notifications: off",
                        setup.notifications,
                    ) { step = 3 }
                    CheckOrFix(
                        if (setup.battery) "Battery: Unrestricted" else "Battery: Optimized",
                        setup.battery,
                    ) { step = 4 }
                }
                Body("Your first visit counts when you reach an office.")
                Spacer(Modifier.height(32.dp))
                OpPrimaryButton("Go to Today", onClick = onFinished)
            }
        }
    }
}

@Composable
private fun StepDots(step: Int) {
    val p = LocalOpPalette.current
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        repeat(STEPS) { i ->
            Box(
                Modifier
                    .size(if (i == step) 10.dp else 8.dp)
                    .clip(CircleShape)
                    .background(if (i <= step) p.ink else p.line),
            )
        }
    }
}

@Composable
private fun Title(text: String) {
    Text(text, style = OpType.Title, color = LocalOpPalette.current.ink, modifier = Modifier.padding(bottom = 12.dp))
}

@Composable
private fun Body(text: String) {
    Text(text, style = OpType.Body, color = LocalOpPalette.current.ink2, modifier = Modifier.padding(bottom = 12.dp))
}

@Composable
private fun Check(text: String) {
    val p = LocalOpPalette.current
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.Top) {
        Text("\u2713", style = OpType.Body, color = p.ink, fontWeight = FontWeight.Bold)
        Spacer(Modifier.width(10.dp))
        Text(text, style = OpType.Body, color = p.ink)
    }
}

@Composable
private fun CheckOrFix(text: String, ok: Boolean, onFix: () -> Unit) {
    val p = LocalOpPalette.current
    if (ok) {
        Check(text)
        return
    }
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("!", style = OpType.Body, color = p.ink3, fontWeight = FontWeight.Bold)
        Spacer(Modifier.width(10.dp))
        Text(text, style = OpType.Body, color = p.ink, modifier = Modifier.weight(1f))
        OpGhostLink("Fix", onClick = onFix)
    }
}

@Composable
private fun SkipLink(label: String, onClick: () -> Unit) {
    Text(
        label,
        style = OpType.Label,
        color = LocalOpPalette.current.ink2,
        fontWeight = FontWeight.SemiBold,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(12.dp),
    )
}

fun openNotice(ctx: Context) {
    ctx.startActivity(
        Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.API_BASE_URL.trimEnd('/') + "/privacy"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    )
}

private fun openBattery(ctx: Context) {
    val req = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}"))
    runCatching { ctx.startActivity(req) }.onFailure {
        runCatching { ctx.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
    }
}
