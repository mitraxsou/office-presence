package com.pwc.officepresence.ui

import android.content.Context
import android.util.TypedValue
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.annotation.AttrRes
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.materialswitch.MaterialSwitch
import com.pwc.officepresence.R
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Small builders for card-based screens assembled in code. */
object Ui {
    fun dp(ctx: Context, v: Int): Int = (v * ctx.resources.displayMetrics.density).toInt()

    fun attrColor(ctx: Context, @AttrRes attr: Int): Int {
        val tv = TypedValue()
        ctx.theme.resolveAttribute(attr, tv, true)
        return tv.data
    }

    fun card(parent: LinearLayout, title: String, subtitle: String? = null): LinearLayout {
        val ctx = parent.context
        val card = MaterialCardView(ctx).apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                .apply { topMargin = dp(ctx, 12) }
            radius = dp(ctx, 16).toFloat()
            cardElevation = 0f
            strokeWidth = dp(ctx, 1)
            strokeColor = attrColor(ctx, com.google.android.material.R.attr.colorOutline)
            setCardBackgroundColor(attrColor(ctx, com.google.android.material.R.attr.colorSurfaceContainer))
        }
        val inner = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val p = dp(ctx, 16)
            setPadding(p, p, p, p)
        }
        card.addView(inner)
        parent.addView(card)
        inner.addView(text(ctx, title, 16f, bold = true))
        if (subtitle != null) inner.addView(text(ctx, subtitle, 13f, muted = true).apply { setPadding(0, dp(ctx, 4), 0, 0) })
        return inner
    }

    fun text(ctx: Context, value: String, size: Float = 15f, bold: Boolean = false, muted: Boolean = false): TextView =
        TextView(ctx).apply {
            text = value
            textSize = size
            if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
            setTextColor(
                attrColor(
                    ctx,
                    if (muted) com.google.android.material.R.attr.colorOnSurfaceVariant
                    else com.google.android.material.R.attr.colorOnSurface,
                ),
            )
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        }

    fun switch(parent: LinearLayout, label: String, checked: Boolean, onChange: (MaterialSwitch, Boolean) -> Unit): MaterialSwitch {
        val ctx = parent.context
        val s = MaterialSwitch(ctx).apply {
            text = label
            isChecked = checked
            minHeight = dp(ctx, 52)
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                .apply { topMargin = dp(ctx, 4) }
        }
        s.setOnCheckedChangeListener { v, c -> if (v.getTag(R.id.quiet) != true) onChange(v as MaterialSwitch, c) }
        parent.addView(s)
        return s
    }

    /** Sets checked state without firing the change callback. */
    fun setQuiet(s: MaterialSwitch, checked: Boolean) {
        s.setTag(R.id.quiet, true)
        s.isChecked = checked
        s.setTag(R.id.quiet, false)
    }

    fun button(parent: LinearLayout, label: String, style: Int = 0, onClick: () -> Unit): MaterialButton {
        val ctx = parent.context
        val b = if (style == 0) MaterialButton(ctx) else MaterialButton(ctx, null, style)
        b.text = label
        b.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            .apply { topMargin = dp(ctx, 8) }
        b.setOnClickListener { onClick() }
        parent.addView(b)
        return b
    }

    fun textButton(parent: LinearLayout, label: String, onClick: () -> Unit) =
        button(parent, label, androidx.appcompat.R.attr.borderlessButtonStyle, onClick)

    fun fmtTime(iso: String?, tz: String): String {
        if (iso.isNullOrBlank()) return ""
        return try {
            val zone = try { ZoneId.of(tz) } catch (_: Exception) { ZoneId.systemDefault() }
            DateTimeFormatter.ofPattern("h:mm a").format(Instant.parse(iso).atZone(zone))
        } catch (_: Exception) {
            ""
        }
    }

    fun fmtDateTime(iso: String?, tz: String): String {
        if (iso.isNullOrBlank()) return "never"
        return try {
            val zone = try { ZoneId.of(tz) } catch (_: Exception) { ZoneId.systemDefault() }
            DateTimeFormatter.ofPattern("d MMM, h:mm a").format(Instant.parse(iso).atZone(zone))
        } catch (_: Exception) {
            iso
        }
    }
}
