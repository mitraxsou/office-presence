package com.pwc.officepresence

import com.pwc.officepresence.ui.compose.MyTeamCopy
import org.junit.Assert.assertEquals
import org.junit.Test

class MyTeamCopyTest {
    @Test
    fun showsHowManyAreBelowTarget() {
        assertEquals("3 of 9 below target this month", MyTeamCopy.subtitle(9, 3))
    }

    @Test
    fun allMetAndUnknownCounts() {
        assertEquals("Everyone has met the target this month", MyTeamCopy.subtitle(4, 0))
        assertEquals("Opens in your browser", MyTeamCopy.subtitle(0, 0))
    }
}
