package com.alshams.projectionmenu

import android.content.Context
import android.util.Log
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.FilterInputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Cloud mode's menu media (photos, videos, 3D models) come from Firebase Storage
 * download URLs. [MediaProxy] answers those requests itself:
 *  - from a disk cache, so a projector does not download every photo again on
 *    each start, and keeps showing them while the internet is down;
 *  - with `Access-Control-Allow-Origin: *`: the 3D model loader uses fetch/XHR,
 *    which a Storage bucket without a CORS configuration would refuse;
 *  - with Range support (video seeking), like the bundled media ([LocalContent]).
 * Only GET downloads are touched (uploads and metadata calls pass through), and
 * only successful, immutable responses are kept (the cloud backend uploads with
 * `Cache-Control: public, max-age=31536000, immutable`).
 */
class MediaProxy(context: Context) {
    private val cache = MediaCache(File(context.cacheDir, CACHE_DIR), MediaCache.MAX_BYTES)

    // WebView background thread.
    fun intercept(request: WebResourceRequest): WebResourceResponse? {
        val url = request.url.toString()
        if (!MediaCache.isMediaDownload(request.method, WebUrl.parse(url))) return null
        val range = request.requestHeaders.orEmpty().entries.firstOrNull { it.key.equals("Range", ignoreCase = true) }?.value
        cache.get(url)?.let { entry ->
            try {
                return respond(entry.contentType, entry.length, FileInputStream(entry.file), range, CACHED_HEADERS)
            } catch (e: IOException) {
                Log.w(TAG, "Cached file unreadable, downloading again", e) // e.g. cleared by the system
            }
        }
        return download(url, range)
    }

    private fun download(url: String, range: String?): WebResourceResponse? {
        val connection = try {
            URL(url).openConnection() as HttpURLConnection
        } catch (e: IOException) {
            Log.w(TAG, "Cannot open $url", e)
            return null
        }
        return try {
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            // The whole file, as stored: it goes to the cache and WebView cuts any range itself.
            connection.setRequestProperty("Accept-Encoding", "identity")
            val status = connection.responseCode
            val mime = connection.contentType?.substringBefore(';')?.trim()?.ifEmpty { null } ?: DEFAULT_TYPE
            if (status != HttpURLConnection.HTTP_OK) {
                // 403 / 404 …: the page sees the real answer (readable thanks to CORS).
                val body = connection.errorStream ?: ByteArrayInputStream(ByteArray(0))
                val reason = connection.responseMessage?.ifEmpty { null } ?: "Error"
                return WebResourceResponse(mime, null, status, reason, CORS, ClosingInputStream(body, connection))
            }
            val length = connection.contentLengthLong
            val cacheControl = connection.getHeaderField("Cache-Control")
            val writer = if (MediaCache.isStorable(status, cacheControl, length)) cache.writer(url, mime, length) else null
            val body = TeeInputStream(connection.inputStream, writer, length) { connection.disconnect() }
            val headers = if (cacheControl != null) CORS + ("Cache-Control" to cacheControl) else CORS
            respond(mime, length, body, range, headers)
        } catch (e: IOException) {
            connection.disconnect()
            Log.w(TAG, "Download failed: ${e.message}")
            null // WebView tries itself and reports the network error to the page
        }
    }

    private fun respond(mime: String, length: Long, body: InputStream, rangeHeader: String?, headers: Map<String, String>): WebResourceResponse {
        if (length <= 0) return WebResourceResponse(mime, null, 200, "OK", headers, body)
        val withRanges = headers + ("Accept-Ranges" to "bytes")
        // WebView applies the request's Range to the body itself (see ByteRange.body).
        val range = ByteRange.parse(rangeHeader, length)
            ?: return WebResourceResponse(mime, null, 200, "OK", withRanges, body)
        val partial = withRanges + ("Content-Range" to range.contentRange(length))
        return WebResourceResponse(mime, null, 206, "Partial Content", partial, range.body(body))
    }

    private companion object {
        const val TAG = "MediaProxy"
        const val CACHE_DIR = "media-cache"
        const val CONNECT_TIMEOUT_MS = 15_000
        const val READ_TIMEOUT_MS = 30_000
        const val DEFAULT_TYPE = "application/octet-stream"
        val CORS = mapOf("Access-Control-Allow-Origin" to "*")
        val CACHED_HEADERS = CORS + ("Cache-Control" to "public, max-age=31536000, immutable")
    }
}

/**
 * The files behind [MediaProxy]: one `<sha256(url)>.bin` per download URL with
 * its content type next to it (`.type`), evicted least-recently-used first
 * (a file's modification time is its last use) once the total passes [maxBytes].
 * Thread-safe; plain java.io so the JVM tests can run it.
 */
class MediaCache(private val dir: File, private val maxBytes: Long, private val clock: () -> Long = System::currentTimeMillis) {
    class Entry(val file: File, val contentType: String, val length: Long)

    init {
        // Downloads cut short by a closed app leave their temp files behind.
        dir.listFiles { file -> file.name.endsWith(TMP) && clock() - file.lastModified() > STALE_TMP_MS }?.forEach { it.delete() }
    }

    @Synchronized
    fun get(url: String): Entry? {
        val key = keyOf(url)
        val data = File(dir, "$key$DATA")
        val type = File(dir, "$key$TYPE")
        if (!data.isFile || !type.isFile) return null
        val contentType = try {
            type.readText().trim()
        } catch (_: IOException) {
            return null
        }
        data.setLastModified(clock()) // used now: evicted last
        return Entry(data, contentType.ifEmpty { "application/octet-stream" }, data.length())
    }

    /** Where a download of [url] is written; null when it would not fit. */
    fun writer(url: String, contentType: String, length: Long): Writer? {
        if (length <= 0 || length > maxBytes / MAX_ENTRY_SHARE) return null
        return try {
            dir.mkdirs()
            Writer(keyOf(url), contentType, length)
        } catch (e: IOException) {
            null
        }
    }

    inner class Writer internal constructor(private val key: String, private val contentType: String, private val length: Long) {
        // Unique per download: two requests for the same file may run at once.
        private val temp = File.createTempFile("$key-", TMP, dir)
        val out: OutputStream = FileOutputStream(temp)
        private var done = false

        /** Moves a complete download in; a short one is dropped. */
        fun commit(): Boolean {
            if (done) return false
            done = true
            try {
                out.close()
            } catch (_: IOException) {
                temp.delete()
                return false
            }
            if (temp.length() != length) {
                temp.delete()
                return false
            }
            synchronized(this@MediaCache) {
                val data = File(dir, "$key$DATA")
                try {
                    File(dir, "$key$TYPE").writeText(contentType)
                } catch (_: IOException) {
                    temp.delete()
                    return false
                }
                if (!temp.renameTo(data)) {
                    temp.delete()
                    return false
                }
                data.setLastModified(clock())
                trim()
            }
            return true
        }

        fun abort() {
            if (done) return
            done = true
            try {
                out.close()
            } catch (_: IOException) {
                // nothing to keep anyway
            }
            temp.delete()
        }
    }

    /** Total size of the cached files. */
    @Synchronized
    fun size(): Long = dataFiles().sumOf { it.length() }

    // Oldest use first until the rest fits.
    private fun trim() {
        val files = dataFiles().sortedBy { it.lastModified() }
        var total = files.sumOf { it.length() }
        for (file in files) {
            if (total <= maxBytes) break
            total -= file.length()
            file.delete()
            File(dir, file.name.removeSuffix(DATA) + TYPE).delete()
        }
    }

    private fun dataFiles(): List<File> = dir.listFiles { file -> file.name.endsWith(DATA) }?.toList().orEmpty()

    companion object {
        /** Disk the media of one restaurant may take (photos are ~0.3 MB, clips a few MB). */
        const val MAX_BYTES = 1536L * 1024 * 1024

        /** No single file may take more than this share of the cache. */
        private const val MAX_ENTRY_SHARE = 4
        private const val DATA = ".bin"
        private const val TYPE = ".type"
        private const val TMP = ".tmp"
        private const val STALE_TMP_MS = 60 * 60 * 1000L
        private const val STORAGE_HOST = "firebasestorage.googleapis.com"
        private const val MIN_MAX_AGE_S = 24 * 60 * 60L
        private val OBJECT_PATH = Regex("^/v0/b/[^/]+/o/[^/]+$")
        private val MAX_AGE = Regex("""max-age\s*=\s*(\d+)""", RegexOption.IGNORE_CASE)

        /** A Firebase Storage download (`…/v0/b/<bucket>/o/<object>?alt=media&token=…`). */
        fun isMediaDownload(method: String?, url: WebUrl?): Boolean =
            method == "GET" &&
                url != null &&
                url.scheme == "https" &&
                url.port == null &&
                url.host.equals(STORAGE_HOST, ignoreCase = true) &&
                OBJECT_PATH.matches(url.path) &&
                url.queryParam("alt") == "media"

        /** Only complete, long-lived answers are kept (a file replaced in place must not stick). */
        fun isStorable(status: Int, cacheControl: String?, length: Long): Boolean {
            if (status != 200 || length <= 0 || cacheControl == null) return false
            val directives = cacheControl.lowercase()
            if ("no-store" in directives || "no-cache" in directives || "private" in directives) return false
            if ("immutable" in directives) return true
            val maxAge = MAX_AGE.find(directives)?.groupValues?.get(1)?.toLongOrNull() ?: return false
            return maxAge >= MIN_MAX_AGE_S
        }

        fun keyOf(url: String): String =
            MessageDigest.getInstance("SHA-256").digest(url.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }
}

/**
 * Streams a download to WebView while copying it into the cache. Skipped bytes
 * are read and copied too (WebView skips to the start of a Range itself), and
 * the copy is committed as soon as all [length] bytes went through, even when
 * the reader stops right there. [available] reports the bytes still to come:
 * WebView takes it as the body's size.
 */
class TeeInputStream(
    input: InputStream,
    private var writer: MediaCache.Writer?,
    private val length: Long,
    private val onClose: () -> Unit = {},
) : FilterInputStream(input) {
    private var count = 0L
    private var closed = false

    override fun read(): Int {
        val one = ByteArray(1)
        val n = read(one, 0, 1)
        return if (n <= 0) -1 else one[0].toInt() and 0xFF
    }

    override fun read(buffer: ByteArray, offset: Int, len: Int): Int {
        val n = super.read(buffer, offset, len)
        if (n > 0) {
            copy(buffer, offset, n)
        } else if (n < 0 && count != length) {
            dropCopy() // ended early: incomplete
        }
        return n
    }

    override fun skip(n: Long): Long {
        val buffer = ByteArray(minOf(n, SKIP_BUFFER.toLong()).toInt().coerceAtLeast(1))
        var left = n
        while (left > 0) {
            val read = read(buffer, 0, minOf(left, buffer.size.toLong()).toInt())
            if (read < 0) break
            left -= read
        }
        return n - left
    }

    override fun available(): Int =
        if (length > 0) (length - count).coerceIn(0, Int.MAX_VALUE.toLong()).toInt() else super.available()

    override fun markSupported() = false

    override fun close() {
        if (closed) return
        closed = true
        dropCopy()
        try {
            super.close()
        } finally {
            onClose()
        }
    }

    private fun copy(buffer: ByteArray, offset: Int, n: Int) {
        count += n
        val target = writer ?: return
        try {
            target.out.write(buffer, offset, n)
        } catch (_: IOException) {
            dropCopy() // disk full or gone: keep streaming, just don't cache
            return
        }
        if (count == length) {
            target.commit()
            writer = null
        }
    }

    private fun dropCopy() {
        writer?.abort()
        writer = null
    }

    private companion object {
        const val SKIP_BUFFER = 64 * 1024
    }
}

/** Closes the connection with the error body. */
private class ClosingInputStream(input: InputStream, private val connection: HttpURLConnection) : FilterInputStream(input) {
    override fun close() {
        try {
            super.close()
        } finally {
            connection.disconnect()
        }
    }
}
