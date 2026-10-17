package com.alshams.projectionmenu

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NavigationTest {
    private val app = "http://192.168.1.10:3000/app/"
    private val player = "http://192.168.1.10:3000/player/?device=k"

    private fun decide(target: String, screen: Screen, fromLocal: Boolean = false, serverUrl: String? = app) =
        NavigationPolicy.decide(target, fromLocal, screen, serverUrl)

    @Test
    fun allowsTheConfiguredServerOrigin() {
        assertEquals(NavDecision.ALLOW, decide("http://192.168.1.10:3000/app/#/tables/7", Screen.APP))
        assertEquals(NavDecision.ALLOW, decide("http://192.168.1.10:3000/player/?preview=7", Screen.APP))
        assertEquals(NavDecision.ALLOW, decide("http://192.168.1.10:3000/player/?device=k", Screen.PLAYER, serverUrl = player))
        // Offline page retrying its target.
        assertEquals(NavDecision.ALLOW, decide(player, Screen.PLAYER, fromLocal = true, serverUrl = player))
    }

    @Test
    fun otherSitesOpenExternallyFromTheStaffAppOnly() {
        assertEquals(NavDecision.OPEN_EXTERNALLY, decide("https://example.com/", Screen.APP))
        assertEquals(NavDecision.OPEN_EXTERNALLY, decide("http://192.168.1.10:3001/", Screen.APP))
        assertEquals(NavDecision.OPEN_EXTERNALLY, decide("https://example.com/", Screen.SETUP, fromLocal = true))
        assertEquals(NavDecision.BLOCK, decide("https://example.com/", Screen.PLAYER, serverUrl = player))
        assertEquals(NavDecision.BLOCK, decide("http://192.168.1.10:3001/", Screen.PLAYER, serverUrl = player))
        assertEquals(NavDecision.BLOCK, decide("https://example.com/", Screen.DEMO, fromLocal = true))
    }

    @Test
    fun remotePagesCannotOpenBundledPages() {
        assertEquals(NavDecision.BLOCK, decide(LocalPages.SETUP, Screen.APP, fromLocal = false))
        assertEquals(NavDecision.BLOCK, decide(LocalPages.SETUP, Screen.PLAYER, fromLocal = false, serverUrl = player))
        assertEquals(NavDecision.ALLOW, decide(LocalPages.SETUP, Screen.DEMO, fromLocal = true))
        assertEquals(NavDecision.ALLOW, decide(LocalPages.DEMO, Screen.SETUP, fromLocal = true))
        assertEquals(NavDecision.ALLOW, decide("$LOCAL_ORIGIN/app/index.html", Screen.DEMO, fromLocal = true))
    }

    @Test
    fun blocksNonWebSchemes() {
        assertEquals(NavDecision.BLOCK, decide("intent://scan/#Intent;scheme=zxing;end", Screen.APP))
        assertEquals(NavDecision.BLOCK, decide("tel:123", Screen.APP))
        assertEquals(NavDecision.BLOCK, decide("javascript:alert(1)", Screen.APP))
        assertEquals(NavDecision.BLOCK, decide("file:///sdcard/x.html", Screen.SETUP, fromLocal = true))
        assertEquals(NavDecision.ALLOW, decide("about:blank", Screen.PLAYER))
    }

    @Test
    fun withoutAConfigNothingRemoteIsTrusted() {
        assertEquals(NavDecision.OPEN_EXTERNALLY, decide(app, Screen.SETUP, fromLocal = true, serverUrl = null))
    }

    @Test
    fun screenFollowsTheUrl() {
        assertEquals(Screen.SETUP, Screen.forUrl(LocalPages.SETUP, AppMode.APP))
        assertEquals(Screen.DEMO, Screen.forUrl(LocalPages.DEMO, AppMode.PLAYER))
        assertEquals(Screen.DEMO, Screen.forUrl("$LOCAL_ORIGIN/demo/player.html", null))
        assertEquals(Screen.PLAYER, Screen.forUrl(LocalPages.offline(player), AppMode.PLAYER))
        assertEquals(Screen.APP, Screen.forUrl(LocalPages.offline(app), AppMode.APP))
        assertEquals(Screen.SETUP, Screen.forUrl(LocalPages.offline(app), null))
        assertEquals(Screen.APP, Screen.forUrl(app, AppMode.APP))
        assertEquals(Screen.PLAYER, Screen.forUrl(player, AppMode.PLAYER))
        assertEquals(Screen.SETUP, Screen.forUrl(app, null))
        assertEquals(Screen.PLAYER, Screen.forUrl("about:blank", AppMode.PLAYER))
    }

    @Test
    fun screenTraits() {
        assertTrue(Screen.APP.isLockable && Screen.PLAYER.isLockable)
        assertFalse(Screen.DEMO.isLockable || Screen.SETUP.isLockable)
        assertTrue(Screen.PLAYER.isImmersive && Screen.DEMO.isImmersive)
        assertFalse(Screen.APP.isImmersive || Screen.SETUP.isImmersive)
        assertTrue(Screen.APP.isInteractive && Screen.SETUP.isInteractive)
        assertFalse(Screen.PLAYER.isInteractive || Screen.DEMO.isInteractive)
        assertTrue(Screen.APP.allowsUploads && Screen.DEMO.allowsUploads && Screen.SETUP.allowsUploads)
        assertFalse(Screen.PLAYER.allowsUploads)
        assertEquals(Screen.APP, Screen.of(AppMode.APP))
        assertEquals(Screen.PLAYER, Screen.of(AppMode.PLAYER))
    }

    @Test
    fun offlineUrlCarriesTheEncodedTarget() {
        assertEquals(
            "https://appassets.androidplatform.net/app/offline.html?url=" +
                "http%3A%2F%2F192.168.1.10%3A3000%2Fplayer%2F%3Fdevice%3Dk",
            LocalPages.offline(player),
        )
        assertEquals(player, WebUrl.parse(LocalPages.offline(player))!!.queryParam("url"))
    }
}
