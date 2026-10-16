package com.alshams.projectionmenu

import android.content.Context
import androidx.core.content.edit

/** The saved pairing. The PIN itself is never stored, only [Pin.hash]. */
data class AppConfig(
    val mode: AppMode,
    val url: String,
    val hasPin: Boolean,
    val kiosk: Boolean,
    val launcher: Boolean,
)

class ConfigStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("config", Context.MODE_PRIVATE)

    fun load(): AppConfig? {
        val mode = prefs.getString(KEY_MODE, null)?.let { name -> AppMode.entries.firstOrNull { it.name == name } }
        val url = prefs.getString(KEY_URL, null)
        if (mode == null || url.isNullOrEmpty()) return null
        return AppConfig(
            mode = mode,
            url = url,
            hasPin = prefs.contains(KEY_PIN_HASH),
            kiosk = prefs.getBoolean(KEY_KIOSK, false),
            launcher = prefs.getBoolean(KEY_LAUNCHER, false),
        )
    }

    /**
     * Saves synchronously (a kiosk may lose power right after setup).
     * @param pin a valid normalized PIN, "" for no PIN, or null to keep the current one.
     */
    fun save(mode: AppMode, url: String, kiosk: Boolean, launcher: Boolean, pin: String?) {
        prefs.edit(commit = true) {
            putString(KEY_MODE, mode.name)
            putString(KEY_URL, url)
            putBoolean(KEY_KIOSK, kiosk)
            putBoolean(KEY_LAUNCHER, launcher)
            when {
                pin == null -> Unit
                pin.isEmpty() -> {
                    remove(KEY_PIN_HASH)
                    remove(KEY_PIN_SALT)
                }
                else -> {
                    val salt = Pin.newSalt()
                    putString(KEY_PIN_SALT, salt)
                    putString(KEY_PIN_HASH, Pin.hash(pin, salt))
                }
            }
        }
    }

    /** True when no PIN is set or [pin] matches it. */
    fun checkPin(pin: String): Boolean {
        val hash = prefs.getString(KEY_PIN_HASH, null) ?: return true
        return Pin.matches(pin, prefs.getString(KEY_PIN_SALT, null).orEmpty(), hash)
    }

    fun clear() = prefs.edit(commit = true) { clear() }

    private companion object {
        const val KEY_MODE = "mode"
        const val KEY_URL = "url"
        const val KEY_KIOSK = "kiosk"
        const val KEY_LAUNCHER = "launcher"
        const val KEY_PIN_HASH = "pin_sha256"
        const val KEY_PIN_SALT = "pin_salt"
    }
}
