package com.alshams.projectionmenu

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.InputStream

class HelpersTest {
    private val mimeMap = mapOf("png" to "image/png", "jpg" to "image/jpeg", "jpeg" to "image/jpeg", "mp4" to "video/mp4")

    @Test
    fun acceptListsBecomeMimeTypes() {
        assertArrayEquals(arrayOf("image/png", "image/jpeg"), AcceptTypes.toMimeTypes(arrayOf(".png,.jpg,.jpeg"), mimeMap::get))
        assertArrayEquals(arrayOf("image/*", "video/mp4"), AcceptTypes.toMimeTypes(arrayOf("image/*", " .MP4 "), mimeMap::get))
    }

    @Test
    fun unknownOrEmptyAcceptListsAllowAnyFile() {
        assertNull(AcceptTypes.toMimeTypes(arrayOf(".mp4,.glb"), mimeMap::get))
        assertNull(AcceptTypes.toMimeTypes(arrayOf(""), mimeMap::get))
        assertNull(AcceptTypes.toMimeTypes(null, mimeMap::get))
        assertNull(AcceptTypes.toMimeTypes(arrayOf("video"), mimeMap::get))
    }

    @Test
    fun parsesSingleByteRanges() {
        assertEquals(ByteRange(0, 999), ByteRange.parse("bytes=0-", 1_000))
        assertEquals(ByteRange(100, 199), ByteRange.parse("bytes=100-199", 1_000))
        assertEquals(ByteRange(900, 999), ByteRange.parse("bytes=900-5000", 1_000))
        assertEquals(ByteRange(800, 999), ByteRange.parse("bytes=-200", 1_000))
        assertEquals(ByteRange(0, 999), ByteRange.parse("bytes=-5000", 1_000))
        assertEquals(ByteRange(5, 5), ByteRange.parse("Bytes = 5-5", 1_000))
        assertEquals(100L, ByteRange(100, 199).length)
    }

    @Test
    fun otherRangesServeTheWholeFile() {
        assertNull(ByteRange.parse(null, 1_000))
        assertNull(ByteRange.parse("bytes=1000-", 1_000))
        assertNull(ByteRange.parse("bytes=200-100", 1_000))
        assertNull(ByteRange.parse("bytes=0-1,5-9", 1_000))
        assertNull(ByteRange.parse("bytes=-", 1_000))
        assertNull(ByteRange.parse("bytes=-0", 1_000))
        assertNull(ByteRange.parse("items=0-1", 1_000))
        assertNull(ByteRange.parse("bytes=0-", 0))
    }

    // What WebView does with an intercepted response to a Range request
    // (InputStreamReader::Seek): size = available(), bounds from the Range
    // header, skip(first byte), then read until the stream ends.
    private fun webViewReads(body: InputStream, rangeHeader: String): ByteArray {
        val size = body.available().toLong()
        val bounds = ByteRange.parse(rangeHeader, size) ?: error("WebView: range not satisfiable for size $size")
        var toSkip = bounds.start
        while (toSkip > 0) {
            val skipped = body.skip(toSkip)
            assertTrue("skip made no progress", skipped > 0)
            toSkip -= skipped
        }
        return body.readBytes()
    }

    @Test
    fun rangeBodiesAreSkippedByWebViewOnlyOnce() {
        val file = ByteArray(77_345) { (it * 31 + it / 256).toByte() }
        for (header in listOf("bytes=0-", "bytes=32768-", "bytes=40000-", "bytes=77344-", "bytes=1000-1999", "bytes=-500", "bytes=70000-99999")) {
            val range = ByteRange.parse(header, file.size.toLong())!!
            val received = webViewReads(range.body(ByteArrayInputStream(file)), header)
            val expected = file.copyOfRange(range.start.toInt(), range.end.toInt() + 1)
            assertArrayEquals(header, expected, received)
            assertEquals(header, range.length, received.size.toLong())
        }
        assertEquals("bytes 32768-77344/77345", ByteRange(32768, 77344).contentRange(77_345))
    }

    @Test
    fun folderUrlsServeTheirIndexPage() {
        assertEquals("/player/index.html", LocalContent.indexPath("/player/"))
        assertEquals("/app/index.html", LocalContent.indexPath("/app/"))
        assertEquals("/app/setup.html", LocalContent.indexPath("/app/setup.html"))
        assertEquals("/vendor/three/build/three.module.js", LocalContent.indexPath("/vendor/three/build/three.module.js"))
    }

    @Test
    fun readsTheWebViewMajorVersion() {
        assertEquals(124, DeviceInfo.webViewMajor("124.0.6367.82"))
        assertEquals(89, DeviceInfo.webViewMajor("89"))
        assertNull(DeviceInfo.webViewMajor(""))
        assertNull(DeviceInfo.webViewMajor(null))
        assertNull(DeviceInfo.webViewMajor("beta"))
    }
}
