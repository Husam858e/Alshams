package com.alshams.projectionmenu

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WebUrlTest {
    @Test
    fun splitsAnAbsoluteUrl() {
        val url = WebUrl.parse("HTTP://Host.Lan:3000/tablet/?table=T01&key=k#top")!!
        assertEquals("http", url.scheme)
        assertEquals("Host.Lan", url.host)
        assertEquals(3000, url.port)
        assertEquals("/tablet/", url.path)
        assertEquals("table=T01&key=k", url.query)
        assertFalse(url.hasUserInfo)
    }

    @Test
    fun originIgnoresUserInfo() {
        val url = WebUrl.parse("http://trusted.lan@evil.example:8080/")!!
        assertTrue(url.hasUserInfo)
        assertEquals("http://evil.example:8080", url.origin)
    }

    @Test
    fun originSpellsOutDefaultPorts() {
        assertEquals("http://host:80", WebUrl.parse("http://HOST/x")!!.origin)
        assertEquals(WebUrl.parse("http://host:80/a")!!.origin, WebUrl.parse("http://host/b")!!.origin)
        assertEquals("https://h:443", WebUrl.parse("https://h")!!.origin)
        assertTrue(WebUrl.parse("http://h:3000")!!.origin != WebUrl.parse("http://h:3001")!!.origin)
    }

    @Test
    fun recognisesBundledPages() {
        assertTrue(WebUrl.parse("https://appassets.androidplatform.net/app/setup.html")!!.isLocal)
        assertTrue(WebUrl.parse("https://APPASSETS.androidplatform.net:443/demo/")!!.isLocal)
        assertFalse(WebUrl.parse("http://appassets.androidplatform.net/app/setup.html")!!.isLocal)
        assertFalse(WebUrl.parse("https://appassets.androidplatform.net.evil.com/")!!.isLocal)
    }

    @Test
    fun readsQueryParams() {
        val url = WebUrl.parse("http://h/?a=1&b=x%20y&c&d=%E2%9C%93&bad=%zz&a=2")!!
        assertEquals("1", url.queryParam("a"))
        assertEquals("x y", url.queryParam("b"))
        assertEquals("", url.queryParam("c"))
        assertEquals("✓", url.queryParam("d"))
        assertEquals("%zz", url.queryParam("bad"))
        assertNull(url.queryParam("missing"))
        assertNull(WebUrl.parse("http://h/")!!.queryParam("a"))
    }

    @Test
    fun rejectsNonUrls() {
        assertNull(WebUrl.parse("about:blank"))
        assertNull(WebUrl.parse("not a url"))
        assertNull(WebUrl.parse("http://h:0/"))
        assertNull(WebUrl.parse("http://a:1:2/"))
    }

    @Test
    fun encodesLikeEncodeUriComponent() {
        assertEquals(
            "http%3A%2F%2Fh%3A3000%2Ftablet%2F%3Ftable%3DT01%26key%3Dk",
            WebUrl.encodeComponent("http://h:3000/tablet/?table=T01&key=k"),
        )
        assertEquals("a-_.!~*'()b%20%D8%B7", WebUrl.encodeComponent("a-_.!~*'()b ط"))
    }
}
