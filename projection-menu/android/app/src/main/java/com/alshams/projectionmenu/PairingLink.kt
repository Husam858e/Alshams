package com.alshams.projectionmenu

/** What a saved configuration turns the device into. */
enum class AppMode {
    /** The staff app (waiter / designer / owner) at `<server>/app/` (cloud: [CloudPages.APP_PATH]). */
    APP,

    /** A table's projector player at `<server>/player/?device=<key>` (cloud: [CloudPages.PLAYER_PATH]). */
    PLAYER,
}

/**
 * Validates the addresses and links the setup page receives (typed, discovered,
 * scanned from a QR code):
 *   192.168.1.10:3000, http://host:port/ or …/app/…      → APP (normalized to <origin>/app/)
 *   http://host:port/player/?device=<key>                 → PLAYER (kept as given)
 *   v1 links …/admin/… and …/tablet/…                     → APP (the v2 server serves both from /app/)
 * A missing scheme means http:// (people type "192.168.1.10:3000").
 */
object PairingLink {
    sealed interface Result
    data class Valid(val mode: AppMode, val normalizedUrl: String) : Result
    data class Invalid(val error: String) : Result

    const val ERROR_EMPTY = "أدخل عنوان الخادم أو امسح رمز QR"
    const val ERROR_MALFORMED = "العنوان غير صالح — تأكد من كتابته كاملاً"
    const val ERROR_SCHEME = "يجب أن يبدأ العنوان بـ http:// أو https://"
    const val ERROR_HOST = "العنوان لا يحتوي على اسم الخادم أو رقم IP"
    const val ERROR_PLAYER = "رابط جهاز العرض ناقص: يجب أن يحتوي على مفتاح الجهاز (device)"
    const val ERROR_PLAYER_V1 = "هذا رابط جهاز عرض من النسخة السابقة — اربط الجهاز برمز الربط من تطبيق الموظفين"
    const val ERROR_UNKNOWN = "الرابط غير معروف — استخدم عنوان الخادم أو رمز QR من تطبيق الموظفين"

    private val HAS_SCHEME = Regex("^[A-Za-z][A-Za-z0-9+.-]*://")
    private val LEADING_SLASHES = Regex("^/{2,}")

    fun parse(raw: String?): Result {
        val trimmed = raw?.trim().orEmpty()
        if (trimmed.isEmpty()) return Invalid(ERROR_EMPTY)
        val text = if (HAS_SCHEME.containsMatchIn(trimmed)) trimmed else "http://$trimmed"
        // "user@host" links are never produced by the server and are a classic
        // way to disguise the real host (http://192.168.1.10@evil.example).
        val url = WebUrl.parse(text)?.takeUnless { it.hasUserInfo } ?: return Invalid(ERROR_MALFORMED)
        if (!url.isHttp) return Invalid(ERROR_SCHEME)
        if (url.host.isEmpty()) return Invalid(ERROR_HOST)
        // The full link as given, with only the scheme lower-cased.
        val fullLink = url.scheme + text.substring(url.scheme.length)
        val path = url.path.replace(LEADING_SLASHES, "/") // "host:3000//player/" is served the same

        return when {
            path.isUnder("/player") -> when {
                url.hasParam("device") -> Valid(AppMode.PLAYER, fullLink)
                url.hasParam("projector") && url.hasParam("key") -> Invalid(ERROR_PLAYER_V1)
                else -> Invalid(ERROR_PLAYER)
            }
            path.isEmpty() || path == "/" || path.isUnder("/app") || path.isUnder("/admin") || path.isUnder("/tablet") ->
                Valid(AppMode.APP, appUrl(url))
            else -> Invalid(ERROR_UNKNOWN)
        }
    }

    /** `<origin>/app/` of the server [url] belongs to. */
    private fun appUrl(url: WebUrl) = "${url.scheme}://${url.host}${url.port?.let { ":$it" }.orEmpty()}/app/"

    /** "/app" and "/app/…" match, "/app.apk" and "/apps" do not. */
    private fun String.isUnder(prefix: String) = this == prefix || startsWith("$prefix/")

    private fun WebUrl.hasParam(name: String) = !queryParam(name).isNullOrBlank()
}

/**
 * Turns a configuration saved by any app version into a v2 one. v1 saved
 * TABLET / ADMIN / PLAYER: tablets and dashboards become the staff app on the
 * same server; a v1 player link (projector + key) cannot be converted, so that
 * device goes back to setup to be paired again with a code. Cloud pages
 * (bundled, see [CloudPages]) are kept as they are when they match their mode.
 */
object ConfigMigration {
    data class Saved(val mode: AppMode, val url: String)

    private val STAFF_MODES = setOf(AppMode.APP.name, "TABLET", "ADMIN")

    /** The v2 configuration, or null when there is none (or it must be set up again). */
    fun migrate(mode: String?, url: String?): Saved? {
        if (mode == null || url.isNullOrBlank()) return null
        // Not PairingLink: it would turn the bundled page into "<appassets>/app/".
        // Emulator links were only ever saved by a debug build: keep them.
        CloudPages.parse(url, allowEmulators = true)?.let { cloud ->
            return (cloud as? PairingLink.Valid)?.takeIf { it.mode.name == mode }?.let { Saved(it.mode, it.normalizedUrl) }
        }
        val link = PairingLink.parse(url) as? PairingLink.Valid
        return when {
            mode in STAFF_MODES -> {
                // Any page of the server leads to its staff app, even an odd saved path.
                val appUrl = link?.takeIf { it.mode == AppMode.APP }?.normalizedUrl ?: originAppUrl(url) ?: return null
                Saved(AppMode.APP, appUrl)
            }
            mode == AppMode.PLAYER.name && link?.mode == AppMode.PLAYER -> Saved(AppMode.PLAYER, link.normalizedUrl)
            else -> null
        }
    }

    private fun originAppUrl(raw: String): String? {
        val url = WebUrl.parse(raw)?.takeIf { it.isHttp && it.host.isNotEmpty() && !it.hasUserInfo } ?: return null
        return "${url.scheme}://${url.host}${url.port?.let { ":$it" }.orEmpty()}/app/"
    }
}
