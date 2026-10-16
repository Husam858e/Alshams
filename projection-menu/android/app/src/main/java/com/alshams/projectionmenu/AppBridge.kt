package com.alshams.projectionmenu

import android.annotation.SuppressLint
import android.net.Uri
import android.util.Log
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import org.json.JSONException
import org.json.JSONObject

/**
 * Native side of `window.AndroidApp` for the bundled pages (setup, offline, demo).
 * It is installed with addWebMessageListener for the local origin only, so pages
 * served by the restaurant server never get it. Every request carries an "id"
 * that the reply echoes; native never sends unsolicited messages.
 */
class AppBridge(private val activity: MainActivity) : WebViewCompat.WebMessageListener {

    override fun onPostMessage(
        view: WebView,
        message: WebMessageCompat,
        sourceOrigin: Uri,
        isMainFrame: Boolean,
        replyProxy: JavaScriptReplyProxy,
    ) {
        // The origin rule already limits this to local frames. Only the bundled top-level
        // pages use the bridge, so a local frame (e.g. inside a remote page, which could
        // reach settings without the PIN) never does. WebView.getUrl() is no help here:
        // it already returns the URL of a load that has not committed yet.
        if (!isMainFrame || sourceOrigin.scheme != "https" || sourceOrigin.host != LOCAL_HOST) return
        val request = try {
            JSONObject(message.data ?: return)
        } catch (e: JSONException) {
            Log.w(TAG, "Ignoring malformed bridge message", e)
            return
        }
        val reply = BridgeReply(request.text("id"), replyProxy)
        when (request.text("type")) {
            "getState" -> reply.send("state") { putState() }
            "validateLink" -> validateLink(request.text("url"), reply)
            "scanQr" ->
                if (DeviceInfo.hasCamera(activity)) activity.qrScanner.scan(reply) else reply.error(ERROR_NO_CAMERA)
            "saveConfig" -> saveConfig(request, reply)
            "startDemo" -> {
                reply.send("ok")
                activity.navigateSoon(LocalPages.DEMO)
            }
            "resume" -> {
                val config = activity.store.load() ?: return reply.error(ERROR_NO_CONFIG)
                reply.send("ok")
                activity.navigateSoon(config.url)
            }
            "resetConfig" -> {
                activity.store.clear()
                DeviceInfo.setLauncherEnabled(activity, false)
                reply.send("state") { putState() }
            }
            "openSettings" -> {
                reply.send("ok")
                activity.openSettings()
            }
            else -> reply.error(ERROR_UNKNOWN_REQUEST)
        }
    }

    private fun validateLink(url: String, reply: BridgeReply) {
        when (val link = PairingLink.parse(url)) {
            is PairingLink.Valid -> reply.send("validated") {
                put("ok", true)
                put("mode", link.mode.name)
                put("normalizedUrl", link.normalizedUrl)
            }
            is PairingLink.Invalid -> reply.send("validated") {
                put("ok", false)
                put("error", link.error)
            }
        }
    }

    private fun saveConfig(request: JSONObject, reply: BridgeReply) {
        val link = when (val parsed = PairingLink.parse(request.text("url"))) {
            is PairingLink.Valid -> parsed
            is PairingLink.Invalid -> return reply.error(parsed.error)
        }
        // A missing or null pin keeps the saved one (re-pairing after a key change must
        // not silently unlock the device); "" removes it.
        val pin = if (request.isNull("pin")) null else Pin.normalize(request.optString("pin"))
        if (!pin.isNullOrEmpty() && !Pin.isValid(pin)) return reply.error(Pin.ERROR_FORMAT)
        val launcher = request.optBoolean("launcher")
        activity.store.save(
            mode = link.mode,
            url = link.normalizedUrl,
            // Screen pinning only makes sense for the customer-facing modes.
            kiosk = request.optBoolean("kiosk") && Screen.of(link.mode).isKiosk,
            launcher = launcher,
            pin = pin,
        )
        DeviceInfo.setLauncherEnabled(activity, launcher)
        reply.send("saved")
        activity.onConfigSaved(link.normalizedUrl, launcher)
    }

    private fun JSONObject.putState() {
        val config = activity.store.load()
        put(
            "config",
            config?.let {
                JSONObject()
                    .put("mode", it.mode.name)
                    .put("url", it.url)
                    .put("hasPin", it.hasPin)
                    .put("kiosk", it.kiosk)
                    .put("launcher", it.launcher)
            } ?: JSONObject.NULL,
        )
        val webViewVersion = DeviceInfo.webViewVersion(activity)
        put("appVersion", BuildConfig.VERSION_NAME)
        put("webViewVersion", webViewVersion)
        put("webViewSupported", (DeviceInfo.webViewMajor(webViewVersion) ?: 0) >= DeviceInfo.MIN_WEBVIEW_MAJOR)
        put("isTv", DeviceInfo.isTv(activity))
        put("hasCamera", DeviceInfo.hasCamera(activity))
    }

    /** JSON null and missing keys both read as "". */
    private fun JSONObject.text(name: String): String = if (isNull(name)) "" else optString(name)

    private companion object {
        const val TAG = "AppBridge"
        const val ERROR_NO_CONFIG = "لا توجد إعدادات محفوظة على هذا الجهاز"
        const val ERROR_NO_CAMERA = "لا توجد كاميرا في هذا الجهاز — الصق الرابط بدلاً من ذلك"
        const val ERROR_UNKNOWN_REQUEST = "طلب غير معروف"
    }
}

/** Replies to one bridge request (same "id"), in the frame that sent it. */
class BridgeReply(private val id: String, private val proxy: JavaScriptReplyProxy) {
    // A reply proxy only exists once WEB_MESSAGE_LISTENER was found supported.
    @SuppressLint("RequiresFeature")
    fun send(type: String, fill: JSONObject.() -> Unit = {}) {
        val message = JSONObject().put("id", id).put("type", type).apply(fill)
        try {
            proxy.postMessage(message.toString())
        } catch (e: RuntimeException) {
            Log.w("BridgeReply", "Reply dropped (frame gone?)", e) // the page navigated away
        }
    }

    fun error(message: String) = send("error") { put("message", message) }
}

/** QR scanning with zxing's capture screen; the result answers the pending bridge request. */
class QrScanner(activity: ComponentActivity) {
    private var pending: BridgeReply? = null

    // Registered at construction: the activity must create this before it is started.
    private val launcher = activity.registerForActivityResult(ScanContract()) { result ->
        val reply = pending ?: return@registerForActivityResult
        pending = null
        val text = result.contents
        if (text == null) reply.send("scanCancelled") else reply.send("scanResult") { put("text", text) }
    }

    fun scan(reply: BridgeReply) {
        // A second tap while the camera starts would stack another scanner whose
        // result nobody waits for: only one runs, the extra request is answered at once.
        if (pending != null) return reply.send("scanCancelled")
        pending = reply
        launcher.launch(
            ScanOptions()
                .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                .setPrompt(PROMPT)
                .setBeepEnabled(false)
                .setOrientationLocked(false),
        )
    }

    private companion object {
        const val PROMPT = "وجّه الكاميرا نحو رمز QR الظاهر في لوحة التحكم"
    }
}
