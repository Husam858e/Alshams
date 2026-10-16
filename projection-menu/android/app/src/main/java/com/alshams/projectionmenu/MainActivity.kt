package com.alshams.projectionmenu

import android.annotation.SuppressLint
import android.app.ActivityManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.WindowManager
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.SystemBarStyle
import androidx.activity.addCallback
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.net.toUri
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/**
 * Hosts the single WebView and applies the behaviour of each mode:
 * TABLET / PLAYER (kiosk, fullscreen), ADMIN (normal browser), DEMO (bundled,
 * offline) and SETUP (bundled settings page talking to [AppBridge]).
 */
class MainActivity : AppCompatActivity() {
    internal val store by lazy { ConfigStore(this) }
    private val local by lazy { LocalContent(this) }
    private val bridge = AppBridge(this)
    private val pinDialog = PinDialog(this) { store.checkPin(it) }
    internal val fileChooser = FileChooser(this)
    internal val qrScanner = QrScanner(this)

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var container: FrameLayout
    private var webView: WebView? = null

    /** What the WebView shows; follows every main-frame navigation. */
    internal var screen = Screen.SETUP
        private set

    /**
     * Whether the latest main-frame request was for a bundled page, for the request
     * filter on WebView's background thread (UI-thread code uses WebView.getUrl()).
     */
    @Volatile
    internal var mainFrameIsLocal = true

    private var lastMainFrameUrl: String? = null
    private var lockTaskPending = false
    private var awaitingHomePicker = false
    private var rendererCrashAt = 0L
    private var rendererRetryMs = 0L
    private val cornerTaps = MultiPressDetector(count = 5, windowMs = 3_000)
    private val backPresses = MultiPressDetector(count = 3, windowMs = 2_000)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Draw behind transparent, light-on-dark system bars; insets become padding below.
        enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT))
        container = FrameLayout(this)
        setContentView(container)
        ViewCompat.setOnApplyWindowInsetsListener(container) { view, insets ->
            // In fullscreen screens a swipe shows the bars transiently over the page;
            // only the display cutout and the keyboard push the content then.
            val bars = if (screen.isImmersive) 0 else WindowInsetsCompat.Type.systemBars()
            val inset = insets.getInsets(bars or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            view.setPadding(inset.left, inset.top, inset.right, inset.bottom)
            WindowInsetsCompat.CONSUMED
        }
        onBackPressedDispatcher.addCallback(this) { onBack() }

        if (!createWebView()) {
            showWebViewUpdateDialog()
            return
        }
        navigate(store.load()?.url ?: LocalPages.SETUP)
    }

    override fun onResume() {
        super.onResume()
        webView?.onResume()
        awaitingHomePicker = false
        applySystemBars()
        if (lockTaskPending) {
            lockTaskPending = false
            if (wantsLockTask()) startLockTaskSafely()
        }
    }

    override fun onPause() {
        webView?.onPause()
        super.onPause()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // Dialogs and the keyboard bring the system bars back; hide them again.
        if (hasFocus) applySystemBars()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        pinDialog.dismiss()
        fileChooser.cancel()
        webView?.let(::destroyWebView)
        super.onDestroy()
    }

    // ── WebView ────────────────────────────────────────────────────

    // JavaScript is the point of this app. Remote pages get no bridge, no file
    // access, and can only navigate within the configured server (AppWebViewClient).
    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(): Boolean {
        val view = try {
            WebView(this)
        } catch (e: RuntimeException) {
            Log.e(TAG, "WebView unavailable", e) // provider missing or being updated
            return false
        }
        // The bridge needs addWebMessageListener (WebView 83+); a WebView without it is
        // far too old for the server pages too, so ask for an update instead of half-working.
        // Only bundled pages (LOCAL_ORIGIN) get window.AndroidApp.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(view, "AndroidApp", setOf(LOCAL_ORIGIN), bridge)
        } else {
            view.destroy()
            return false
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        view.setBackgroundColor(backgroundFor(screen))
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
            textZoom = 100
            userAgentString = "$userAgentString ProjectionMenuApp/${BuildConfig.VERSION_NAME}"
        }
        view.webViewClient = AppWebViewClient(this, local)
        view.webChromeClient = AppChromeClient(this)
        container.addView(view, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        view.requestFocus()
        webView = view
        return true
    }

    private fun destroyWebView(view: WebView) {
        container.removeView(view)
        view.destroy()
        if (webView === view) webView = null
    }

    internal fun navigate(url: String) {
        val view = webView ?: return
        applyScreen(Screen.forUrl(url, store.load()?.mode))
        view.loadUrl(url)
    }

    /** Navigates after the current callback (e.g. once a bridge reply is posted). */
    internal fun navigateSoon(url: String) {
        handler.post { navigate(url) }
    }

    internal fun onPageStarted(url: String) {
        lastMainFrameUrl = url
        applyScreen(Screen.forUrl(url, store.load()?.mode))
    }

    /** Network error or 5xx on the server page: show the bundled retry page. */
    internal fun onMainFrameFailed(target: String, reason: String) {
        val url = WebUrl.parse(target)
        if (url == null || !url.isHttp || url.isLocal) return
        Log.w(TAG, "Main frame failed ($reason): $target")
        navigateSoon(LocalPages.offline(target))
    }

    internal fun recoverFromRendererCrash(view: WebView) {
        val url = lastMainFrameUrl ?: store.load()?.url ?: LocalPages.SETUP
        fileChooser.cancel()
        destroyWebView(view)
        // Back off when a page keeps killing the renderer (e.g. out of memory).
        val now = SystemClock.elapsedRealtime()
        rendererRetryMs = if (now - rendererCrashAt < 60_000) (rendererRetryMs * 2).coerceIn(1_000, 30_000) else 0
        rendererCrashAt = now
        handler.postDelayed({
            if (webView == null && createWebView()) navigate(url)
        }, rendererRetryMs)
    }

    internal fun openExternally(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, url.toUri()).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (e: ActivityNotFoundException) {
            Log.w(TAG, "No app to open $url", e)
        }
    }

    // ── Modes ──────────────────────────────────────────────────────

    // A projector player must stay landscape whatever the box's sensor says.
    @SuppressLint("SourceLockedOrientationActivity")
    private fun applyScreen(next: Screen) {
        if (next == screen) return
        screen = next
        requestedOrientation = if (next == Screen.PLAYER) {
            ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        } else {
            ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
        if (next.isImmersive) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        webView?.setBackgroundColor(backgroundFor(next))
        applySystemBars()
        ViewCompat.requestApplyInsets(container)
        cornerTaps.reset()
        backPresses.reset()
        if (wantsLockTask()) requestLockTask() else stopLockTaskSafely()
    }

    private fun backgroundFor(screen: Screen) = if (screen == Screen.PLAYER) Color.BLACK else getColor(R.color.navy)

    private fun applySystemBars() {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        if (screen.isImmersive) {
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    // ── Kiosk (screen pinning) ─────────────────────────────────────

    private fun wantsLockTask() = screen.isKiosk && store.load()?.kiosk == true

    private fun isInLockTask() =
        getSystemService(ActivityManager::class.java)?.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE

    /** startLockTask needs a resumed activity; otherwise wait for onResume. */
    private fun requestLockTask() {
        if (isInLockTask()) return
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) && !awaitingHomePicker) {
            startLockTaskSafely()
        } else {
            lockTaskPending = true
        }
    }

    // Without device-owner provisioning this is "screen pinning": Android asks the
    // user to confirm once, then HOME/RECENTS are blocked until stopLockTask().
    private fun startLockTaskSafely() {
        if (isInLockTask()) return
        try {
            startLockTask()
        } catch (e: RuntimeException) {
            Log.w(TAG, "Screen pinning unavailable", e) // some TV builds lack it
        }
    }

    private fun stopLockTaskSafely() {
        lockTaskPending = false
        if (!isInLockTask()) return
        try {
            stopLockTask()
        } catch (e: RuntimeException) {
            Log.w(TAG, "stopLockTask failed", e)
        }
    }

    // ── Settings ───────────────────────────────────────────────────

    /** Hidden gesture, MENU key, triple BACK or the bridge: go to setup.html (PIN first in kiosk modes). */
    internal fun openSettings() {
        if (screen == Screen.SETUP) return
        if (screen.isKiosk && store.load()?.hasPin == true) pinDialog.ask(::showSetup) else showSetup()
    }

    private fun showSetup() {
        stopLockTaskSafely()
        navigate(LocalPages.SETUP)
    }

    internal fun onConfigSaved(url: String, launcher: Boolean) {
        if (launcher && !isDefaultLauncher()) {
            // Let the owner pick this app as the home screen; pinning waits for our return.
            awaitingHomePicker = DeviceInfo.openHomeSettings(this)
        }
        navigateSoon(url)
    }

    // Our own HOME alias is always visible to us; any other answer means "not us".
    @SuppressLint("QueryPermissionsNeeded")
    private fun isDefaultLauncher(): Boolean {
        val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        return packageManager.resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName == packageName
    }

    private fun onBack() {
        when (screen) {
            // Customers must not leave: single presses are swallowed, three open settings.
            Screen.TABLET, Screen.PLAYER -> if (backPresses.press(SystemClock.uptimeMillis())) openSettings()
            Screen.ADMIN -> {
                val view = webView
                if (view != null && view.canGoBack()) view.goBack() else openSettings()
            }
            Screen.DEMO -> openSettings()
            // Leaving setup returns to the configured page (or closes a fresh install).
            Screen.SETUP -> {
                val config = store.load()
                if (config != null) navigate(config.url) else finish()
            }
        }
    }

    // MENU / SETTINGS keys (TV remotes) open settings before the WebView sees them.
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_MENU || event.keyCode == KeyEvent.KEYCODE_SETTINGS) {
            if (event.action == KeyEvent.ACTION_UP && !event.isCanceled) openSettings()
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    // Watches for 5 quick taps in the WebView's top-left corner without consuming
    // anything, so the page still receives every touch.
    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN) countCornerTap(event)
        return super.dispatchTouchEvent(event)
    }

    private fun countCornerTap(event: MotionEvent) {
        val view = webView ?: return
        val origin = IntArray(2).also(view::getLocationInWindow)
        val inCorner = SettingsCorner.contains(
            event.x - origin[0],
            event.y - origin[1],
            view.width,
            view.height,
            resources.displayMetrics.density,
        )
        if (inCorner && cornerTaps.press(event.eventTime)) openSettings()
    }

    private fun showWebViewUpdateDialog() {
        AlertDialog.Builder(this)
            .setTitle(R.string.webview_update_title)
            .setMessage(R.string.webview_update_message)
            .setCancelable(false)
            .setPositiveButton(R.string.webview_update_action) { _, _ ->
                DeviceInfo.openWebViewStorePage(this)
                finish()
            }
            .setNegativeButton(R.string.close) { _, _ -> finish() }
            .show()
    }

    private companion object {
        const val TAG = "MainActivity"
    }
}
