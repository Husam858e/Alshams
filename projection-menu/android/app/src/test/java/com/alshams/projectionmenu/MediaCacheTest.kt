package com.alshams.projectionmenu

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.ByteArrayInputStream
import java.io.InputStream

class MediaCacheTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private var now = 1_000_000_000_000L
    private fun cache(max: Long = 1_000_000) = MediaCache(tmp.root, max) { now }

    private val download =
        "https://firebasestorage.googleapis.com/v0/b/demo-pm.appspot.com/o/media%2F12%2Fdish.jpg?alt=media&token=abc"
    private fun bytes(n: Int, seed: Int = 7) = ByteArray(n) { (it * seed + it / 251).toByte() }

    // Everything a reader gets, the way WebView reads an intercepted response.
    private fun webViewReads(body: InputStream, rangeHeader: String?): ByteArray {
        val size = body.available().toLong()
        val bounds = rangeHeader?.let { ByteRange.parse(it, size) }
        var toSkip = bounds?.start ?: 0
        while (toSkip > 0) {
            val skipped = body.skip(toSkip)
            assertTrue("skip made no progress", skipped > 0)
            toSkip -= skipped
        }
        return body.use { it.readBytes() }
    }

    private fun tee(cache: MediaCache, url: String, file: ByteArray): TeeInputStream =
        TeeInputStream(ByteArrayInputStream(file), cache.writer(url, "image/jpeg", file.size.toLong()), file.size.toLong())

    @Test
    fun onlyStorageDownloadsAreIntercepted() {
        assertTrue(MediaCache.isMediaDownload("GET", WebUrl.parse(download)))
        assertFalse(MediaCache.isMediaDownload("POST", WebUrl.parse(download)))
        assertFalse(MediaCache.isMediaDownload("HEAD", WebUrl.parse(download)))
        assertFalse(MediaCache.isMediaDownload(null, WebUrl.parse(download)))
        // Metadata, uploads, other hosts, the emulator (plain http).
        assertFalse(MediaCache.isMediaDownload("GET", WebUrl.parse(download.replace("alt=media&", ""))))
        assertFalse(MediaCache.isMediaDownload("GET", WebUrl.parse("https://firebasestorage.googleapis.com/v0/b/demo-pm.appspot.com/o?name=media%2F1%2Fx.jpg")))
        assertFalse(MediaCache.isMediaDownload("GET", WebUrl.parse(download.replace("firebasestorage.googleapis.com", "evil.example"))))
        assertFalse(MediaCache.isMediaDownload("GET", WebUrl.parse(download.replace("https://", "http://"))))
        assertFalse(MediaCache.isMediaDownload("GET", WebUrl.parse("http://10.0.2.2:9199/v0/b/demo-pm.appspot.com/o/x?alt=media")))
        assertFalse(MediaCache.isMediaDownload("GET", null))
    }

    @Test
    fun onlyImmutableCompleteAnswersAreStored() {
        assertTrue(MediaCache.isStorable(200, "public, max-age=31536000, immutable", 10))
        assertTrue(MediaCache.isStorable(200, "public, max-age=604800", 10))
        assertFalse(MediaCache.isStorable(200, "private, max-age=0", 10)) // Storage's default
        assertFalse(MediaCache.isStorable(200, "public, max-age=3600", 10))
        assertFalse(MediaCache.isStorable(200, "no-store, immutable", 10))
        assertFalse(MediaCache.isStorable(200, null, 10))
        assertFalse(MediaCache.isStorable(206, "immutable", 10))
        assertFalse(MediaCache.isStorable(404, "immutable", 10))
        assertFalse(MediaCache.isStorable(200, "immutable", -1)) // length unknown
    }

    @Test
    fun aFullReadIsCachedAndServedAgain() {
        val cache = cache()
        val file = bytes(70_000)
        assertNull(cache.get(download))
        assertArrayEquals(file, webViewReads(tee(cache, download, file), null))
        val entry = cache.get(download)
        assertNotNull(entry)
        assertEquals("image/jpeg", entry!!.contentType)
        assertEquals(file.size.toLong(), entry.length)
        assertArrayEquals(file, entry.file.readBytes())
        assertEquals(1, tmp.root.listFiles()!!.count { it.name.endsWith(".bin") })
        assertTrue("no temp files left", tmp.root.listFiles()!!.none { it.name.endsWith(".tmp") })
    }

    @Test
    fun rangeReadsGetTheRightBytesAndCacheWhenTheyReachTheEnd() {
        val file = bytes(77_345)
        // An open-ended range (a video seeking) still reads the whole file through: cached.
        for (header in listOf("bytes=0-", "bytes=40000-", "bytes=-500")) {
            val cache = MediaCache(tmp.newFolder(), 1_000_000) { now }
            val range = ByteRange.parse(header, file.size.toLong())!!
            val received = webViewReads(range.body(tee(cache, download, file)), header)
            assertArrayEquals(header, file.copyOfRange(range.start.toInt(), range.end.toInt() + 1), received)
            assertNotNull(header, cache.get(download))
        }
        // A range that stops early is served but not cached (the copy is incomplete).
        val cache = MediaCache(tmp.newFolder(), 1_000_000) { now }
        val range = ByteRange.parse("bytes=1000-1999", file.size.toLong())!!
        assertArrayEquals(file.copyOfRange(1000, 2000), webViewReads(range.body(tee(cache, download, file)), "bytes=1000-1999"))
        assertNull(cache.get(download))
    }

    @Test
    fun aDownloadCutShortIsNotCached() {
        val cache = cache()
        val file = bytes(10_000)
        // The server promised more than it sent.
        val body = TeeInputStream(ByteArrayInputStream(file), cache.writer(download, "image/jpeg", 12_000), 12_000)
        assertEquals(12_000, body.available())
        body.use { it.readBytes() }
        assertNull(cache.get(download))
        // The reader gave up half way (closed).
        val partial = tee(cache, download, file)
        partial.read(ByteArray(4_000))
        partial.close()
        assertNull(cache.get(download))
        assertTrue(tmp.root.listFiles()!!.none { it.name.endsWith(".tmp") })
    }

    @Test
    fun leastRecentlyUsedFilesGoFirst() {
        val cache = cache(max = 120_000)
        val urls = (1..5).map { download.replace("dish.jpg", "d$it.jpg") }
        for (url in urls) {
            now += 1_000
            webViewReads(tee(cache, url, bytes(30_000)), null)
        }
        // Five files of 30 kB in 120 kB: the oldest went.
        assertNull(cache.get(urls[0]))
        for (url in urls.drop(1)) assertNotNull(cache.get(url))
        assertEquals(120_000L, cache.size())
        // Using one keeps it: the next eviction takes the least recently used.
        for (url in listOf(urls[2], urls[3], urls[4], urls[1])) {
            now += 1_000
            cache.get(url)
        }
        now += 1_000
        webViewReads(tee(cache, urls[0], bytes(30_000)), null)
        assertNull(cache.get(urls[2]))
        assertNotNull(cache.get(urls[1]))
        assertNotNull(cache.get(urls[0]))
    }

    @Test
    fun filesTooBigForTheCacheAreStreamedOnly() {
        val cache = cache(max = 100_000)
        assertNull(cache.writer(download, "video/mp4", 30_000)) // more than a quarter
        assertNull(cache.writer(download, "video/mp4", 0))
        val file = bytes(30_000)
        val body = TeeInputStream(ByteArrayInputStream(file), null, file.size.toLong())
        assertArrayEquals(file, webViewReads(body, null))
    }

    @Test
    fun staleTempFilesAreRemovedAtStart() {
        val stale = tmp.newFile("abc-1.tmp").apply { setLastModified(now - 2 * 60 * 60 * 1000) }
        val fresh = tmp.newFile("abc-2.tmp").apply { setLastModified(now) }
        cache()
        assertFalse(stale.exists())
        assertTrue(fresh.exists())
    }

    @Test
    fun keysAreStableHashes() {
        assertEquals(MediaCache.keyOf(download), MediaCache.keyOf(download))
        assertEquals(64, MediaCache.keyOf(download).length)
        assertFalse(MediaCache.keyOf(download) == MediaCache.keyOf("$download&x"))
    }
}
