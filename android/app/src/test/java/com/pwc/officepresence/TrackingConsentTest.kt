package com.pwc.officepresence

import com.pwc.officepresence.data.TrackingConsent
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TrackingConsentTest {
    @Test
    fun noConsentMeansNoTracking() {
        assertFalse(TrackingConsent.accepted("", "1"))
        assertFalse(TrackingConsent.accepted("", ""))
    }

    @Test
    fun currentVersionIsAccepted() {
        assertTrue(TrackingConsent.accepted("2", "2"))
        assertTrue(TrackingConsent.accepted("1", ""))
    }

    @Test
    fun outdatedVersionNeedsOnboardingAgain() {
        assertFalse(TrackingConsent.accepted("1", "2"))
        assertTrue(TrackingConsent.needsOnboarding(signedIn = true, viewAs = false, acceptedVersion = "1", requiredVersion = "2"))
    }

    @Test
    fun noOnboardingWhenSignedOutOrInViewAs() {
        assertFalse(TrackingConsent.needsOnboarding(signedIn = false, viewAs = false, acceptedVersion = "", requiredVersion = "1"))
        assertFalse(TrackingConsent.needsOnboarding(signedIn = true, viewAs = true, acceptedVersion = "", requiredVersion = "1"))
    }
}
