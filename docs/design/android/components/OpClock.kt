package docs.design.android.components

/**
 * Reference only. The app copy lives in com.pwc.officepresence.ui.compose.OpClock.
 *
 * SPEC section 26. Dial sheet on the phone, popover on the web.
 * Hour sweep 700 ms, minute sweep 800 ms, small overshoot.
 * Grey hands keep the previous time. Orange arc shows the gap.
 * Nudge -15, -5, +5, +15 minutes. Drag snaps to 1 minute.
 * Today blocks times later than now. Out must be after In.
 * Reduced motion: jump, no sweep, no arc.
 */
object OpClockSpec {
    const val HOUR_SWEEP_MS = 700
    const val MINUTE_SWEEP_MS = 800
}
