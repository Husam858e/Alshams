package com.alshams.projectionmenu

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PinTest {
    @Test
    fun acceptsFourToEightDigits() {
        assertTrue(Pin.isValid("1234"))
        assertTrue(Pin.isValid("12345678"))
        assertFalse(Pin.isValid("123"))
        assertFalse(Pin.isValid("123456789"))
        assertFalse(Pin.isValid("12a4"))
        assertFalse(Pin.isValid(""))
        assertFalse(Pin.isValid("12 34"))
    }

    @Test
    fun normalizesArabicIndicDigits() {
        assertEquals("1234", Pin.normalize(" ١٢٣٤ "))
        assertEquals("0789", Pin.normalize("۰۷۸۹"))
        assertTrue(Pin.isValid(Pin.normalize("٠٠٠٠")))
    }

    @Test
    fun hashIsSaltedSha256() {
        // sha256("salt:1234"), lower-case hex
        assertEquals("35c56314f89066056408d6d269daf9e69217b9953215f286eec86cec3076271a", Pin.hash("1234", "salt"))
        assertNotEquals(Pin.hash("1234", "salt"), Pin.hash("1234", "other"))
        assertNotEquals(Pin.hash("1234", "salt"), Pin.hash("1235", "salt"))
        assertFalse(Pin.hash("1234", "salt").contains("1234"))
    }

    @Test
    fun matchesTheStoredHash() {
        val salt = Pin.newSalt()
        val stored = Pin.hash("2468", salt)
        assertTrue(Pin.matches("2468", salt, stored))
        assertTrue(Pin.matches("٢٤٦٨", salt, stored))
        assertFalse(Pin.matches("2469", salt, stored))
        assertFalse(Pin.matches("", salt, stored))
    }

    @Test
    fun saltsAreRandom() {
        assertEquals(32, Pin.newSalt().length)
        assertNotEquals(Pin.newSalt(), Pin.newSalt())
    }
}
