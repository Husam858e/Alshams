package com.alshams.projectionmenu

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PairingLinkTest {
    private fun valid(raw: String?) = PairingLink.parse(raw) as PairingLink.Valid
    private fun error(raw: String?) = (PairingLink.parse(raw) as PairingLink.Invalid).error

    @Test
    fun serverAddressesBecomeTheStaffApp() {
        assertEquals(AppMode.APP, valid("192.168.1.10:3000").mode)
        assertEquals("http://192.168.1.10:3000/app/", valid("192.168.1.10:3000").normalizedUrl)
        assertEquals("http://192.168.1.10:3000/app/", valid("http://192.168.1.10:3000").normalizedUrl)
        assertEquals("http://192.168.1.10:3000/app/", valid("http://192.168.1.10:3000/").normalizedUrl)
        assertEquals("http://h/app/", valid("http://h/?x=1").normalizedUrl)
        assertEquals("http://localhost:3000/app/", valid("localhost:3000").normalizedUrl)
        assertEquals("http://[fe80::1]:3000/app/", valid("http://[fe80::1]:3000/").normalizedUrl)
    }

    @Test
    fun staffAppLinksKeepOnlyTheServer() {
        assertEquals("http://192.168.1.10:3000/app/", valid("http://192.168.1.10:3000/app").normalizedUrl)
        assertEquals("http://192.168.1.10:3000/app/", valid("http://192.168.1.10:3000/app/#/tables/7").normalizedUrl)
        assertEquals("https://menu.lan/app/", valid("https://menu.lan/app/index.html?x=1").normalizedUrl)
        assertEquals("http://h:3000/app/", valid("http://h:3000//app/").normalizedUrl)
    }

    // The v1 dashboard and table-tablet links (saved configs, printed QR codes).
    @Test
    fun legacyAdminAndTabletLinksOpenTheStaffApp() {
        assertEquals(AppMode.APP, valid("http://192.168.1.10:3000/admin/").mode)
        assertEquals("http://192.168.1.10:3000/app/", valid("http://192.168.1.10:3000/admin/#orders").normalizedUrl)
        assertEquals("http://192.168.1.10:3000/app/", valid("http://192.168.1.10:3000/tablet/?table=T01&key=abc").normalizedUrl)
        assertEquals("https://menu.example.com/app/", valid("https://menu.example.com/tablet").normalizedUrl)
    }

    // Exactly what the server hands out: claim's playerUrl and the QR in the staff app.
    @Test
    fun playerLinksKeepTheFullLink() {
        val key = "Zq3v-_9LkR2mXp0aB7cD4eF_" // newKey(): random bytes as base64url
        val link = valid("http://192.168.1.50:3000/player/?device=$key")
        assertEquals(AppMode.PLAYER, link.mode)
        assertEquals("http://192.168.1.50:3000/player/?device=$key", link.normalizedUrl)
        assertEquals(AppMode.PLAYER, valid("https://menu.example.com/player?device=k#x").mode)
        assertEquals(AppMode.PLAYER, valid("http://h/player/index.html?x=1&device=k").mode)
        assertEquals("http://h:3000//player/?device=k", valid("http://h:3000//player/?device=k").normalizedUrl)
    }

    @Test
    fun playerLinksNeedADeviceKey() {
        assertEquals(PairingLink.ERROR_PLAYER, error("http://h/player/"))
        assertEquals(PairingLink.ERROR_PLAYER, error("http://h/player/?device="))
        assertEquals(PairingLink.ERROR_PLAYER, error("http://h/player/?device=%20"))
        assertEquals(PairingLink.ERROR_PLAYER, error("http://h/player/?preview=3"))
        // v1 links (projector + key) cannot be used with a v2 server.
        assertEquals(PairingLink.ERROR_PLAYER_V1, error("http://h/player/?projector=1&key=k"))
    }

    @Test
    fun trimsAndAddsHttpWhenTheSchemeIsMissing() {
        assertEquals("http://192.168.1.10:3000/player/?device=k", valid("  \n192.168.1.10:3000/player/?device=k\t ").normalizedUrl)
    }

    @Test
    fun lowerCasesOnlyTheScheme() {
        assertEquals("https://Menu.LAN/player?device=K", valid("HTTPS://Menu.LAN/player?device=K").normalizedUrl)
        assertEquals("https://Menu.LAN/app/", valid("HTTPS://Menu.LAN").normalizedUrl)
    }

    @Test
    fun unknownPathsAreRejected() {
        assertEquals(PairingLink.ERROR_UNKNOWN, error("http://h/menu"))
        assertEquals(PairingLink.ERROR_UNKNOWN, error("http://h/apps/"))
        assertEquals(PairingLink.ERROR_UNKNOWN, error("http://h/players/?device=k"))
        assertEquals(PairingLink.ERROR_UNKNOWN, error("http://h/administrator"))
        assertEquals(PairingLink.ERROR_UNKNOWN, error("http://h/api/info"))
        // The APK download QR is shown next to the pairing code: scanning it must not pair.
        assertEquals(PairingLink.ERROR_UNKNOWN, error("http://192.168.1.50:3000/app.apk"))
    }

    @Test
    fun emptyInputIsRejected() {
        assertEquals(PairingLink.ERROR_EMPTY, error(null))
        assertEquals(PairingLink.ERROR_EMPTY, error(""))
        assertEquals(PairingLink.ERROR_EMPTY, error("   "))
    }

    @Test
    fun onlyHttpAndHttpsAreAccepted() {
        assertEquals(PairingLink.ERROR_SCHEME, error("ftp://h/app/"))
        assertEquals(PairingLink.ERROR_SCHEME, error("file:///sdcard/app"))
        assertEquals(PairingLink.ERROR_SCHEME, error("intent://h/#Intent;end"))
    }

    @Test
    fun hostIsRequired() {
        assertEquals(PairingLink.ERROR_HOST, error("http:///player/?device=k"))
        assertEquals(PairingLink.ERROR_HOST, error("http://:3000/app/"))
    }

    @Test
    fun malformedLinksAreRejected() {
        assertEquals(PairingLink.ERROR_MALFORMED, error("http://h:99999/app/"))
        assertEquals(PairingLink.ERROR_MALFORMED, error("http://h:abc/app/"))
        assertEquals(PairingLink.ERROR_MALFORMED, error("192.168.1.10 3000"))
        assertEquals(PairingLink.ERROR_MALFORMED, error("mailto:owner@example.com"))
        assertEquals(PairingLink.ERROR_MALFORMED, error("http://192.168.1.10:3000@evil.example/app/"))
        assertEquals(PairingLink.ERROR_MALFORMED, error("http://user:pw@h:8080/app/"))
        assertEquals(PairingLink.ERROR_MALFORMED, error("http://[fe80::1/app/"))
    }

    @Test
    fun errorsAreArabic() {
        assertEquals("الرابط غير معروف — استخدم عنوان الخادم أو رمز QR من تطبيق الموظفين", PairingLink.ERROR_UNKNOWN)
    }
}

class ConfigMigrationTest {
    private fun migrate(mode: String?, url: String?) = ConfigMigration.migrate(mode, url)

    @Test
    fun v2ConfigsStayAsTheyAre() {
        assertEquals(ConfigMigration.Saved(AppMode.APP, "http://h:3000/app/"), migrate("APP", "http://h:3000/app/"))
        assertEquals(
            ConfigMigration.Saved(AppMode.PLAYER, "http://h:3000/player/?device=k"),
            migrate("PLAYER", "http://h:3000/player/?device=k"),
        )
    }

    @Test
    fun v1TabletsAndDashboardsBecomeTheStaffAppOfTheSameServer() {
        assertEquals(
            ConfigMigration.Saved(AppMode.APP, "http://192.168.1.10:3000/app/"),
            migrate("TABLET", "http://192.168.1.10:3000/tablet/?table=T01&key=abc"),
        )
        assertEquals(ConfigMigration.Saved(AppMode.APP, "https://menu.lan/app/"), migrate("ADMIN", "https://menu.lan/admin/"))
        // Whatever page was saved, the server is what matters.
        assertEquals(ConfigMigration.Saved(AppMode.APP, "http://h:8080/app/"), migrate("ADMIN", "http://h:8080/odd/path"))
    }

    @Test
    fun v1PlayersMustBePairedAgain() {
        assertNull(migrate("PLAYER", "http://h:3000/player/?projector=1&key=k"))
        assertNull(migrate("PLAYER", "http://h:3000/app/"))
    }

    @Test
    fun nothingUsableMeansNoConfig() {
        assertNull(migrate(null, "http://h/app/"))
        assertNull(migrate("APP", null))
        assertNull(migrate("APP", " "))
        assertNull(migrate("KIOSK", "http://h/app/"))
        assertNull(migrate("TABLET", "not a url"))
        assertNull(migrate("ADMIN", "ftp://h/admin/"))
    }
}
