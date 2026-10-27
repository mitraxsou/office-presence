package com.pwc.officepresence.ui.compose

import android.os.Handler
import android.os.Looper
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.PresenceRepository
import com.pwc.officepresence.data.ok
import com.pwc.officepresence.presence.PresenceService
import com.pwc.officepresence.ui.theme.LocalOpPalette
import com.pwc.officepresence.ui.theme.OpColor
import com.pwc.officepresence.ui.theme.OpShape
import com.pwc.officepresence.ui.theme.OpType
import java.time.Instant
import kotlin.concurrent.thread

data class ViewAsCandidate(
    val id: String,
    val name: String,
    val email: String,
    val isTest: Boolean,
    val officeHint: String?,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ViewAsChooseScreen(
    repo: PresenceRepository,
    prefs: AppPrefs,
    onBack: () -> Unit,
    onStarted: () -> Unit,
) {
    val p = LocalOpPalette.current
    val ctx = LocalContext.current
    val main = remember { Handler(Looper.getMainLooper()) }
    var query by remember { mutableStateOf("") }
    var users by remember { mutableStateOf<List<ViewAsCandidate>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf<ViewAsCandidate?>(null) }
    var starting by remember { mutableStateOf(false) }

    fun reload(q: String) {
        loading = true
        thread {
            val res = runCatching { repo.api.adminUsersForViewAs(q.ifBlank { null }) }.getOrNull()
            val arr = res?.optJSONArray("users")
            val list = if (arr == null) {
                emptyList()
            } else {
                (0 until arr.length()).mapNotNull { i ->
                    val u = arr.getJSONObject(i)
                    if (u.optString("role") == "admin") return@mapNotNull null
                    if (u.optString("deactivatedAt").takeIf { it.isNotBlank() && it != "null" } != null) {
                        return@mapNotNull null
                    }
                    val isTest = u.optBoolean("isTestAccount") || u.optBoolean("isDummy")
                    val first = u.optString("firstName", "").takeIf { it.isNotBlank() && it != "null" }
                    val last = u.optString("lastName", "").takeIf { it.isNotBlank() && it != "null" }
                    val preferred = u.optString("preferredName", "").takeIf { it.isNotBlank() && it != "null" }
                    val legacy = u.optString("name", "").takeIf { it.isNotBlank() && it != "null" }
                    val name = when {
                        !first.isNullOrBlank() && !last.isNullOrBlank() -> "$first $last"
                        !preferred.isNullOrBlank() -> preferred
                        !legacy.isNullOrBlank() -> legacy
                        else -> OpFormat.nameFromEmail(u.optString("email"))
                    }
                    val office = u.optJSONObject("homeOffice")?.optString("name")
                        ?.takeIf { it.isNotBlank() && it != "null" }
                        ?: u.optJSONObject("status")?.optString("officeName")
                            ?.takeIf { it.isNotBlank() && it != "null" }
                    ViewAsCandidate(
                        id = u.optString("id"),
                        name = name,
                        email = u.optString("email"),
                        isTest = isTest,
                        officeHint = office,
                    )
                }
            }
            main.post {
                users = list
                loading = false
                error = if (res == null || res.ok().not()) {
                    res?.optString("error", "Could not load users") ?: "Could not load users"
                } else null
            }
        }
    }

    LaunchedEffect(Unit) { reload("") }

    val filtered = if (query.isBlank()) {
        users
    } else {
        val q = query.lowercase()
        users.filter { it.name.lowercase().contains(q) || it.email.lowercase().contains(q) }
    }
    val tests = filtered.filter { it.isTest }
    val reals = filtered.filter { !it.isTest }

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
            Text("View as another user", style = OpType.Title.copy(fontSize = 24.sp), color = p.ink)
        }
        Text(
            "Real users are read only. Test accounts work fully, including tracking.",
            style = OpType.Body,
            color = p.ink2,
            modifier = Modifier.padding(top = 8.dp, bottom = 16.dp),
        )
        Row(
            Modifier
                .fillMaxWidth()
                .clip(OpShape.Input)
                .border(1.dp, p.lineStrong, OpShape.Input)
                .background(p.surface)
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.Search, contentDescription = null, tint = p.ink3, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(10.dp))
            BasicTextField(
                value = query,
                onValueChange = {
                    query = it
                    reload(it)
                },
                singleLine = true,
                textStyle = OpType.Body.copy(color = p.ink),
                cursorBrush = SolidColor(OpColor.Accent),
                modifier = Modifier.weight(1f),
                decorationBox = { inner ->
                    if (query.isEmpty()) {
                        Text("Search name or email", style = OpType.Body, color = p.ink3)
                    }
                    inner()
                },
            )
        }
        Spacer(Modifier.height(20.dp))
        if (loading && users.isEmpty()) {
            Text("Loading users...", style = OpType.Meta, color = p.ink3)
        } else if (!error.isNullOrBlank() && users.isEmpty()) {
            Text(error!!, style = OpType.Meta, color = p.ink2)
        } else {
            if (tests.isNotEmpty()) {
                Text("Test accounts", style = OpType.Meta, color = p.ink3, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                OpCard {
                    tests.forEachIndexed { i, u ->
                        ViewAsUserRow(u) { confirm = u }
                        if (i < tests.lastIndex) DividerLine()
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
            if (reals.isNotEmpty()) {
                Text("Real users, read only", style = OpType.Meta, color = p.ink3, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                OpCard {
                    reals.forEachIndexed { i, u ->
                        ViewAsUserRow(u) { confirm = u }
                        if (i < reals.lastIndex) DividerLine()
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            Text("Other admins are not listed.", style = OpType.Meta, color = p.ink3)
        }
    }

    val selected = confirm
    if (selected != null) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { if (!starting) confirm = null },
            sheetState = sheetState,
            containerColor = p.surface,
            shape = OpShape.Sheet,
        ) {
            ViewAsConfirmSheet(
                user = selected,
                starting = starting,
                onCancel = { if (!starting) confirm = null },
                onStart = {
                    starting = true
                    thread {
                        val res = runCatching { repo.api.startViewAs(selected.id) }.getOrNull()
                        main.post {
                            starting = false
                            if (res == null || !res.ok()) {
                                error = res?.optString("error", "Could not start view as")
                                    ?: "Could not start view as"
                                confirm = null
                                return@post
                            }
                            val session = res.optJSONObject("session")
                            val target = res.optJSONObject("target")
                            val token = res.optString("viewAsToken", "")
                            val expiresIso = res.optString("expiresAt", session?.optString("expiresAt").orEmpty())
                            val expiresMs = try {
                                Instant.parse(expiresIso).toEpochMilli()
                            } catch (_: Exception) {
                                System.currentTimeMillis() + 30 * 60_000L
                            }
                            val mode = res.optString("mode", session?.optString("mode").orEmpty())
                            if (token.isBlank()) {
                                error = "Server did not return a view-as token"
                                confirm = null
                                return@post
                            }
                            prefs.beginViewAs(
                                sessionId = session?.optString("id").orEmpty(),
                                mode = mode,
                                targetName = target?.optString("name") ?: selected.name,
                                targetEmail = target?.optString("email") ?: selected.email,
                                expiresAtMs = expiresMs,
                                viewAsToken = token,
                            )
                            if (prefs.isViewAsReadonly) {
                                PresenceService.stop(ctx)
                            } else {
                                PresenceService.start(ctx)
                            }
                            confirm = null
                            onStarted()
                        }
                    }
                },
            )
        }
    }
}

@Composable
private fun ViewAsUserRow(user: ViewAsCandidate, onClick: () -> Unit) {
    val p = LocalOpPalette.current
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarCircle(user.name, size = 40.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(user.name, style = OpType.Label.copy(fontWeight = FontWeight.SemiBold), color = p.ink)
                if (user.isTest) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "Test",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = p.ink2,
                        modifier = Modifier
                            .clip(OpShape.Pill)
                            .background(p.sunk)
                            .padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
            }
            val sub = if (user.isTest && !user.officeHint.isNullOrBlank()) {
                "${user.email}, ${user.officeHint}"
            } else {
                user.email
            }
            Text(sub, style = OpType.Meta, color = p.ink2)
        }
        Text(">", color = p.ink3)
    }
}

@Composable
private fun ViewAsConfirmSheet(
    user: ViewAsCandidate,
    starting: Boolean,
    onCancel: () -> Unit,
    onStart: () -> Unit,
) {
    val p = LocalOpPalette.current
    val first = user.name.split(" ").firstOrNull().orEmpty()
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 28.dp)) {
        if (user.isTest) {
            Text("Test as ${user.name}?", style = OpType.Title.copy(fontSize = 24.sp), color = p.ink)
            Spacer(Modifier.height(16.dp))
            ConfirmBullet(Icons.Outlined.LocationOn, "Tracking on this phone counts for ${user.name} while the session lasts.")
            DividerLine()
            ConfirmBullet(Icons.Outlined.BarChart, "Visits are marked test and left out of the roster and reports.")
            DividerLine()
            ConfirmBullet(Icons.Outlined.Edit, "You can send corrections and change settings as this account.")
            DividerLine()
            ConfirmBullet(Icons.Outlined.Timer, "Ends after 30 minutes. Your own tracking resumes after.")
            Spacer(Modifier.height(20.dp))
            OpPrimaryButton(
                label = if (starting) "Starting..." else "Start testing",
                onClick = onStart,
                loading = starting,
            )
        } else {
            Text("View as ${user.name}?", style = OpType.Title.copy(fontSize = 24.sp), color = p.ink)
            Spacer(Modifier.height(16.dp))
            ConfirmBullet(Icons.Outlined.Lock, "Read only. You cannot send corrections, change sharing, or sign out devices.")
            DividerLine()
            ConfirmBullet(
                Icons.Outlined.LocationOn,
                "Tracking pauses on this phone. No location is recorded for ${first.ifBlank { user.name }} or for you.",
            )
            DividerLine()
            ConfirmBullet(Icons.Outlined.Timer, "Ends by itself after 30 minutes, or when you tap End.")
            DividerLine()
            ConfirmBullet(Icons.Outlined.Description, "Logged with your name and shown on ${first.ifBlank { user.name }}'s user record.")
            Spacer(Modifier.height(20.dp))
            OpPrimaryButton(
                label = if (starting) "Starting..." else "Start viewing",
                onClick = onStart,
                loading = starting,
            )
        }
        Spacer(Modifier.height(12.dp))
        TextButton(onClick = onCancel, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text(
                "Cancel",
                color = OpColor.Accent,
                style = OpType.Body.copy(textDecoration = TextDecoration.Underline, fontWeight = FontWeight.SemiBold),
            )
        }
    }
}

@Composable
private fun ConfirmBullet(icon: ImageVector, text: String) {
    val p = LocalOpPalette.current
    Row(
        Modifier.fillMaxWidth().padding(vertical = 14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(icon, contentDescription = null, tint = p.ink3, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(12.dp))
        Text(text, style = OpType.Body, color = p.ink, modifier = Modifier.weight(1f))
    }
}
