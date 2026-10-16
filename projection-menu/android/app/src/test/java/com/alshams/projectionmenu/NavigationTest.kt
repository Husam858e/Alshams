package com.alshams.projectionmenu

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NavigationTest {
    private val server = "http://192.168.1.10:3000/tablet/?table=T01&key=k"

    private fun decide(target: String, screen: Screen, fromLocal: Boolean = false, serverUrl: String? = server) =
        NavigationPolicy.decide(target, fromLocal, screen, serverUrl)

    @Test
    fun allowsTheConfiguredServerOrigin() {
        assertEquals(NavDecision.ALLOW, decide("http://192.168.1.10:3000/player/?projector=1&key=k", Screen.TABLET))
        assertEquals(NavDecision.ALLOW, decide("http://192.168.1.10:3000/admin/#orders", Screen.ADMIN))
        // Offline page retrying its target.
        assertEquals(NavDecision.ALLOW, decide(server, Screen.TABLET, fromLocal = true))
    }

    @Test
    fun otherSitesOpenExternallyFromTheDashboardOnly() {
        assertEquals(NavDecision.OPEN_EXTERNALLY, decide("https://example.com/", Screen.ADMIN))
        assertEquals(NavDecision.OPEN_EXTERNALLY, decide("https://example.com/", Screen.SETUP, fromLocal = true))
        assertEquals(NavDecision.BLOCK, decide("https://example.com/", Screen.TABLET))
        assertEquals(NavDecision.BLOCK, decide("https://example.com/", Screen.PLAYER))
        assertEquals(NavDecision.BLOCK, decide("https://example.com/", Screen.DEMO, fromLocal = true))
        assertEquals(NavDecision.BLOCK, decide("http://192.168.1.10:3001/", Screen.TABLET))
        assertEquals(NavDecision.OPEN_EXTERNALLY, decide("http://192.168.1.10:3001/", Screen.ADMIN))
    }

    @Test
    fun remotePagesCannotOpenBundledPages() {
        assertEquals(NavDecision.BLOCK, decide(LocalPages.SETUP, Screen.TABLET, fromLocal = false))
        assertEquals(NavDecision.ALLOW, decide(LocalPages.SETUP, Screen.DEMO, fromLocal = true))
        assertEquals(NavDecision.ALLOW, decide(LocalPages.DEMO, Screen.SETUP, fromLocal = true))
    }

    @Test
    fun blocksNonWebSchemes() {
        assertEquals(NavDecision.BLOCK, decide("intent://scan/#Intent;scheme=zxing;end", Screen.ADMIN))
        assertEquals(NavDecision.BLOCK, decide("tel:123", Screen.ADMIN))
        assertEquals(NavDecision.BLOCK, decide("file:///sdcard/x.html", Screen.SETUP, fromLocal = true))
        assertEquals(NavDecision.ALLOW, decide("about:blank", Screen.TABLET))
    }

    @Test
    fun withoutAConfigNothingRemoteIsTrusted() {
        assertEquals(NavDecision.OPEN_EXTERNALLY, decide(server, Screen.SETUP, fromLocal = true, serverUrl = null))
    }

    @Test
    fun screenFollowsTheUrl() {
        assertEquals(Screen.SETUP, Screen.forUrl(LocalPages.SETUP, AppMode.TABLET))
        assertEquals(Screen.DEMO, Screen.forUrl(LocalPages.DEMO, AppMode.TABLET))
        assertEquals(Screen.DEMO, Screen.forUrl("$LOCAL_ORIGIN/demo/tablet.html", null))
        assertEquals(Screen.PLAYER, Screen.forUrl(LocalPages.offline(server), AppMode.PLAYER))
        assertEquals(Screen.SETUP, Screen.forUrl(LocalPages.offline(server), null))
        assertEquals(Screen.TABLET, Screen.forUrl(server, AppMode.TABLET))
        assertEquals(Screen.ADMIN, Screen.forUrl("http://h/admin/", AppMode.ADMIN))
        assertEquals(Screen.SETUP, Screen.forUrl("http://h/admin/", null))
        assertEquals(Screen.TABLET, Screen.forUrl("about:blank", AppMode.TABLET))
    }

    @Test
    fun screenTraits() {
        assertTrue(Screen.TABLET.isKiosk && Screen.PLAYER.isKiosk)
        assertFalse(Screen.DEMO.isKiosk || Screen.ADMIN.isKiosk || Screen.SETUP.isKiosk)
        assertTrue(Screen.DEMO.isImmersive && Screen.TABLET.isImmersive && Screen.PLAYER.isImmersive)
        assertFalse(Screen.ADMIN.isImmersive || Screen.SETUP.isImmersive)
    }

    @Test
    fun offlineUrlCarriesTheEncodedTarget() {
        assertEquals(
            "https://appassets.androidplatform.net/app/offline.html?url=" +
                "http%3A%2F%2F192.168.1.10%3A3000%2Ftablet%2F%3Ftable%3DT01%26key%3Dk",
            LocalPages.offline(server),
        )
        assertEquals(server, WebUrl.parse(LocalPages.offline(server))!!.queryParam("url"))
    }
}
