package com.alshams.projectionmenu

import java.io.UnsupportedEncodingException
import java.net.URLDecoder

/**
 * A small, lenient splitter for absolute URLs (`scheme://authority/path?query#fragment`).
 * Pure Kotlin on purpose: android.net.Uri is not available in JVM unit tests,
 * and java.net.URI rejects links people actually paste (spaces, Arabic table codes).
 */
data class WebUrl(
    /** Lower-case scheme, e.g. "http". */
    val scheme: String,
    /** Host as written; IPv6 literals keep their brackets. May be empty. */
    val host: String,
    /** Explicit port, or null when the URL has none. */
    val port: Int?,
    /** Raw path, possibly empty. */
    val path: String,
    /** Raw query without the leading '?', or null when absent. */
    val query: String?,
    /** Whether the authority had a `user:password@` part. */
    val hasUserInfo: Boolean = false,
) {
    val isHttp: Boolean get() = scheme == "http" || scheme == "https"

    /** `scheme://host:port` with the default port spelled out, for same-origin checks. */
    val origin: String get() = "$scheme://${host.lowercase()}:${port ?: DEFAULT_PORTS[scheme] ?: -1}"

    /** True for pages bundled in the APK (served by WebViewAssetLoader). */
    val isLocal: Boolean get() = origin == LOCAL_URL.origin

    /** First value of a query parameter, percent-decoded. */
    fun queryParam(name: String): String? {
        val q = query ?: return null
        for (pair in q.split('&')) {
            if (decode(pair.substringBefore('=')) == name) return decode(pair.substringAfter('=', ""))
        }
        return null
    }

    companion object {
        private val DEFAULT_PORTS = mapOf("http" to 80, "https" to 443)
        private val PATTERN = Regex("""^([A-Za-z][A-Za-z0-9+.-]*)://([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#.*)?$""")
        private val HOST = Regex("""^[A-Za-z0-9._~%!$&'()*+,;=-]+$""")
        private val IPV6_HOST = Regex("""^\[[0-9A-Fa-f:.]+]$""")
        private val LOCAL_URL = WebUrl("https", LOCAL_HOST, null, "/", null)

        /** Parses an absolute URL; returns null when it is not one (or has a bad host/port). */
        fun parse(raw: String): WebUrl? {
            val match = PATTERN.matchEntire(raw) ?: return null
            val groups = match.groups
            val authority = groups[2]!!.value
            val (host, portText) = splitHostPort(authority.substringAfterLast('@')) ?: return null
            if (host.isNotEmpty() && !HOST.matches(host) && !IPV6_HOST.matches(host)) return null
            val port = when {
                portText.isNullOrEmpty() -> null
                portText.all { it in '0'..'9' } && portText.length <= 5 -> portText.toInt().takeIf { it in 1..65535 } ?: return null
                else -> return null
            }
            return WebUrl(
                scheme = groups[1]!!.value.lowercase(),
                host = host,
                port = port,
                path = groups[3]!!.value,
                query = groups[4]?.value,
                hasUserInfo = '@' in authority,
            )
        }

        private fun splitHostPort(hostPort: String): Pair<String, String?>? {
            if (hostPort.startsWith("[")) {
                val end = hostPort.indexOf(']')
                if (end < 0) return null
                val rest = hostPort.substring(end + 1)
                return when {
                    rest.isEmpty() -> hostPort to null
                    rest.startsWith(":") -> hostPort.substring(0, end + 1) to rest.substring(1)
                    else -> null
                }
            }
            val colon = hostPort.indexOf(':')
            if (colon < 0) return hostPort to null
            if (hostPort.lastIndexOf(':') != colon) return null
            return hostPort.substring(0, colon) to hostPort.substring(colon + 1)
        }

        private fun decode(text: String): String = try {
            URLDecoder.decode(text, "UTF-8")
        } catch (_: IllegalArgumentException) {
            text // malformed %-escape: keep it as written
        } catch (_: UnsupportedEncodingException) {
            text
        }

        /** Same output as JavaScript's encodeURIComponent (UTF-8, unreserved chars kept). */
        fun encodeComponent(text: String): String {
            val out = StringBuilder()
            for (byte in text.toByteArray(Charsets.UTF_8)) {
                val c = byte.toInt() and 0xFF
                if (c.toChar() in UNRESERVED) {
                    out.append(c.toChar())
                } else {
                    out.append('%').append(HEX[c shr 4]).append(HEX[c and 0xF])
                }
            }
            return out.toString()
        }

        private const val HEX = "0123456789ABCDEF"
        private val UNRESERVED: Set<Char> =
            (('A'..'Z') + ('a'..'z') + ('0'..'9') + listOf('-', '_', '.', '!', '~', '*', '\'', '(', ')')).toSet()
    }
}
