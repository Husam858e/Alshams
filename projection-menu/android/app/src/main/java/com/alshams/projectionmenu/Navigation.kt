package com.alshams.projectionmenu

/** Pages bundled in the APK are served from this origin by WebViewAssetLoader. */
const val LOCAL_HOST = "appassets.androidplatform.net"
const val LOCAL_ORIGIN = "https://$LOCAL_HOST"

object LocalPages {
    const val SETUP = "$LOCAL_ORIGIN/app/setup.html"
    const val DEMO = "$LOCAL_ORIGIN/demo/index.html"
    private const val OFFLINE_PATH = "/app/offline.html"

    fun offline(target: String) = "$LOCAL_ORIGIN$OFFLINE_PATH?url=${WebUrl.encodeComponent(target)}"

    fun isOffline(url: WebUrl) = url.isLocal && url.path == OFFLINE_PATH
}

/** What the WebView is showing; drives fullscreen, orientation, kiosk and key handling. */
enum class Screen {
    SETUP, DEMO, TABLET, PLAYER, ADMIN;

    /** Customer-facing modes that can be locked with screen pinning and a PIN. */
    val isKiosk: Boolean get() = this == TABLET || this == PLAYER

    /** Fullscreen without system bars, screen kept on. */
    val isImmersive: Boolean get() = isKiosk || this == DEMO

    companion object {
        fun of(mode: AppMode): Screen = when (mode) {
            AppMode.TABLET -> TABLET
            AppMode.PLAYER -> PLAYER
            AppMode.ADMIN -> ADMIN
        }

        /**
         * The screen for a main-frame URL. Remote pages and the offline page
         * belong to the configured mode; other bundled pages are setup or demo.
         */
        fun forUrl(url: String?, configured: AppMode?): Screen {
            val parsed = url?.let(WebUrl::parse)
            val configuredScreen = configured?.let(::of) ?: SETUP
            return when {
                parsed == null || !parsed.isLocal -> configuredScreen
                parsed.path.startsWith("/demo/") -> DEMO
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
     * @param serverUrl the configured pairing link (its origin is trusted).
     */
    fun decide(target: String, fromLocal: Boolean, screen: Screen, serverUrl: String?): NavDecision {
        if (target == "about:blank") return NavDecision.ALLOW
        val url = WebUrl.parse(target) ?: return NavDecision.BLOCK
        if (!url.isHttp) return NavDecision.BLOCK
        if (url.isLocal) return if (fromLocal) NavDecision.ALLOW else NavDecision.BLOCK
        val server = serverUrl?.let(WebUrl::parse)
        if (server != null && server.origin == url.origin) return NavDecision.ALLOW
        return if (screen == Screen.ADMIN || screen == Screen.SETUP) NavDecision.OPEN_EXTERNALLY else NavDecision.BLOCK
    }
}
