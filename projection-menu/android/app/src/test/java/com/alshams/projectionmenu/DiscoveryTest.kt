package com.alshams.projectionmenu

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.net.InetAddress

class DiscoveryTest {
    // Literal addresses only: InetAddress.getByName never touches DNS for them.
    private fun addresses(vararg literals: String) = literals.map(InetAddress::getByName)

    @Test
    fun namesPassThroughUnlessEscaped() {
        assertEquals("مطعم الشمس", NsdText.decodeName("مطعم الشمس"))
        assertEquals("Alshams", NsdText.decodeName("Alshams"))
    }

    @Test
    fun decodesDnsEscapes() {
        assertEquals("Alshams Cafe", NsdText.decodeName("Alshams\\032Cafe"))
        assertEquals("a.b\\c", NsdText.decodeName("a\\.b\\\\c"))
        // "مطعم" as escaped UTF-8 bytes, as some resolvers report it.
        val escaped = "مطعم".toByteArray(Charsets.UTF_8).joinToString("") { "\\%03d".format(it.toInt() and 0xFF) }
        assertEquals("مطعم الشمس", NsdText.decodeName("$escaped\\032الشمس"))
        assertEquals("trailing\\", NsdText.decodeName("trailing\\"))
    }

    @Test
    fun prefersLanIpv4Addresses() {
        assertEquals("192.168.1.10", NsdText.pickHost(addresses("fe80::1", "192.168.1.10")))
        assertEquals("192.168.1.10", NsdText.pickHost(addresses("127.0.0.1", "192.168.1.10")))
        // Java spells IPv6 out in full; brackets make it a valid URL host either way.
        assertEquals("fd00:0:0:0:0:0:0:5", NsdText.pickHost(addresses("fe80::1", "fd00::5")))
        assertEquals("127.0.0.1", NsdText.pickHost(addresses("fe80::1", "127.0.0.1")))
        assertNull(NsdText.pickHost(addresses("fe80::1")))
        assertNull(NsdText.pickHost(addresses("0.0.0.0")))
        assertNull(NsdText.pickHost(emptyList()))
    }

    @Test
    fun serverUrls() {
        assertEquals("http://192.168.1.10:3000", FoundServer("مطعم الشمس", "192.168.1.10", 3000).url)
        assertEquals("http://[fd00::5]:3000", FoundServer("x", "fd00::5", 3000).url)
        assertEquals("[fd00::5]", NsdText.hostForUrl("[fd00::5]"))
        assertEquals(PairingLink.Valid(AppMode.APP, "http://192.168.1.10:3000/app/"), PairingLink.parse(FoundServer("x", "192.168.1.10", 3000).url))
    }

    @Test
    fun serviceTypeMatchesTheServerAdvertisement() {
        // src/services/mdns.js publishes type 'projection-menu' over TCP; DNS-SD labels are <= 15 chars.
        assertEquals("_projection-menu._tcp", ServerDiscovery.SERVICE_TYPE)
        assertEquals(15, "projection-menu".length)
    }
}
