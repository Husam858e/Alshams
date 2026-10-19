package com.alshams.projectionmenu

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.core.content.ContextCompat
import java.io.ByteArrayOutputStream
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress

/** A restaurant server announced on the LAN (src/services/mdns.js on the server). */
data class FoundServer(val name: String, val host: String, val port: Int) {
    val url: String get() = "http://${NsdText.hostForUrl(host)}:$port"
}

/** [error] is only set when nothing was found and the search itself failed. */
data class DiscoveryResult(val servers: List<FoundServer>, val error: String? = null)

/**
 * Finds projection-menu servers with Android's NSD (mDNS / DNS-SD): browses
 * `_projection-menu._tcp` for a few seconds and resolves every service found
 * to an address and port. Callbacks run on the main thread.
 */
class ServerDiscovery(context: Context) {
    private val appContext = context.applicationContext
    private val nsd: NsdManager? = appContext.getSystemService(NsdManager::class.java)
    private val main = Handler(Looper.getMainLooper())
    private var run: Run? = null

    /** Searches for [timeoutMs]; a request during a running search gets that search's result. */
    fun discover(timeoutMs: Long, onDone: (DiscoveryResult) -> Unit) {
        run?.let {
            it.waiters += onDone
            return
        }
        val manager = nsd ?: return onDone(DiscoveryResult(emptyList(), ERROR_UNAVAILABLE))
        Run(manager, onDone).also { run = it }.start(timeoutMs)
    }

    /** Ends a running search now; its waiters get what was found so far. */
    fun cancel() {
        run?.finish()
    }

    private inner class Run(private val manager: NsdManager, first: (DiscoveryResult) -> Unit) {
        val waiters = mutableListOf(first)
        private val found = LinkedHashMap<String, FoundServer>() // by URL: one entry per server
        private val seen = HashSet<String>() // service names already being resolved
        private val resolver: Resolver = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            CallbackResolver(manager, appContext)
        } else {
            QueueResolver(manager, main)
        }
        private var lock: WifiManager.MulticastLock? = null
        private var browsing = false
        private var stopping = false
        private var done = false
        private var error: String? = null
        private val onTimeout = Runnable { stop() }
        private val onGraceOver = Runnable { finish() }

        // NsdManager calls these on its own thread: everything continues on main.
        private val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) = Unit
            override fun onDiscoveryStopped(serviceType: String) = Unit
            override fun onServiceLost(serviceInfo: NsdServiceInfo) = Unit // a search lasts seconds
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) = Unit

            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.w(TAG, "Discovery failed to start ($errorCode)")
                main.post {
                    browsing = false
                    error = ERROR_FAILED
                    finish()
                }
            }

            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                main.post { onFound(serviceInfo) }
            }
        }

        fun start(timeoutMs: Long) {
            lock = acquireMulticastLock()
            try {
                manager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
                browsing = true
            } catch (e: RuntimeException) {
                Log.w(TAG, "discoverServices refused", e)
                error = ERROR_FAILED
                return finish()
            }
            main.postDelayed(onTimeout, timeoutMs)
        }

        private fun onFound(info: NsdServiceInfo) {
            if (done || stopping || !seen.add(info.serviceName)) return
            val name = NsdText.decodeName(info.serviceName)
            resolver.resolve(info) { resolved -> onResolved(name, resolved) }
        }

        private fun onResolved(name: String, info: NsdServiceInfo?) {
            if (done) return
            val host = info?.let { NsdText.pickHost(addressesOf(it)) }
            if (info != null && host != null && info.port > 0) {
                val server = FoundServer(name, host, info.port)
                found.putIfAbsent(server.url, server)
            }
            if (stopping && resolver.idle) finish()
        }

        // Time is up: stop browsing, but give resolutions in flight a moment.
        private fun stop() {
            stopping = true
            stopBrowsing()
            if (resolver.idle) finish() else main.postDelayed(onGraceOver, GRACE_MS)
        }

        fun finish() {
            if (done) return
            done = true
            main.removeCallbacks(onTimeout)
            main.removeCallbacks(onGraceOver)
            stopBrowsing()
            resolver.cancelAll()
            try {
                lock?.release()
            } catch (e: RuntimeException) {
                Log.w(TAG, "Multicast lock release failed", e)
            }
            if (run === this) run = null
            val result = DiscoveryResult(found.values.toList(), error.takeIf { found.isEmpty() })
            waiters.forEach { it(result) }
        }

        private fun stopBrowsing() {
            if (!browsing) return
            browsing = false
            try {
                manager.stopServiceDiscovery(listener)
            } catch (e: RuntimeException) {
                Log.w(TAG, "stopServiceDiscovery failed", e) // e.g. it never really started
            }
        }
    }

    // Wi-Fi drivers may filter multicast to save power; mDNS answers are multicast.
    private fun acquireMulticastLock(): WifiManager.MulticastLock? = try {
        appContext.getSystemService(WifiManager::class.java)?.createMulticastLock(TAG)?.apply {
            setReferenceCounted(false)
            acquire()
        }
    } catch (e: RuntimeException) {
        Log.w(TAG, "No multicast lock", e)
        null
    }

    @Suppress("DEPRECATION") // NsdServiceInfo.host is the only address before API 34
    private fun addressesOf(info: NsdServiceInfo): List<InetAddress> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) info.hostAddresses else listOfNotNull(info.host)

    private interface Resolver {
        /** True when no resolution is queued or running. */
        val idle: Boolean

        /** [done] gets the resolved service, or null when it could not be resolved. */
        fun resolve(info: NsdServiceInfo, done: (NsdServiceInfo?) -> Unit)

        fun cancelAll()
    }

    /** Before API 34: resolveService, which only allows one resolution at a time. */
    private class QueueResolver(private val manager: NsdManager, private val main: Handler) : Resolver {
        private val queue = ArrayDeque<Pair<NsdServiceInfo, (NsdServiceInfo?) -> Unit>>()
        private var active = false
        private var cancelled = false

        override val idle: Boolean get() = !active && queue.isEmpty()

        override fun resolve(info: NsdServiceInfo, done: (NsdServiceInfo?) -> Unit) {
            queue.addLast(info to done)
            next()
        }

        override fun cancelAll() {
            cancelled = true
            queue.clear()
        }

        private fun next() {
            if (active || cancelled) return
            val (info, done) = queue.removeFirstOrNull() ?: return
            active = true
            start(info, done, attempt = 0)
        }

        @Suppress("DEPRECATION") // replaced by registerServiceInfoCallback on API 34+
        private fun start(info: NsdServiceInfo, done: (NsdServiceInfo?) -> Unit, attempt: Int) {
            val listener = object : NsdManager.ResolveListener {
                override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                    main.post { complete(done, serviceInfo) }
                }

                override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                    main.post {
                        // Another resolution (ours or another app's) is running: retry shortly.
                        if (errorCode == NsdManager.FAILURE_ALREADY_ACTIVE && attempt < MAX_RETRIES && !cancelled) {
                            main.postDelayed({ start(info, done, attempt + 1) }, RETRY_MS)
                        } else {
                            complete(done, null)
                        }
                    }
                }
            }
            try {
                manager.resolveService(info, listener)
            } catch (e: RuntimeException) {
                Log.w(TAG, "resolveService refused", e)
                complete(done, null)
            }
        }

        private fun complete(done: (NsdServiceInfo?) -> Unit, info: NsdServiceInfo?) {
            active = false
            if (cancelled) return
            done(info)
            next()
        }
    }

    /** API 34+: one ServiceInfoCallback per service, dropped after its first address. */
    @RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    private class CallbackResolver(private val manager: NsdManager, context: Context) : Resolver {
        private val executor = ContextCompat.getMainExecutor(context)
        private val pending = HashMap<NsdManager.ServiceInfoCallback, (NsdServiceInfo?) -> Unit>()

        override val idle: Boolean get() = pending.isEmpty()

        override fun resolve(info: NsdServiceInfo, done: (NsdServiceInfo?) -> Unit) {
            val callback = object : NsdManager.ServiceInfoCallback {
                override fun onServiceInfoCallbackRegistrationFailed(errorCode: Int) {
                    complete(this, null, registered = false)
                }

                override fun onServiceUpdated(serviceInfo: NsdServiceInfo) {
                    if (serviceInfo.hostAddresses.isNotEmpty()) complete(this, serviceInfo, registered = true)
                }

                override fun onServiceLost() = Unit
                override fun onServiceInfoCallbackUnregistered() = Unit
            }
            pending[callback] = done
            try {
                manager.registerServiceInfoCallback(info, executor, callback)
            } catch (e: RuntimeException) {
                Log.w(TAG, "registerServiceInfoCallback refused", e)
                complete(callback, null, registered = false)
            }
        }

        override fun cancelAll() {
            val callbacks = pending.keys.toList()
            pending.clear()
            callbacks.forEach(::unregister)
        }

        private fun complete(callback: NsdManager.ServiceInfoCallback, info: NsdServiceInfo?, registered: Boolean) {
            val done = pending.remove(callback) ?: return
            if (registered) unregister(callback)
            done(info)
        }

        private fun unregister(callback: NsdManager.ServiceInfoCallback) {
            try {
                manager.unregisterServiceInfoCallback(callback)
            } catch (e: RuntimeException) {
                Log.w(TAG, "unregisterServiceInfoCallback failed", e) // e.g. registration failed
            }
        }
    }

    companion object {
        /** Advertised by the server with bonjour-service as type "projection-menu". */
        const val SERVICE_TYPE = "_projection-menu._tcp"
        const val DEFAULT_TIMEOUT_MS = 4_000L
        const val MIN_TIMEOUT_MS = 1_000L
        const val MAX_TIMEOUT_MS = 15_000L
        private const val GRACE_MS = 1_500L
        private const val RETRY_MS = 250L
        private const val MAX_RETRIES = 8
        private const val TAG = "ServerDiscovery"
        const val ERROR_UNAVAILABLE = "البحث التلقائي غير متاح على هذا الجهاز — اكتب عنوان الخادم يدوياً"
        const val ERROR_FAILED = "تعذّر البحث في الشبكة — تأكد من اتصال الواي فاي أو اكتب العنوان يدوياً"
    }
}

/** Pure helpers for discovery results (unit-tested on the JVM). */
object NsdText {
    private const val BACKSLASH = '\\'

    /**
     * Some Android versions hand service names over in DNS presentation form:
     * "\032" for a space and "\216\133" for the UTF-8 bytes of Arabic letters.
     */
    fun decodeName(raw: String): String {
        if (BACKSLASH !in raw) return raw
        val bytes = ByteArrayOutputStream()
        var i = 0
        while (i < raw.length) {
            val c = raw[i]
            val escaped = if (c == BACKSLASH && i + 1 < raw.length) raw.substring(i + 1) else null
            val decimal = escaped?.take(3)?.takeIf { it.length == 3 && it.all(Char::isDigit) }?.toInt()
            when {
                decimal != null && decimal <= 255 -> {
                    bytes.write(decimal)
                    i += 4
                }
                escaped != null -> { // "\." and "\\" stand for the character itself
                    val next = raw.codePointAt(i + 1)
                    bytes.write(String(Character.toChars(next)).toByteArray(Charsets.UTF_8))
                    i += 1 + Character.charCount(next)
                }
                else -> {
                    val cp = raw.codePointAt(i)
                    bytes.write(String(Character.toChars(cp)).toByteArray(Charsets.UTF_8))
                    i += Character.charCount(cp)
                }
            }
        }
        return bytes.toString(Charsets.UTF_8.name())
    }

    /** The address to reach a server at: IPv4 first (what LANs use), then a routable IPv6. */
    fun pickHost(addresses: List<InetAddress>): String? {
        val usable = addresses.filterNot { it.isAnyLocalAddress }
        val ipv4 = usable.filterIsInstance<Inet4Address>()
        val address = ipv4.firstOrNull { !it.isLoopbackAddress }
            ?: usable.filterIsInstance<Inet6Address>().firstOrNull { !it.isLinkLocalAddress && !it.isLoopbackAddress }
            ?: ipv4.firstOrNull()
        return address?.hostAddress?.substringBefore('%')
    }

    /** IPv6 literals need brackets inside a URL. */
    fun hostForUrl(host: String): String = if (':' in host && !host.startsWith("[")) "[$host]" else host
}
