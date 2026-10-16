package com.alshams.projectionmenu

/** What a saved configuration turns the device into. */
enum class AppMode { TABLET, PLAYER, ADMIN }

/**
 * Validates the pairing links shown (and QR-encoded) by the dashboard:
 *   http://host:port/tablet/?table=T01&key=…        → TABLET
 *   http://host:port/player/?projector=1&key=…      → PLAYER
 *   http://host:port/  or  /admin/…                  → ADMIN (normalized to /admin/)
 * A missing scheme means http:// (people type "192.168.1.10:3000").
 */
object PairingLink {
    sealed interface Result
    data class Valid(val mode: AppMode, val normalizedUrl: String) : Result
    data class Invalid(val error: String) : Result

    const val ERROR_EMPTY = "أدخل رابط الربط أو امسحه من لوحة التحكم"
    const val ERROR_MALFORMED = "الرابط غير صالح — تأكد من كتابته كاملاً"
    const val ERROR_SCHEME = "يجب أن يبدأ الرابط بـ http:// أو https://"
    const val ERROR_HOST = "الرابط لا يحتوي على عنوان الخادم"
    const val ERROR_TABLET = "رابط التابلت ناقص: يجب أن يحتوي على رمز الطاولة (table) والمفتاح (key)"
    const val ERROR_PLAYER = "رابط شاشة العرض ناقص: يجب أن يحتوي على رقم جهاز العرض (projector) والمفتاح (key)"
    const val ERROR_UNKNOWN = "الرابط غير معروف — انسخه أو امسحه من لوحة التحكم"

    private val HAS_SCHEME = Regex("^[A-Za-z][A-Za-z0-9+.-]*://")
    private val LEADING_SLASHES = Regex("^/{2,}")

    fun parse(raw: String?): Result {
        val trimmed = raw?.trim().orEmpty()
        if (trimmed.isEmpty()) return Invalid(ERROR_EMPTY)
        val text = if (HAS_SCHEME.containsMatchIn(trimmed)) trimmed else "http://$trimmed"
        // "user@host" links are never produced by the dashboard and are a classic
        // way to disguise the real host (http://192.168.1.10@evil.example).
        val url = WebUrl.parse(text)?.takeUnless { it.hasUserInfo } ?: return Invalid(ERROR_MALFORMED)
        if (!url.isHttp) return Invalid(ERROR_SCHEME)
        if (url.host.isEmpty()) return Invalid(ERROR_HOST)
        // The full link as given, with only the scheme lower-cased.
        val fullLink = url.scheme + text.substring(url.scheme.length)
        val path = url.path.replace(LEADING_SLASHES, "/") // "host:3000//tablet/" is served the same

        return when {
            path.isUnder("/tablet") ->
                if (url.hasParams("table", "key")) Valid(AppMode.TABLET, fullLink) else Invalid(ERROR_TABLET)
            path.isUnder("/player") ->
                if (url.hasParams("projector", "key")) Valid(AppMode.PLAYER, fullLink) else Invalid(ERROR_PLAYER)
            path.isEmpty() || path == "/" || path.isUnder("/admin") ->
                Valid(AppMode.ADMIN, "${url.scheme}://${url.host}${url.port?.let { ":$it" }.orEmpty()}/admin/")
            else -> Invalid(ERROR_UNKNOWN)
        }
    }

    /** "/tablet" and "/tablet/…" match, "/tablets" does not. */
    private fun String.isUnder(prefix: String) = this == prefix || startsWith("$prefix/")

    private fun WebUrl.hasParams(vararg names: String) = names.all { !queryParam(it).isNullOrBlank() }
}
