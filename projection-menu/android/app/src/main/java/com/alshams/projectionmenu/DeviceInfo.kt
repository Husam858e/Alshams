package com.alshams.projectionmenu

import android.app.UiModeManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.provider.Settings
import android.util.Log
import androidx.core.net.toUri
import androidx.webkit.WebViewCompat

/** Facts about the device and its WebView that setup.html shows. */
object DeviceInfo {
    /** Import maps and the other web features the pages rely on need Chromium 89+. */
    const val MIN_WEBVIEW_MAJOR = 89
    private const val WEBVIEW_PACKAGE = "com.google.android.webview"
    private const val CHROME_PACKAGE = "com.android.chrome"

    fun webViewMajor(versionName: String?): Int? = versionName?.trim()?.substringBefore('.')?.toIntOrNull()

    fun webViewVersion(context: Context): String = try {
        WebViewCompat.getCurrentWebViewPackage(context)?.versionName.orEmpty()
    } catch (_: RuntimeException) {
        ""
    }

    fun webViewSupported(context: Context): Boolean =
        (webViewMajor(webViewVersion(context)) ?: 0) >= MIN_WEBVIEW_MAJOR

    fun isTv(context: Context): Boolean {
        val uiMode = context.getSystemService(UiModeManager::class.java)?.currentModeType
        return uiMode == Configuration.UI_MODE_TYPE_TELEVISION ||
            context.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
    }

    fun hasCamera(context: Context): Boolean =
        context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)

    /** Play Store page of Android System WebView (or of Chrome when it is the provider, Android 7-9). */
    fun openWebViewStorePage(context: Context) {
        val provider = try {
            WebViewCompat.getCurrentWebViewPackage(context)?.packageName
        } catch (_: RuntimeException) {
            null
        }
        val pkg = if (provider == CHROME_PACKAGE) CHROME_PACKAGE else WEBVIEW_PACKAGE
        val market = Intent(Intent.ACTION_VIEW, "market://details?id=$pkg".toUri())
        val web = Intent(Intent.ACTION_VIEW, "https://play.google.com/store/apps/details?id=$pkg".toUri())
        startFirst(context, market, web)
    }

    /** Opens the system "default home app" picker (falls back to the main settings). */
    fun openHomeSettings(context: Context): Boolean =
        startFirst(context, Intent(Settings.ACTION_HOME_SETTINGS), Intent(Settings.ACTION_SETTINGS))

    /**
     * Enables the HOME activity-alias so the app can be picked as the launcher
     * (a kiosk then survives the HOME button and reboots on most devices).
     */
    fun setLauncherEnabled(context: Context, enabled: Boolean) {
        val alias = ComponentName(context, "${MainActivity::class.java.name.substringBeforeLast('.')}.LauncherAlias")
        val state = if (enabled) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        context.packageManager.setComponentEnabledSetting(alias, state, PackageManager.DONT_KILL_APP)
    }

    /** Starts the first intent some app can handle; false when none can. */
    private fun startFirst(context: Context, vararg intents: Intent): Boolean {
        for (intent in intents) {
            try {
                context.startActivity(intent)
                return true
            } catch (e: ActivityNotFoundException) {
                Log.w(TAG, "No activity for ${intent.action}", e)
            }
        }
        return false
    }

    private const val TAG = "DeviceInfo"
}
