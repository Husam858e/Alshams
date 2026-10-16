package com.alshams.projectionmenu

import android.graphics.Bitmap
import android.net.Uri
import android.util.Log
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.annotation.RequiresApi
import androidx.core.graphics.createBitmap

/** Bundled pages, the navigation guard, the offline fallback and renderer-crash recovery. */
class AppWebViewClient(private val activity: MainActivity, private val local: LocalContent) : WebViewClient() {
    private var lastCommitWasLocal = true

    // Runs on a WebView background thread, for every request including main frames.
    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
        val isLocal = request.url.scheme == "https" && request.url.host == LOCAL_HOST
        if (request.isForMainFrame) {
            // shouldOverrideUrlLoading never sees POSTs or back/forward navigations,
            // so the same boundaries are enforced here as well.
            if (isLocal && !activity.claimLocalLoad(request.method, request.url.path)) return refuse(request)
            if (!isLocal && request.method != "GET" && !mayOpen(request.url.toString())) return refuse(request)
            activity.mainFrameIsLocal = isLocal
        }
        if (!isLocal) return null
        // Remote pages must not embed bundled pages (or the bridge they carry).
        if (!request.isForMainFrame && !activity.mainFrameIsLocal) return LocalContent.forbidden()
        return local.serve(request)
    }

    private fun mayOpen(url: String) =
        NavigationPolicy.decide(url, false, activity.screen, activity.store.load()?.url) == NavDecision.ALLOW

    // A 204 is never committed: the current page simply stays.
    private fun refuse(request: WebResourceRequest): WebResourceResponse {
        Log.i(TAG, "Refused main-frame ${request.method} ${request.url}")
        return LocalContent.refused()
    }

    // UI thread, after each main-frame commit. Once a server page replaces a bundled
    // one, drop the history: back/forward must not return to setup or to a server
    // that was configured before.
    override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
        val isLocal = WebUrl.parse(url)?.isLocal == true
        if (!isLocal && lastCommitWasLocal) view.clearHistory()
        lastCommitWasLocal = isLocal
    }

    // Only called for page-initiated navigations; the app's own loadUrl calls skip it.
    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        if (!request.isForMainFrame) return false // WebView never hands sub-frames to other apps
        val url = request.url.toString()
        val fromLocal = view.url?.let(WebUrl::parse)?.isLocal == true // the page asking to navigate
        return when (NavigationPolicy.decide(url, fromLocal, activity.screen, activity.store.load()?.url)) {
            NavDecision.ALLOW -> false
            NavDecision.OPEN_EXTERNALLY -> {
                activity.openExternally(url)
                true
            }
            NavDecision.BLOCK -> {
                Log.i(TAG, "Blocked navigation to $url")
                true
            }
        }
    }

    override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
        activity.onPageStarted(url)
    }

    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        val description = error.description?.toString().orEmpty()
        // ERR_ABORTED is a cancelled navigation (e.g. replaced by a newer one), not an outage.
        if (!request.isForMainFrame || description.contains("ERR_ABORTED")) return
        activity.onMainFrameFailed(request.url.toString(), "${error.errorCode} $description")
    }

    override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
        if (request.isForMainFrame && response.statusCode >= 500) {
            activity.onMainFrameFailed(request.url.toString(), "HTTP ${response.statusCode}")
        }
    }

    // A crashed or OOM-killed renderer would otherwise kill the whole app (API 26+).
    // Kiosks run 24/7, so recreate the WebView and reload instead.
    @RequiresApi(26)
    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        Log.e(TAG, "Renderer gone (crashed: ${detail.didCrash()})")
        activity.recoverFromRendererCrash(view)
        return true
    }

    private companion object {
        const val TAG = "AppWebViewClient"
    }
}

class AppChromeClient(private val activity: MainActivity) : WebChromeClient() {
    private var transparentPoster: Bitmap? = null

    override fun onShowFileChooser(
        webView: WebView,
        filePathCallback: ValueCallback<Array<Uri>>,
        fileChooserParams: FileChooserParams,
    ): Boolean {
        // Uploads belong to the dashboard; fullscreen customer screens never leave the app.
        if (activity.screen.isImmersive) return false
        return activity.fileChooser.show(filePathCallback, fileChooserParams)
    }

    // Without a poster WebView paints a grey "play" placeholder before a video
    // starts, which would be projected onto the table: use a transparent pixel.
    override fun getDefaultVideoPoster(): Bitmap =
        transparentPoster ?: createBitmap(1, 1).also { transparentPoster = it }
}
