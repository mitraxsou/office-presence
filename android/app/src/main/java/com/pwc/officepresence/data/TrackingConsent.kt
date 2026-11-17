package com.pwc.officepresence.data

/** Pure consent rules, kept separate so they can be unit tested. */
object TrackingConsent {
    /** Accepted when a version is stored and it matches the server's current one (if known yet). */
    fun accepted(acceptedVersion: String, requiredVersion: String): Boolean =
        acceptedVersion.isNotBlank() && (requiredVersion.isBlank() || acceptedVersion == requiredVersion)

    /** Onboarding is needed after sign in whenever consent is missing or outdated. */
    fun needsOnboarding(signedIn: Boolean, viewAs: Boolean, acceptedVersion: String, requiredVersion: String): Boolean =
        signedIn && !viewAs && !accepted(acceptedVersion, requiredVersion)
}
