package com.alshams.projectionmenu

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MultiPressDetectorTest {
    @Test
    fun firesOnTheFifthTapWithinTheWindow() {
        val taps = MultiPressDetector(count = 5, windowMs = 3_000)
        assertFalse(taps.press(0))
        assertFalse(taps.press(500))
        assertFalse(taps.press(1_000))
        assertFalse(taps.press(1_500))
        assertTrue(taps.press(3_000))
    }

    @Test
    fun forgetsTapsOlderThanTheWindow() {
        val taps = MultiPressDetector(count = 5, windowMs = 3_000)
        listOf(0L, 1_000, 2_000, 3_000).forEach { assertFalse(taps.press(it)) }
        assertFalse(taps.press(3_500)) // the tap at 0 expired
        assertTrue(taps.press(3_600))
    }

    @Test
    fun startsOverAfterFiring() {
        val backs = MultiPressDetector(count = 3, windowMs = 2_000)
        assertFalse(backs.press(0))
        assertFalse(backs.press(100))
        assertTrue(backs.press(200))
        assertFalse(backs.press(300))
        assertFalse(backs.press(400))
        assertTrue(backs.press(500))
    }

    @Test
    fun resetClearsProgress() {
        val backs = MultiPressDetector(count = 3, windowMs = 2_000)
        backs.press(0)
        backs.press(100)
        backs.reset()
        assertFalse(backs.press(200))
    }

    @Test
    fun cornerIsAtLeast72dpOr12Percent() {
        // Phone, 1080x2340 px at density 3: 216 px (72dp) beats 12%.
        assertTrue(SettingsCorner.contains(216f, 216f, 1080, 2340, 3f))
        assertFalse(SettingsCorner.contains(217f, 100f, 1080, 2340, 3f))
        assertTrue(SettingsCorner.contains(100f, 280f, 1080, 2340, 3f)) // 12% of 2340 = 280.8
        assertFalse(SettingsCorner.contains(100f, 281f, 1080, 2340, 3f))
        // TV, 1920x1080 at density 2: 12% of the width (230 px) beats 144 px.
        assertTrue(SettingsCorner.contains(230f, 144f, 1920, 1080, 2f))
        assertFalse(SettingsCorner.contains(231f, 10f, 1920, 1080, 2f))
        assertFalse(SettingsCorner.contains(-1f, 10f, 1920, 1080, 2f))
    }
}
