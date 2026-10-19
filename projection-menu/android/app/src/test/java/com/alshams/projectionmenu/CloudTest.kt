package com.alshams.projectionmenu

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CloudTest {
    private val app = "$LOCAL_ORIGIN/cloud/app.html"
    private val player = "$LOCAL_ORIGIN/cloud/player.html?device=p4"

    private fun parse(url: String, debug: Boolean = false) = CloudPages.parse(url, allowEmulators = debug)

    @Test
    fun cloudPagesAreValidHomes() {
        assertEquals(PairingLink.Valid(AppMode.APP, app), parse(app))
        assertEquals(PairingLink.Valid(AppMode.PLAYER, player), parse(player))
        // Only the parameters the pages understand are kept, re-encoded.
        assertEquals(PairingLink.Valid(AppMode.APP, app), parse("$app?x=1#/floor"))
        assertEquals(
            PairingLink.Valid(AppMode.PLAYER, "$LOCAL_ORIGIN/cloud/player.html?device=%D8%B7%207"),
            parse("$LOCAL_ORIGIN/cloud/player.html?device=%D8%B7%207&other=y"),
        )
    }

    @Test
    fun otherUrlsAreNotCloudPages() {
        assertNull(parse("http://192.168.1.10:3000/app/"))
        assertNull(parse("$LOCAL_ORIGIN/app/setup.html"))
        assertNull(parse("$LOCAL_ORIGIN/cloud/backend/index.js"))
        assertNull(parse("$LOCAL_ORIGIN/cloud/../app/setup.html"))
        assertNull(parse("http://appassets.androidplatform.net/cloud/app.html")) // not the local origin
        assertNull(parse("https://user@appassets.androidplatform.net/cloud/app.html"))
        assertNull(parse(""))
        assertNull(parse("not a url"))
    }

    @Test
    fun playerNeedsADeviceKey() {
        assertEquals(PairingLink.Invalid(CloudPages.ERROR_PLAYER), parse("$LOCAL_ORIGIN/cloud/player.html"))
        assertEquals(PairingLink.Invalid(CloudPages.ERROR_PLAYER), parse("$LOCAL_ORIGIN/cloud/player.html?device=%20"))
        assertEquals(PairingLink.Invalid(CloudPages.ERROR_PLAYER), parse("$LOCAL_ORIGIN/cloud/player.html?device=" + "k".repeat(65)))
    }

    @Test
    fun emulatorsOnlyInDebugBuilds() {
        assertEquals(PairingLink.Invalid(CloudPages.ERROR_EMULATORS), parse("$app?emulators=10.0.2.2"))
        assertEquals(PairingLink.Valid(AppMode.APP, "$app?emulators=10.0.2.2"), parse("$app?emulators=10.0.2.2", debug = true))
        assertEquals(
            PairingLink.Valid(AppMode.PLAYER, "$player&emulators=localhost"),
            parse("$LOCAL_ORIGIN/cloud/player.html?emulators=localhost&device=p4", debug = true),
        )
        assertEquals(PairingLink.Invalid(CloudPages.ERROR_EMULATORS), parse("$app?emulators=evil.example%2Fx", debug = true))
        assertTrue(CloudPages.usesEmulators("$app?emulators=10.0.2.2"))
        assertFalse(CloudPages.usesEmulators(app))
        assertFalse(CloudPages.usesEmulators("http://192.168.1.10:3000/app/?emulators=x"))
        assertFalse(CloudPages.usesEmulators(null))
    }

    @Test
    fun cloudPagesSetTheScreen() {
        assertEquals(Screen.APP, Screen.forUrl("$app#/floor", null))
        assertEquals(Screen.PLAYER, Screen.forUrl(player, AppMode.APP))
        assertEquals(Screen.SETUP, Screen.forUrl("$LOCAL_ORIGIN/cloud/other.html", AppMode.APP))
        assertEquals(AppMode.APP, CloudPages.modeOf(WebUrl.parse(app)))
        assertNull(CloudPages.modeOf(WebUrl.parse("http://192.168.1.10:3000/cloud/app.html")))
    }

    @Test
    fun aCloudPageMayReloadItself() {
        val gate = LocalLoadGate()
        assertTrue(gate.claim("GET", "/cloud/player.html", Screen.PLAYER, "device=p4", player))
        assertTrue(gate.claim("GET", "/cloud/app.html", Screen.APP, null, app))
        // Not another query, page, method or screen.
        assertFalse(gate.claim("GET", "/cloud/player.html", Screen.PLAYER, "device=p4&emulators=evil", player))
        assertFalse(gate.claim("GET", "/cloud/player.html", Screen.PLAYER, "device=p5", player))
        assertFalse(gate.claim("GET", "/app/setup.html", Screen.APP, null, app))
        assertFalse(gate.claim("POST", "/cloud/app.html", Screen.APP, null, app))
        assertFalse(gate.claim("GET", "/cloud/app.html", Screen.SETUP, null, app))
        // A server configuration never lets bundled pages through.
        assertFalse(gate.claim("GET", "/cloud/app.html", Screen.APP, null, "http://192.168.1.10:3000/app/"))
    }

    @Test
    fun cloudConfigsSurviveMigration() {
        assertEquals(ConfigMigration.Saved(AppMode.APP, app), ConfigMigration.migrate("APP", app))
        assertEquals(ConfigMigration.Saved(AppMode.PLAYER, player), ConfigMigration.migrate("PLAYER", player))
        assertEquals(ConfigMigration.Saved(AppMode.APP, "$app?emulators=10.0.2.2"), ConfigMigration.migrate("APP", "$app?emulators=10.0.2.2"))
        // A page saved under the wrong mode, or a player page without its key, starts over.
        assertNull(ConfigMigration.migrate("PLAYER", app))
        assertNull(ConfigMigration.migrate("APP", player))
        assertNull(ConfigMigration.migrate("PLAYER", "$LOCAL_ORIGIN/cloud/player.html"))
    }

    @Test
    fun firebaseProjectKeepsKnownKeys() {
        val pasted = mapOf(
            "apiKey" to " AIzaSyD-test ",
            "authDomain" to "alshams.firebaseapp.com",
            "projectId" to "alshams-menu",
            "storageBucket" to "alshams-menu.firebasestorage.app",
            "messagingSenderId" to 123456789012L,
            "appId" to "1:123456789012:web:abc",
            "extra" to mapOf("nested" to true),
        )
        assertEquals(
            mapOf(
                "apiKey" to "AIzaSyD-test",
                "authDomain" to "alshams.firebaseapp.com",
                "projectId" to "alshams-menu",
                "storageBucket" to "alshams-menu.firebasestorage.app",
                "messagingSenderId" to "123456789012",
                "appId" to "1:123456789012:web:abc",
            ),
            FirebaseProject.sanitize(pasted),
        )
    }

    @Test
    fun firebaseProjectRefusesIncompleteOrOddConfigs() {
        val good = mapOf("apiKey" to "k", "projectId" to "demo-pm", "appId" to "1:2:web:3", "storageBucket" to "b")
        assertEquals(good, FirebaseProject.sanitize(good))
        for (key in FirebaseProject.REQUIRED) assertNull(key, FirebaseProject.sanitize(good - key))
        assertNull(FirebaseProject.sanitize(good + ("apiKey" to "")))
        assertNull(FirebaseProject.sanitize(good + ("apiKey" to "a b")))
        assertNull(FirebaseProject.sanitize(good + ("apiKey" to listOf("k"))))
        assertNull(FirebaseProject.sanitize(good + ("projectId" to "Demo_PM")))
        assertNull(FirebaseProject.sanitize(good + ("appId" to "x".repeat(301))))
    }

    @Test
    fun firebaseProjectKeepsTheMediaMode() {
        val good = mapOf("apiKey" to "k", "projectId" to "demo-pm", "appId" to "1:2:web:3", "storageBucket" to "b")
        // Firestore is the default: the key is left out.
        assertEquals(good, FirebaseProject.sanitize(good + ("media" to "firestore")))
        assertEquals(good + ("media" to "storage"), FirebaseProject.sanitize(good + ("media" to " storage ")))
        assertNull(FirebaseProject.sanitize(good + ("media" to "s3")))
        assertNull(FirebaseProject.sanitize(good + ("media" to 1)))
    }
}
