package com.pwc.officepresence.ui.compose

import android.os.Handler
import android.os.Looper
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.data.ok
import com.pwc.officepresence.ui.theme.LocalOpPalette
import com.pwc.officepresence.ui.theme.OpColor
import com.pwc.officepresence.ui.theme.OpShape
import com.pwc.officepresence.ui.theme.OpType
import org.json.JSONObject
import kotlin.concurrent.thread

private val SHOW_AS_OPTIONS = listOf(
    "first_last" to "First and last",
    "preferred_last" to "Preferred and last",
    "preferred_only" to "Preferred only",
)

@Composable
fun ProfileScreen(
    repo: PresenceRepository,
    prefs: AppPrefs,
    onBack: () -> Unit,
) {
    val p = LocalOpPalette.current
    val main = remember { Handler(Looper.getMainLooper()) }
    var first by remember { mutableStateOf(prefs.firstName) }
    var last by remember { mutableStateOf(prefs.lastName) }
    var preferred by remember { mutableStateOf(prefs.preferredName) }
    var mode by remember { mutableStateOf(prefs.colleagueDisplayMode.ifBlank { "first_last" }) }
    var email by remember { mutableStateOf(prefs.email.orEmpty()) }
    var firstError by remember { mutableStateOf<String?>(null) }
    var lastError by remember { mutableStateOf<String?>(null) }
    var saveError by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    var showModePicker by remember { mutableStateOf(false) }
    var loaded by remember { mutableStateOf(false) }
    var hasPassword by remember { mutableStateOf(false) }
    var currentPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var passwordBusy by remember { mutableStateOf(false) }
    var passwordMsg by remember { mutableStateOf<String?>(null) }
    var passwordError by remember { mutableStateOf<String?>(null) }
    val readonly = prefs.isViewAsReadonly

    LaunchedEffect(Unit) {
        thread {
            val res = runCatching { repo.api.getProfile() }.getOrNull()
            val profile = res?.optJSONObject("profile")
            val pw = runCatching { repo.api.getPasswordStatus() }.getOrNull()
            main.post {
                if (profile != null) {
                    repo.applyProfile(profile)
                    first = profile.optString("firstName", "").takeIf { it != "null" }.orEmpty()
                    last = profile.optString("lastName", "").takeIf { it != "null" }.orEmpty()
                    preferred = profile.optString("preferredName", "").takeIf { it != "null" }.orEmpty()
                    mode = profile.optString("colleagueDisplayMode", "first_last").ifBlank { "first_last" }
                    email = profile.optString("email", prefs.email.orEmpty())
                }
                if (pw != null && pw.ok()) hasPassword = pw.optBoolean("hasPassword", false)
                loaded = true
            }
        }
    }

    val fallback = prefs.displayName.ifBlank { OpFormat.nameFromEmail(email) }
    val previewGreeting = OpFormat.greetingLine(preferred, first, fallback, email, prefs.timezone)
    val previewColleague = OpFormat.colleagueDisplayName(mode, first, last, preferred, fallback)
    val initialsSource = listOf(first, last).filter { it.isNotBlank() }.joinToString(" ").ifBlank { fallback }
    val canSave = first.trim().isNotEmpty() && last.trim().isNotEmpty() && !saving && !readonly

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back", tint = p.ink)
            }
            Text("Profile", style = OpType.Title, color = p.ink)
        }
        Spacer(Modifier.height(16.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(64.dp)
                    .clip(CircleShape)
                    .background(p.sunk),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    OpFormat.initials(initialsSource),
                    style = OpType.Heading,
                    color = p.ink2,
                )
            }
            Spacer(Modifier.width(14.dp))
            Text(
                "Initials come from your first and last name.",
                style = OpType.Meta,
                color = p.ink2,
            )
        }
        Spacer(Modifier.height(20.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ProfileField(
                label = "First name",
                value = first,
                onValueChange = {
                    first = it.take(40)
                    firstError = null
                },
                error = firstError,
                enabled = !readonly,
                modifier = Modifier.weight(1f),
            )
            ProfileField(
                label = "Last name",
                value = last,
                onValueChange = {
                    last = it.take(40)
                    lastError = null
                },
                error = lastError,
                enabled = !readonly,
                modifier = Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(14.dp))
        ProfileField(
            label = "Preferred name (optional)",
            value = preferred,
            onValueChange = { preferred = it.take(30) },
            helper = "Used when the app greets you. Empty means your first name.",
            enabled = !readonly,
        )
        Spacer(Modifier.height(14.dp))
        Text("Show me to colleagues as", style = OpType.Meta, color = p.ink2)
        Spacer(Modifier.height(6.dp))
        Row(
            Modifier
                .fillMaxWidth()
                .clip(OpShape.Input)
                .background(p.surface)
                .border(1.dp, p.lineStrong, OpShape.Input)
                .clickable(enabled = !readonly) { showModePicker = true }
                .padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(previewColleague, style = OpType.Body, color = p.ink, modifier = Modifier.weight(1f))
            Text(">", color = p.ink3)
        }
        Spacer(Modifier.height(14.dp))
        Text("Email", style = OpType.Meta, color = p.ink2)
        Spacer(Modifier.height(6.dp))
        Row(
            Modifier
                .fillMaxWidth()
                .clip(OpShape.Input)
                .background(p.sunk)
                .border(1.dp, p.line, OpShape.Input)
                .padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(email, style = OpType.Body, color = p.ink2, modifier = Modifier.weight(1f))
            Icon(Icons.Outlined.Lock, contentDescription = null, tint = p.ink3, modifier = Modifier.size(18.dp))
        }
        Spacer(Modifier.height(20.dp))
        Column(
            Modifier
                .fillMaxWidth()
                .clip(OpShape.Card)
                .background(p.sunk)
                .padding(16.dp),
        ) {
            Text("Preview", style = OpType.Meta, color = p.ink3)
            Spacer(Modifier.height(8.dp))
            Text(previewGreeting, style = OpType.Body.copy(fontWeight = FontWeight.SemiBold), color = p.ink)
            Spacer(Modifier.height(4.dp))
            Text("Colleagues see: $previewColleague", style = OpType.Body, color = p.ink)
        }
        if (!saveError.isNullOrBlank()) {
            Spacer(Modifier.height(12.dp))
            Text(saveError!!, style = OpType.Meta, color = OpColor.Accent)
        }
        if (readonly) {
            Spacer(Modifier.height(12.dp))
            Text(
                "Not available while viewing as ${prefs.viewAsTargetName.ifBlank { "another user" }}.",
                style = OpType.Meta,
                color = p.ink3,
            )
        }
        Spacer(Modifier.height(24.dp))
        OpPrimaryButton(
            label = if (saving) "Saving..." else "Save profile",
            enabled = canSave,
            loading = saving,
            onClick = {
                firstError = if (first.trim().isEmpty()) "Enter your first name." else null
                lastError = if (last.trim().isEmpty()) "Enter your last name." else null
                if (firstError != null || lastError != null) return@OpPrimaryButton
                saving = true
                saveError = null
                thread {
                    val body = JSONObject()
                        .put("firstName", first.trim())
                        .put("lastName", last.trim())
                        .put("preferredName", preferred.trim())
                        .put("colleagueDisplayMode", mode)
                    val res = runCatching { repo.api.patchProfile(body) }.getOrNull()
                    main.post {
                        saving = false
                        if (res == null || !res.ok()) {
                            saveError = res?.optString("error", "Could not save profile") ?: "Could not save profile"
                        } else {
                            res.optJSONObject("profile")?.let { repo.applyProfile(it) }
                            onBack()
                        }
                    }
                }
            },
        )
        Spacer(Modifier.height(32.dp))
        Text("Password", style = OpType.Heading, color = p.ink)
        Spacer(Modifier.height(6.dp))
        Text(
            "Optional. Sign in with email and password instead of a Teams code. At least 8 characters, no spaces.",
            style = OpType.Meta,
            color = p.ink2,
        )
        Spacer(Modifier.height(14.dp))
        if (hasPassword) {
            ProfileField(
                label = "Current password",
                value = currentPassword,
                onValueChange = { currentPassword = it; passwordError = null },
                enabled = !readonly && !passwordBusy,
                password = true,
            )
            Spacer(Modifier.height(14.dp))
        }
        ProfileField(
            label = if (hasPassword) "New password" else "Password",
            value = newPassword,
            onValueChange = { newPassword = it; passwordError = null },
            enabled = !readonly && !passwordBusy,
            password = true,
        )
        Spacer(Modifier.height(14.dp))
        ProfileField(
            label = "Confirm password",
            value = confirmPassword,
            onValueChange = { confirmPassword = it; passwordError = null },
            enabled = !readonly && !passwordBusy,
            password = true,
        )
        if (!passwordError.isNullOrBlank()) {
            Spacer(Modifier.height(12.dp))
            Text(passwordError!!, style = OpType.Meta, color = OpColor.Accent)
        }
        if (!passwordMsg.isNullOrBlank()) {
            Spacer(Modifier.height(12.dp))
            Text(passwordMsg!!, style = OpType.Meta, color = p.ink2)
        }
        Spacer(Modifier.height(16.dp))
        OpPrimaryButton(
            label = when {
                passwordBusy -> "Saving"
                hasPassword -> "Update password"
                else -> "Set password"
            },
            enabled = !readonly &&
                !passwordBusy &&
                newPassword.isNotEmpty() &&
                confirmPassword.isNotEmpty() &&
                (!hasPassword || currentPassword.isNotEmpty()),
            loading = passwordBusy,
            onClick = {
                if (newPassword != confirmPassword) {
                    passwordError = "Passwords do not match"
                    return@OpPrimaryButton
                }
                passwordBusy = true
                passwordError = null
                passwordMsg = null
                thread {
                    val res = runCatching {
                        repo.api.setPassword(
                            newPassword,
                            confirmPassword,
                            if (hasPassword) currentPassword else null,
                        )
                    }.getOrNull()
                    main.post {
                        passwordBusy = false
                        if (res == null || !res.ok()) {
                            passwordError = res?.optString("error", "Could not save password")
                                ?: "Could not save password"
                        } else {
                            hasPassword = true
                            currentPassword = ""
                            newPassword = ""
                            confirmPassword = ""
                            passwordMsg = "Password saved. You can sign in with it next time."
                        }
                    }
                }
            },
        )
        if (!loaded) {
            Spacer(Modifier.height(8.dp))
            Text("Loading profile...", style = OpType.Meta, color = p.ink3)
        }
    }

    if (showModePicker) {
        AlertDialog(
            onDismissRequest = { showModePicker = false },
            title = { Text("Show me to colleagues as") },
            text = {
                Column {
                    SHOW_AS_OPTIONS.forEach { (id, label) ->
                        val sample = OpFormat.colleagueDisplayName(id, first, last, preferred, fallback)
                        Text(
                            "$label ($sample)",
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    mode = id
                                    showModePicker = false
                                }
                                .padding(vertical = 12.dp),
                            color = p.ink,
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showModePicker = false }) { Text("Close") }
            },
        )
    }
}

@Composable
private fun ProfileField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    helper: String? = null,
    error: String? = null,
    enabled: Boolean = true,
    password: Boolean = false,
) {
    val p = LocalOpPalette.current
    Column(modifier) {
        Text(label, style = OpType.Meta, color = p.ink2)
        Spacer(Modifier.height(6.dp))
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            enabled = enabled,
            singleLine = true,
            isError = error != null,
            visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
            shape = OpShape.Input,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = OpColor.Accent,
                unfocusedBorderColor = p.lineStrong,
                errorBorderColor = OpColor.Accent,
                focusedContainerColor = p.surface,
                unfocusedContainerColor = p.surface,
                disabledContainerColor = p.sunk,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
        if (error != null) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(top = 6.dp),
            ) {
                Icon(
                    Icons.Outlined.ErrorOutline,
                    contentDescription = null,
                    tint = OpColor.Accent,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(6.dp))
                Text(error, style = OpType.Meta, color = OpColor.Accent, fontSize = 13.sp)
            }
        } else if (!helper.isNullOrBlank()) {
            Text(helper, style = OpType.Meta, color = p.ink3, modifier = Modifier.padding(top = 6.dp))
        }
    }
}
