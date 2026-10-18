package com.alshams.projectionmenu

/** Pages bundled in the APK are served from this origin by WebViewAssetLoader. */
const val LOCAL_HOST = "appassets.androidplatform.net"
const val LOCAL_ORIGIN = "https://$LOCAL_HOST"

object LocalPages {
    const val SETUP = "$LOCAL_ORIGIN/app/setup.html"

    /** Setup for a cloud projector whose pairing was removed (opens on the pairing code). */
    const val SETUP_UNPAIRED = "$SETUP?unpaired=1"
    const val DEMO = "$LOCAL_ORIGIN/demo/index.html"
    private const val OFFLINE_PATH = "/app/offline.html"
    private const val DEMO_DIR = "/demo/"

    fun offline(target: String) = "$LOCAL_ORIGIN$OFFLINE_PATH?url=${WebUrl.encodeComponent(target)}"

    fun isOffline(url: WebUrl) = url.isLocal && url.path == OFFLINE_PATH

    /** A page of the offline demo (bundled under assets/demo/). */
    fun isDemo(path: String?) = path != null && path.startsWith(DEMO_DIR) && ".." !in path
}

/**
 * Which main-frame loads of bundled pages may be served (any thread). Only the app
 * itself opens them ([expect] right before loadUrl): page scripts could otherwise
 * reach setup without the PIN through POST forms or history.back(), which
 * shouldOverrideUrlLoading never sees. The exceptions: demo pages may open
 * one another, since the demo is only ever reached from setup, and a configured
 * cloud page may load itself again (a reload, see [CloudPages.isHomeReload]).
 */
class LocalLoadGate {
    @Volatile
    private var expected: String? = null

    /** The bundled path native is about to load, or null for a server page. */
    fun expect(path: String?) {
        expected = path
    }

    fun claim(method: String?, path: String?, screen: Screen, query: String? = null, configUrl: String? = null): Boolean {
        if (method != "GET" || path == null) return false
        if (path == expected) {
            expected = null
            return true
        }
        if (CloudPages.isHomeReload(method, path, query, screen, configUrl)) return true
        return screen == Screen.DEMO && LocalPages.isDemo(path)
    }
}

/** What the WebView is showing; drives fullscreen, orientation, kiosk and key handling. */
enum class Screen {
    SETUP, DEMO, APP, PLAYER;

    /** The configured modes (server or cloud): may be pinned (kiosk) and guard settings with the PIN. */
    val isLockable: Boolean get() = this == APP || this == PLAYER

    /** Fullscreen without system bars, screen kept on. */
    val isImmersive: Boolean get() = this == PLAYER || this == DEMO

    /** Pages people work in: downloads and links to other sites (opened outside). */
    val isInteractive: Boolean get() = this == APP || this == SETUP

    /** `<input type="file">` works everywhere but on a projector (the demo uploads too). */
    val allowsUploads: Boolean get() = this != PLAYER

    companion object {
        fun of(mode: AppMode): Screen = when (mode) {
            AppMode.APP -> APP
            AppMode.PLAYER -> PLAYER
        }

        /**
         * The screen for a main-frame URL. Remote pages and the offline page
         * belong to the configured mode; the cloud pages are the staff app or a
         * player; other bundled pages are setup or demo.
         */
        fun forUrl(url: String?, configured: AppMode?): Screen {
            val parsed = url?.let(WebUrl::parse)
            val configuredScreen = configured?.let(::of) ?: SETUP
            val cloud = CloudPages.modeOf(parsed)
            return when {
                parsed == null || !parsed.isLocal -> configuredScreen
                cloud != null -> of(cloud)
                LocalPages.isDemo(parsed.path) -> DEMO
                LocalPages.isOffline(parsed) -> configuredScreen
                else -> SETUP
            }
        }
    }
}

enum class NavDecision { ALLOW, OPEN_EXTERNALLY, BLOCK }

/** Which page-initiated main-frame navigations the WebView may follow. */
object NavigationPolicy {
    /**
     * @param target URL the page wants to open.
     * @param fromLocal whether the current page is a bundled one. Remote pages may
     *   never open bundled pages: that would bypass the settings PIN.
     * @param serverUrl the configured page (its origin is trusted).
     */
    fun decide(target: String, fromLocal: Boolean, screen: Screen, serverUrl: String?): NavDecision {
        if (target == "about:blank") return NavDecision.ALLOW
        val url = WebUrl.parse(target) ?: return NavDecision.BLOCK
        if (!url.isHttp) return NavDecision.BLOCK
        if (url.isLocal) return if (fromLocal) NavDecision.ALLOW else NavDecision.BLOCK
        val server = serverUrl?.let(WebUrl::parse)
        if (server != null && server.origin == url.origin) return NavDecision.ALLOW
        // The staff app may link elsewhere (help, a supplier); a projector never leaves its menu.
        return if (screen.isInteractive) NavDecision.OPEN_EXTERNALLY else NavDecision.BLOCK
    }
}
