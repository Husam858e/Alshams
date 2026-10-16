package com.alshams.projectionmenu

import android.content.Context
import android.content.res.AssetManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream
import java.io.FilterInputStream
import java.io.IOException
import java.io.InputStream

/**
 * Serves the APK's assets on https://appassets.androidplatform.net/ (asset path ==
 * URL path). Audio/video additionally answer HTTP Range requests: the stock
 * AssetsPathHandler always returns the whole file without Accept-Ranges, which
 * leaves Chromium unable to seek, so looping clips could stall.
 */
class LocalContent(context: Context) {
    private val assets: AssetManager = context.assets
    private val loader = WebViewAssetLoader.Builder()
        .setDomain(LOCAL_HOST)
        .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(context))
        .build()

    fun serve(request: WebResourceRequest): WebResourceResponse? {
        val path = request.url.path.orEmpty()
        val mime = MEDIA_TYPES[path.substringAfterLast('.', "").lowercase()]
        if (mime != null && request.url.scheme == "https") {
            val range = request.requestHeaders.orEmpty().entries.firstOrNull { it.key.equals("Range", ignoreCase = true) }
            serveMedia(path.removePrefix("/"), mime, range?.value)?.let { return it }
        }
        return loader.shouldInterceptRequest(request.url)
    }

    private fun serveMedia(assetPath: String, mime: String, rangeHeader: String?): WebResourceResponse? {
        // openFd only works for uncompressed assets; aapt stores media uncompressed.
        val total = try {
            assets.openFd(assetPath).use { it.length }
        } catch (_: IOException) {
            return null
        }
        val range = ByteRange.parse(rangeHeader, total)
        // WebView sets Content-Length itself, from the stream's available().
        val headers = mapOf("Accept-Ranges" to "bytes")
        return try {
            val stream = assets.open(assetPath)
            if (range == null) {
                WebResourceResponse(mime, null, 200, "OK", headers, stream)
            } else {
                val partial = headers + ("Content-Range" to range.contentRange(total))
                WebResourceResponse(mime, null, 206, "Partial Content", partial, range.body(stream))
            }
        } catch (_: IOException) {
            null
        }
    }

    companion object {
        private val MEDIA_TYPES = mapOf(
            "webm" to "video/webm",
            "mp4" to "video/mp4",
            "m4v" to "video/mp4",
            "ogv" to "video/ogg",
            "mp3" to "audio/mpeg",
            "ogg" to "audio/ogg",
        )

        /** Returned for bundled resources requested by a remote page. */
        fun forbidden() = WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", emptyMap(), null)

        /** For a refused main-frame navigation: a 204 is never committed, the current page stays. */
        fun refused() = WebResourceResponse(
            "text/plain", "utf-8", 204, "No Content", emptyMap(), ByteArrayInputStream(ByteArray(0)),
        )
    }
}

/** A single satisfiable `Range: bytes=…` request against a file of known length. */
data class ByteRange(val start: Long, val end: Long) {
    val length: Long get() = end - start + 1

    fun contentRange(total: Long) = "bytes $start-$end/$total"

    /**
     * The response body for this range, from the whole [file] stream. WebView applies
     * the request's Range to intercepted responses itself (available() as the size,
     * then skip(start)), so the body starts at byte 0 and only ends after [end].
     */
    fun body(file: InputStream): InputStream = LimitedInputStream(file, end + 1)

    companion object {
        private val SINGLE = Regex("""^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$""", RegexOption.IGNORE_CASE)

        /** Null means "send the whole file" (no header, multi-range, or unsatisfiable). */
        fun parse(header: String?, total: Long): ByteRange? {
            if (header == null || total <= 0) return null
            val match = SINGLE.matchEntire(header) ?: return null
            val (first, last) = match.destructured
            val range = when {
                first.isEmpty() && last.isEmpty() -> return null
                first.isEmpty() -> { // suffix: the last N bytes
                    val n = last.toLongOrNull() ?: return null
                    if (n <= 0) return null
                    ByteRange(maxOf(0, total - n), total - 1)
                }
                else -> {
                    val start = first.toLongOrNull() ?: return null
                    val end = if (last.isEmpty()) total - 1 else minOf(last.toLongOrNull() ?: return null, total - 1)
                    ByteRange(start, end)
                }
            }
            return range.takeIf { it.start < total && it.start <= it.end }
        }
    }
}

/** Ends [input] after [limit] bytes; skipped bytes count towards the limit. */
class LimitedInputStream(input: InputStream, limit: Long) : FilterInputStream(input) {
    private var left = limit

    override fun read(): Int {
        if (left <= 0) return -1
        val b = super.read()
        if (b >= 0) left--
        return b
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        if (left <= 0) return -1
        val n = super.read(buffer, offset, minOf(length.toLong(), left).toInt())
        if (n > 0) left -= n
        return n
    }

    override fun skip(count: Long): Long {
        val skipped = super.skip(minOf(count, left))
        if (skipped > 0) left -= skipped
        return skipped
    }

    override fun available(): Int = minOf(super.available().toLong(), left).toInt()

    override fun markSupported() = false
}
