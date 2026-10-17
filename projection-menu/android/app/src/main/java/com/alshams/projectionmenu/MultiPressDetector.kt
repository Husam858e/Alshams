package com.alshams.projectionmenu

/** Fires when [count] presses land within [windowMs] (hidden settings taps, triple BACK). */
class MultiPressDetector(private val count: Int, private val windowMs: Long) {
    private val times = ArrayDeque<Long>()

    /** Records a press at [nowMs]; true when this press completes the sequence. */
    fun press(nowMs: Long): Boolean {
        times.addLast(nowMs)
        while (nowMs - times.first() > windowMs) times.removeFirst()
        if (times.size < count) return false
        times.clear()
        return true
    }

    fun reset() = times.clear()
}

/** The hidden settings corner: top-left, max(72dp, 12%) of each side. */
object SettingsCorner {
    private const val MIN_DP = 72f
    private const val FRACTION = 0.12f

    fun contains(x: Float, y: Float, width: Int, height: Int, density: Float): Boolean {
        if (x < 0 || y < 0) return false
        val minPx = MIN_DP * density
        return x <= maxOf(minPx, width * FRACTION) && y <= maxOf(minPx, height * FRACTION)
    }
}
