package com.pwc.officepresence.presence

import com.pwc.officepresence.data.Office
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * In or Out for the open Today screen, from the latest foreground fix or geofence transition.
 * Display only: the server status replaces it after the next sync.
 */
object LiveStatus {
    data class Reading(
        val inOffice: Boolean,
        val officeId: String?,
        val officeName: String?,
        val atMs: Long,
        /** When this In or Out started, carried over while readings agree. */
        val sinceMs: Long = atMs,
    )

    private val state = MutableStateFlow<Reading?>(null)
    val latest: StateFlow<Reading?> = state

    fun publish(next: Reading) {
        val prev = state.value
        val same = prev != null && prev.inOffice == next.inOffice &&
            (!next.inOffice || prev.officeId == next.officeId)
        state.value = if (same) next.copy(sinceMs = prev!!.sinceMs) else next
    }

    /**
     * In when the fix is inside an office fence, Out when an accurate fix is outside every fence.
     * Null when the fix is weaker than the fence radius, so a weak fix never flips to Out.
     */
    fun fromFix(
        lat: Double,
        lng: Double,
        accuracy: Double,
        offices: List<Office>,
        rules: PresenceRules,
        atMs: Long,
    ): Reading? {
        if (accuracy > rules.fenceRadiusMeters) return null
        val match = VisitCalculator.matchNearestOffice(lat, lng, accuracy, offices.map { it.toFence() }, rules)
        val office = offices.firstOrNull { it.id == match?.id }
        return Reading(
            inOffice = office != null,
            officeId = office?.id,
            officeName = office?.displayName,
            atMs = atMs,
        )
    }
}
