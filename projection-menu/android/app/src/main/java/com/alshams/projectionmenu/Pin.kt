package com.alshams.projectionmenu

import java.security.MessageDigest
import java.security.SecureRandom

/** Settings PIN rules. Only a salted SHA-256 hash of the PIN is ever stored. */
object Pin {
    const val ERROR_FORMAT = "رمز PIN يجب أن يكون من 4 إلى 8 أرقام"

    private val FORMAT = Regex("^[0-9]{4,8}$")
    private const val HEX = "0123456789abcdef"

    /** Arabic-Indic keyboards type ٠-٩ (or ۰-۹); treat them as 0-9. */
    fun normalize(pin: String): String = buildString {
        for (c in pin.trim()) {
            append(
                when (c) {
                    in '٠'..'٩' -> '0' + (c - '٠')
                    in '۰'..'۹' -> '0' + (c - '۰')
                    else -> c
                },
            )
        }
    }

    fun isValid(pin: String): Boolean = FORMAT.matches(pin)

    fun hash(pin: String, salt: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest("$salt:$pin".toByteArray(Charsets.UTF_8))
        return hex(digest)
    }

    /** Constant-time comparison against a stored hash. */
    fun matches(pin: String, salt: String, storedHash: String): Boolean =
        MessageDigest.isEqual(hash(normalize(pin), salt).toByteArray(), storedHash.toByteArray())

    fun newSalt(): String = hex(ByteArray(16).also { SecureRandom().nextBytes(it) })

    private fun hex(bytes: ByteArray): String = buildString(bytes.size * 2) {
        for (b in bytes) {
            val v = b.toInt() and 0xFF
            append(HEX[v shr 4]).append(HEX[v and 0xF])
        }
    }
}
