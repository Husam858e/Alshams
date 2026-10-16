package com.alshams.projectionmenu

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

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

    @Test
    fun readsTheWebViewMajorVersion() {
        assertEquals(124, DeviceInfo.webViewMajor("124.0.6367.82"))
        assertEquals(89, DeviceInfo.webViewMajor("89"))
        assertNull(DeviceInfo.webViewMajor(""))
        assertNull(DeviceInfo.webViewMajor(null))
        assertNull(DeviceInfo.webViewMajor("beta"))
    }
}
