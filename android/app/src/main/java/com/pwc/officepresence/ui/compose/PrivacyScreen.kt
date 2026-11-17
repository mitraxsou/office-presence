package com.pwc.officepresence.ui.compose

import android.os.Handler
import android.os.Looper
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.ui.theme.LocalOpPalette
import com.pwc.officepresence.ui.theme.OpShape
import com.pwc.officepresence.ui.theme.OpType
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.concurrent.thread

fun privacySummary(prefs: AppPrefs): String {
    val version = prefs.consentAcceptedVersion
    if (version.isBlank()) return "Not accepted"
    val date = acceptedDate(prefs, "d MMM")
    return if (date != null) "Notice version $version, accepted $date" else "Notice version $version"
}

private fun acceptedDate(prefs: AppPrefs, pattern: String): String? =
    runCatching {
        val zone = runCatching { ZoneId.of(prefs.timezone) }.getOrDefault(ZoneId.of("Asia/Kolkata"))
        DateTimeFormatter.ofPattern(pattern, Locale.US).format(Instant.parse(prefs.consentAcceptedAtIso).atZone(zone))
    }.getOrNull()

/** You, Privacy (frame 1.3 b and c). Tracking consent, separate from colleague sharing. */
@Composable
fun PrivacyScreen(
    repo: PresenceRepository,
    prefs: AppPrefs,
    onBack: () -> Unit,
    onChangeSharing: () -> Unit,
    onWithdrawn: () -> Unit,
) {
    val p = LocalOpPalette.current
    val ctx = LocalContext.current
    val main = remember { Handler(Looper.getMainLooper()) }
    var tick by remember { mutableIntStateOf(0) }
    var confirm by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val readonly = prefs.isViewAsActive

    LaunchedEffect(Unit) {
        thread {
            runCatching { repo.refreshConsent() }
            main.post { tick += 1 }
        }
    }

    Column(Modifier.fillMaxSize().padding(20.dp).verticalScroll(rememberScrollState())) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back", tint = p.ink)
            }
            Text("Privacy", style = OpType.Title, color = p.ink)
        }
        Spacer(Modifier.height(12.dp))
        val version = remember(tick) { prefs.consentAcceptedVersion }
        val date = remember(tick) { acceptedDate(prefs, "d MMM yyyy") }
        OpCard {
            Text("Privacy notice", style = OpType.Body, color = p.ink, fontWeight = FontWeight.SemiBold)
            Text(
                when {
                    version.isBlank() -> "Not accepted"
                    date != null -> "Version $version, accepted $date"
                    else -> "Version $version"
                },
                style = OpType.Label,
                color = p.ink2,
                modifier = Modifier.padding(vertical = 6.dp),
            )
            OpGhostLink("Read the notice", onClick = { openNotice(ctx) })
        }
        Spacer(Modifier.height(12.dp))
        OpCard {
            Text("What is kept", style = OpType.Body, color = p.ink, fontWeight = FontWeight.SemiBold)
            SettingsRow("Office visits and points", value = "Kept for reports")
            DividerLine()
            SettingsRow("Location inside offices", value = "${prefs.consentRetentionDays} days")
            DividerLine()
            SettingsRow("Location outside offices", value = "Never stored")
        }
        Spacer(Modifier.height(12.dp))
        OpCard {
            Text("Who can see your visits", style = OpType.Body, color = p.ink, fontWeight = FontWeight.SemiBold)
            Text(
                if (prefs.sharePresenceWithPeers) {
                    "You and admins. Colleagues see In or Out only, because you share."
                } else {
                    "You and admins. Colleagues see nothing, because you do not share."
                },
                style = OpType.Label,
                color = p.ink2,
                modifier = Modifier.padding(vertical = 6.dp),
            )
            OpGhostLink("Change sharing", onClick = onChangeSharing)
        }
        error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, style = OpType.Label, color = p.ink)
        }
        Spacer(Modifier.height(24.dp))
        if (version.isNotBlank() && !readonly) {
            TextButton(onClick = { confirm = true }, modifier = Modifier.fillMaxWidth()) {
                Text("Withdraw consent and stop tracking", color = p.ink, fontWeight = FontWeight.SemiBold)
            }
        }
    }

    if (confirm) {
        AlertDialog(
            onDismissRequest = { if (!busy) confirm = false },
            title = { Text("Stop tracking?", style = OpType.Heading, color = p.ink) },
            text = {
                Text(
                    "This phone stops recording visits and signs out. Days you miss will not count unless an admin adds them. Your past visits are kept.",
                    style = OpType.Body,
                    color = p.ink2,
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        busy = true
                        error = null
                        thread {
                            val ok = runCatching { repo.withdrawConsent() }.getOrDefault(false)
                            main.post {
                                busy = false
                                confirm = false
                                if (ok) onWithdrawn() else error = "Could not withdraw. Check your connection and try again."
                            }
                        }
                    },
                    enabled = !busy,
                    shape = OpShape.Pill,
                    colors = ButtonDefaults.buttonColors(containerColor = p.ink, contentColor = p.bg),
                ) { Text("Withdraw and sign out", fontWeight = FontWeight.SemiBold) }
            },
            dismissButton = {
                TextButton(onClick = { confirm = false }, enabled = !busy) { Text("Cancel", color = p.ink) }
            },
            containerColor = p.surface,
        )
    }
}
