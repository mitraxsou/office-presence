package com.pwc.officepresence.ui.compose

import android.os.Handler
import android.os.Looper
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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

@Composable
fun ColleaguesScreen(
    repo: PresenceRepository,
    prefs: AppPrefs,
    onTurnOnSharing: () -> Unit,
    onReviewSharing: () -> Unit,
) {
    val p = LocalOpPalette.current
    val main = remember { Handler(Looper.getMainLooper()) }
    var res by remember { mutableStateOf<JSONObject?>(null) }
    var query by remember { mutableStateOf("") }

    fun reload(force: Boolean = false) {
        thread {
            if (force || repo.shouldRefreshPeers()) {
                repo.refreshIfNeeded(force = force)
            }
            val r = runCatching { repo.api.peers() }.getOrNull()
            main.post {
                res = r
                if (r?.ok() == true) prefs.peersFetchedAtMs = System.currentTimeMillis()
            }
        }
    }

    LaunchedEffect(Unit) { reload() }

    Column(Modifier.fillMaxSize().padding(20.dp)) {
        Text("Colleagues", style = OpType.Title, color = p.ink)
        Text(
            OpFormat.updatedAgo(prefs.peersFetchedAtMs.takeIf { it > 0 } ?: prefs.lastSyncAtMs),
            style = OpType.Meta,
            color = p.ink3,
            modifier = Modifier.padding(top = 4.dp),
        )
        Spacer(Modifier.height(12.dp))
        RowSearch(query = query, onChange = { query = it })
        Spacer(Modifier.height(16.dp))

        when {
            res == null -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = OpColor.Accent)
                }
            }
            res?.optInt("_httpStatus") == 403 -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Colleagues not available", style = OpType.Heading, color = p.ink)
                        Text(
                            "This list is only for admins.",
                            style = OpType.Body,
                            color = p.ink2,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(top = 8.dp, start = 24.dp, end = 24.dp),
                        )
                    }
                }
            }
            res?.ok() != true -> Text(res?.optString("error") ?: "Could not load", color = p.ink2)
            else -> {
                val optedIn = res!!.optBoolean("optedIn") || prefs.sharePresenceWithPeers
                val arr = res!!.optJSONArray("peers")
                val peers = if (arr == null) emptyList() else (0 until arr.length()).map { arr.getJSONObject(it) }
                val filtered = peers.filter {
                    val name = it.optString("name").ifBlank { it.optString("email") }
                    query.isBlank() || name.contains(query, ignoreCase = true)
                }
                val inn = filtered.filter { it.optBoolean("inOffice") }
                val out = filtered.filter { !it.optBoolean("inOffice") }

                if (!optedIn) {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .clip(OpShape.Card)
                            .background(OpColor.AccentWash)
                            .padding(16.dp),
                    ) {
                        Text("You are hidden from colleagues", style = OpType.Heading, color = p.ink)
                        Text(
                            "If you share, they see In or Out, since when, and the office name. Never your location, hours, or points counted.",
                            style = OpType.Body,
                            color = p.ink2,
                            modifier = Modifier.padding(top = 6.dp, bottom = 12.dp),
                        )
                        OpPrimaryButton("Turn on sharing", onClick = {
                            thread {
                                repo.api.setPrivacy(true)
                                prefs.sharePresenceWithPeers = true
                                main.post {
                                    onTurnOnSharing()
                                    reload()
                                }
                            }
                        })
                    }
                    Spacer(Modifier.height(16.dp))
                }

                if (optedIn && peers.isEmpty()) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Box(
                                Modifier.size(72.dp).clip(CircleShape).background(p.sunk),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(Icons.Outlined.Groups, contentDescription = null, tint = p.ink3, modifier = Modifier.size(36.dp))
                            }
                            Spacer(Modifier.height(16.dp))
                            Text("No one is sharing yet", style = OpType.Heading, color = p.ink)
                            Text(
                                "Colleagues appear here once they turn on sharing in You.",
                                style = OpType.Body,
                                color = p.ink2,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.padding(top = 8.dp, start = 24.dp, end = 24.dp),
                            )
                            Spacer(Modifier.height(16.dp))
                            OpSecondaryButton("Review my sharing", onClick = onReviewSharing)
                        }
                    }
                } else {
                    LazyColumn(Modifier.fillMaxSize()) {
                        if (inn.isNotEmpty() || !optedIn) {
                            item {
                                Text("In now, ${inn.size}", style = OpType.Meta, color = p.ink3, fontWeight = FontWeight.Bold)
                                Spacer(Modifier.height(8.dp))
                            }
                            item {
                                PeerCard(inn) { peer ->
                                    val name = peer.optString("name").ifBlank { peer.optString("email") }
                                    ColleagueRow(
                                        name = name,
                                        office = peer.optString("officeName").takeIf { it.isNotBlank() && it != "null" },
                                        since = OpFormat.fmtTime(peer.optString("sinceAt").takeIf { it != "null" }, prefs.timezone),
                                        inOffice = true,
                                    )
                                }
                            }
                        }
                        if (out.isNotEmpty()) {
                            item {
                                Spacer(Modifier.height(16.dp))
                                Text("Out, ${out.size}", style = OpType.Meta, color = p.ink3, fontWeight = FontWeight.Bold)
                                Spacer(Modifier.height(8.dp))
                            }
                            item {
                                PeerCard(out) { peer ->
                                    val name = peer.optString("name").ifBlank { peer.optString("email") }
                                    ColleagueRow(
                                        name = name,
                                        office = peer.optString("officeName").takeIf { it.isNotBlank() && it != "null" },
                                        since = peer.optString("sinceAt").takeIf { it.isNotBlank() && it != "null" }?.let {
                                            "Out since ${OpFormat.fmtTime(it, prefs.timezone)}"
                                        },
                                        inOffice = false,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PeerCard(
    peers: List<JSONObject>,
    row: @Composable (JSONObject) -> Unit,
) {
    if (peers.isEmpty()) {
        OpCard { Text("Nobody right now.", style = OpType.Meta, color = LocalOpPalette.current.ink3) }
        return
    }
    OpCard {
        peers.forEachIndexed { i, peer ->
            row(peer)
            if (i < peers.lastIndex) DividerLine()
        }
    }
}

@Composable
private fun RowSearch(query: String, onChange: (String) -> Unit) {
    val p = LocalOpPalette.current
    androidx.compose.foundation.layout.Row(
        Modifier
            .fillMaxWidth()
            .clip(OpShape.Input)
            .background(p.surface)
            .border(1.dp, p.line, OpShape.Input)
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.Search, contentDescription = null, tint = p.ink3)
        Spacer(Modifier.size(8.dp))
        BasicTextField(
            value = query,
            onValueChange = onChange,
            singleLine = true,
            textStyle = TextStyle(color = p.ink, fontSize = 16.sp),
            cursorBrush = SolidColor(OpColor.Accent),
            modifier = Modifier.weight(1f),
            decorationBox = { inner ->
                if (query.isEmpty()) Text("Search colleagues", color = p.ink3, fontSize = 16.sp)
                inner()
            },
        )
    }
}
