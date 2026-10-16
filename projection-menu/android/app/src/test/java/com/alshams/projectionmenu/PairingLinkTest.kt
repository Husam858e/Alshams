package com.alshams.projectionmenu

import org.junit.Assert.assertEquals
import org.junit.Test

class PairingLinkTest {
    private fun valid(raw: String?) = PairingLink.parse(raw) as PairingLink.Valid
    private fun error(raw: String?) = (PairingLink.parse(raw) as PairingLink.Invalid).error

    @Test
    fun tabletLinkKeepsTheFullLink() {
        val link = valid("http://192.168.1.10:3000/tablet/?table=T01&key=abc123")
        assertEquals(AppMode.TABLET, link.mode)
        assertEquals("http://192.168.1.10:3000/tablet/?table=T01&key=abc123", link.normalizedUrl)
    }

    @Test
    fun playerLinkKeepsTheFullLink() {
        val link = valid("https://menu.example.com/player/?projector=2&key=k")
        assertEquals(AppMode.PLAYER, link.mode)
        assertEquals("https://menu.example.com/player/?projector=2&key=k", link.normalizedUrl)
    }

    // Exactly what the dashboard shows and QR-encodes: the LAN base plus
    // tablet_path / player_path from src/routes/devices.js, and pairing.js's admin QR.
    @Test
    fun dashboardQrLinksParse() {
        val key = "Zq3v-_9LkR2mXp0aB7cD4eF_" // newKey(): 18 random bytes as base64url
        val base = "http://192.168.1.50:3000"
        val tablet = valid("$base/tablet/?table=T01&key=$key")
        assertEquals(AppMode.TABLET, tablet.mode)
        assertEquals("$base/tablet/?table=T01&key=$key", tablet.normalizedUrl)
        // Table codes go through encodeURIComponent (Arabic, spaces, '&').
        assertEquals(AppMode.TABLET, valid("$base/tablet/?table=%D8%B7%D8%A7%D9%88%D9%84%D8%A9%205&key=$key").mode)
        assertEquals(AppMode.TABLET, valid("$base/tablet/?table=A%26B&key=$key").mode)
        val player = valid("$base/player/?projector=12&key=$key")
        assertEquals(AppMode.PLAYER, player.mode)
        assertEquals("$base/player/?projector=12&key=$key", player.normalizedUrl)
        assertEquals("$base/admin/", valid("$base/admin/").normalizedUrl)
        // PUBLIC_BASE_URL behind a reverse proxy: https, no port.
        assertEquals(AppMode.TABLET, valid("https://menu.example.com/tablet/?table=T02&key=$key").mode)
        // The APK download QR is shown next to them; scanning it must not pair.
        assertEquals(PairingLink.ERROR_UNKNOWN, error("$base/app.apk"))
    }

    @Test
    fun trimsAndAddsHttpWhenTheSchemeIsMissing() {
        val link = valid("  \n192.168.1.10:3000/tablet/?table=T01&key=abc\t ")
        assertEquals("http://192.168.1.10:3000/tablet/?table=T01&key=abc", link.normalizedUrl)
        assertEquals("http://localhost:3000/admin/", valid("localhost:3000").normalizedUrl)
    }

    @Test
    fun lowerCasesOnlyTheScheme() {
        assertEquals("https://Menu.LAN/tablet?table=T01&key=K", valid("HTTPS://Menu.LAN/tablet?table=T01&key=K").normalizedUrl)
    }

    @Test
    fun tabletAndPlayerAcceptPathsBelowTheirFolder() {
        assertEquals(AppMode.TABLET, valid("http://h/tablet/index.html?table=T01&key=k").mode)
        assertEquals(AppMode.PLAYER, valid("http://h/player?projector=1&key=k#x").mode)
        assertEquals("http://h:3000//tablet/?table=T01&key=k", valid("http://h:3000//tablet/?table=T01&key=k").normalizedUrl)
    }

    @Test
    fun tabletParamsAreDecodedAndOrderFree() {
        assertEquals(AppMode.TABLET, valid("http://h/tablet/?key=k&table=%D8%B7%D8%A7%D9%88%D9%84%D8%A9").mode)
        assertEquals(AppMode.TABLET, valid("http://h/tablet/?key=k&table=طاولة 1").mode)
    }

    @Test
    fun tabletRequiresTableAndKey() {
        assertEquals(PairingLink.ERROR_TABLET, error("http://h/tablet/?table=T01"))
        assertEquals(PairingLink.ERROR_TABLET, error("http://h/tablet/?key=k"))
        assertEquals(PairingLink.ERROR_TABLET, error("http://h/tablet/?table=&key=k"))
        assertEquals(PairingLink.ERROR_TABLET, error("http://h/tablet/"))
    }

    @Test
    fun playerRequiresProjectorAndKey() {
        assertEquals(PairingLink.ERROR_PLAYER, error("http://h/player/?projector=1"))
        assertEquals(PairingLink.ERROR_PLAYER, error("http://h/player/?key=k"))
        assertEquals(PairingLink.ERROR_PLAYER, error("http://h/player/?projector=%20&key=k"))
    }

    @Test
    fun rootAndAdminLinksBecomeTheDashboard() {
        assertEquals(AppMode.ADMIN, valid("http://192.168.1.10:3000").mode)
        assertEquals("http://192.168.1.10:3000/admin/", valid("http://192.168.1.10:3000").normalizedUrl)
        assertEquals("http://192.168.1.10:3000/admin/", valid("http://192.168.1.10:3000/").normalizedUrl)
        assertEquals("http://192.168.1.10:3000/admin/", valid("http://192.168.1.10:3000/admin").normalizedUrl)
        assertEquals("https://menu.lan/admin/", valid("https://menu.lan/admin/#orders").normalizedUrl)
        assertEquals("http://h/admin/", valid("http://h/?x=1").normalizedUrl)
        assertEquals("http://[fe80::1]:3000/admin/", valid("http://[fe80::1]:3000/admin/index.html").normalizedUrl)
    }

    @Test
    fun unknownPathsAreRejected() {
        assertEquals(PairingLink.ERROR_UNKNOWN, error("http://h/menu"))
        assertEquals(PairingLink.ERROR_UNKNOWN, error("http://h/tablets/?table=T01&key=k"))
        assertEquals(PairingLink.ERROR_UNKNOWN, error("http://h/administrator"))
        assertEquals(PairingLink.ERROR_UNKNOWN, error("http://h/api/tablet/menu"))
        assertEquals("الرابط غير معروف — انسخه أو امسحه من لوحة التحكم", PairingLink.ERROR_UNKNOWN)
    }

    @Test
    fun emptyInputIsRejected() {
        assertEquals(PairingLink.ERROR_EMPTY, error(null))
        assertEquals(PairingLink.ERROR_EMPTY, error(""))
        assertEquals(PairingLink.ERROR_EMPTY, error("   "))
    }

    @Test
    fun onlyHttpAndHttpsAreAccepted() {
        assertEquals(PairingLink.ERROR_SCHEME, error("ftp://h/tablet/?table=T01&key=k"))
        assertEquals(PairingLink.ERROR_SCHEME, error("file:///sdcard/tablet"))
        assertEquals(PairingLink.ERROR_SCHEME, error("intent://h/#Intent;end"))
    }

    @Test
    fun hostIsRequired() {
        assertEquals(PairingLink.ERROR_HOST, error("http:///tablet/?table=T01&key=k"))
        assertEquals(PairingLink.ERROR_HOST, error("http://:3000/admin/"))
    }

    @Test
    fun malformedLinksAreRejected() {
        assertEquals(PairingLink.ERROR_MALFORMED, error("http://h:99999/admin/"))
        assertEquals(PairingLink.ERROR_MALFORMED, error("http://h:abc/admin/"))
        assertEquals(PairingLink.ERROR_MALFORMED, error("http://my host/admin/"))
        assertEquals(PairingLink.ERROR_MALFORMED, error("mailto:owner@example.com"))
        assertEquals(PairingLink.ERROR_MALFORMED, error("http://192.168.1.10:3000@evil.example/admin/"))
        assertEquals(PairingLink.ERROR_MALFORMED, error("http://user:pw@h:8080/admin/"))
        assertEquals(PairingLink.ERROR_MALFORMED, error("http://[fe80::1/admin/"))
    }
}
