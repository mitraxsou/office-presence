package com.pwc.officepresence.ui.compose

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pwc.officepresence.BuildConfig
import com.pwc.officepresence.ui.theme.LocalOpPalette
import com.pwc.officepresence.ui.theme.OpType

object MyTeamCopy {
    /** Always measured against the policy target (8). */
    fun subtitle(people: Int, belowTarget: Int): String = when {
        people <= 0 -> "Opens in your browser"
        belowTarget <= 0 -> "Everyone has met the target this month"
        else -> "$belowTarget of $people below target this month"
    }
}

/** You > My team. Managers only. Opens /team on the web for now. */
@Composable
fun MyTeamSection(people: Int, belowTarget: Int) {
    val p = LocalOpPalette.current
    val ctx = LocalContext.current
    Spacer(Modifier.height(20.dp))
    Text("My team", style = OpType.Meta, color = p.ink3, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(8.dp))
    OpCard {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable {
                    ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.API_BASE_URL.trimEnd('/') + "/team")))
                }
                .padding(vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("My team", style = OpType.Body, color = p.ink)
                Text(
                    MyTeamCopy.subtitle(people, belowTarget),
                    style = OpType.Meta,
                    color = p.ink2,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
            Icon(Icons.AutoMirrored.Outlined.OpenInNew, contentDescription = null, tint = p.ink3, modifier = Modifier.size(18.dp))
        }
    }
}
