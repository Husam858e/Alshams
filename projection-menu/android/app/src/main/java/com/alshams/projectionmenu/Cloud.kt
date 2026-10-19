package com.alshams.projectionmenu

/**
 * Cloud mode: the staff app and the player run as bundled pages
 * (assets/cloud/, served on [LOCAL_ORIGIN]) on the restaurant's Firebase
 * project instead of a server. A saved cloud configuration is one of
 *   https://appassets.androidplatform.net/cloud/app.html                    → APP
 *   https://appassets.androidplatform.net/cloud/player.html?device=<key>    → PLAYER
 * optionally with `emulators=<host>` (local Firebase emulators, debug builds only).
 * Unlike server links these never come from a QR code: setup builds them.
 */
object CloudPages {
    const val APP_PATH = "/cloud/app.html"
    const val PLAYER_PATH = "/cloud/player.html"

    const val ERROR_PLAYER = "رابط جهاز العرض السحابي ناقص: يجب أن يحتوي على مفتاح الجهاز (device)"
    const val ERROR_EMULATORS = "محاكيات Firebase متاحة في نسخة التطوير فقط"

    private const val MAX_DEVICE = 64
    private val EMULATOR_HOST = Regex("""^([A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+])$""")

    /** The mode a cloud page runs, or null when [url] is not one. */
    fun modeOf(url: WebUrl?): AppMode? {
        if (url == null || !url.isLocal) return null
        return when (url.path) {
            APP_PATH -> AppMode.APP
            PLAYER_PATH -> AppMode.PLAYER
            else -> null
        }
    }

    /**
     * Checks a cloud page URL for saving: null when [raw] is no cloud page at all
     * (it may be a server link), otherwise the page with only the parameters it
     * understands, or why it cannot be saved.
     */
    fun parse(raw: String?, allowEmulators: Boolean): PairingLink.Result? {
        val url = raw?.trim()?.let(WebUrl::parse)?.takeUnless { it.hasUserInfo } ?: return null
        val mode = modeOf(url) ?: return null
        val params = mutableListOf<Pair<String, String>>()
        if (mode == AppMode.PLAYER) {
            val device = url.queryParam("device")?.trim()
            if (device.isNullOrEmpty() || device.length > MAX_DEVICE) return PairingLink.Invalid(ERROR_PLAYER)
            params += "device" to device
        }
        val emulators = url.queryParam("emulators")?.trim()
        if (!emulators.isNullOrEmpty()) {
            if (!allowEmulators || !EMULATOR_HOST.matches(emulators)) return PairingLink.Invalid(ERROR_EMULATORS)
            params += "emulators" to emulators
        }
        val query = params.joinToString("&") { (name, value) -> "$name=${WebUrl.encodeComponent(value)}" }
        return PairingLink.Valid(mode, LOCAL_ORIGIN + url.path + if (query.isEmpty()) "" else "?$query")
    }

    /** Whether the configured page talks to the Firebase emulators (plain http: mixed content). */
    fun usesEmulators(configUrl: String?): Boolean {
        val url = configUrl?.let(WebUrl::parse) ?: return false
        return modeOf(url) != null && !url.queryParam("emulators").isNullOrBlank()
    }

    /**
     * A main-frame load of the configured cloud page itself, e.g. the staff app's
     * "reload" button: allowed like a server page's own reload. Only the exact
     * saved URL (path and query), and only while the configured screen is shown.
     */
    fun isHomeReload(method: String?, path: String?, query: String?, screen: Screen, configUrl: String?): Boolean {
        if (method != "GET" || !screen.isLockable) return false
        val home = configUrl?.let(WebUrl::parse) ?: return false
        return modeOf(home) != null && path == home.path && query == home.query
    }
}

/**
 * The Firebase project config pasted in setup (the object the Firebase console
 * shows). Setup validates it too (assets/cloud/config.js); native checks it
 * again before storing, with the same rules.
 */
object FirebaseProject {
    val REQUIRED = listOf("apiKey", "projectId", "appId", "storageBucket")
    private val KNOWN = listOf("apiKey", "authDomain", "databaseURL", "projectId", "storageBucket", "messagingSenderId", "appId", "measurementId")
    // Ours, next to Firebase's keys: where media files go. "firestore" is the
    // default (kept by leaving the key out); "storage" = Firebase Storage (Blaze plan).
    private val MEDIA_MODES = listOf("firestore", "storage")
    private val PROJECT_ID = Regex("^[a-z0-9][a-z0-9-]*[a-z0-9]$")
    private val WHITESPACE = Regex("\\s")
    private const val MAX_VALUE = 300

    const val ERROR_INVALID = "إعدادات Firebase غير صالحة — الصقها من جديد في شاشة الإعداد"

    /** The known keys as trimmed strings, or null when a required one is missing or a value is odd. */
    fun sanitize(values: Map<String, Any?>): Map<String, String>? {
        val out = LinkedHashMap<String, String>()
        for (key in KNOWN) {
            val value = values[key] ?: continue
            if (value !is String && value !is Number) return null
            val text = value.toString().trim()
            if (text.isEmpty()) continue
            if (text.length > MAX_VALUE || WHITESPACE.containsMatchIn(text)) return null
            out[key] = text
        }
        values["media"]?.let { media ->
            val mode = (media as? String)?.trim() ?: return null
            if (mode.isNotEmpty() && mode !in MEDIA_MODES) return null
            if (mode == "storage") out["media"] = mode
        }
        if (REQUIRED.any { it !in out }) return null
        if (!PROJECT_ID.matches(out.getValue("projectId"))) return null
        return out
    }
}
