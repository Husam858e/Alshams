package com.alshams.projectionmenu

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Reopens a configured device after a reboot. Android 10+ blocks activity starts
 * from the background unless the app is the default launcher (see LauncherAlias)
 * or similarly exempt, so this mainly helps older TV boxes; failures are ignored.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in BOOT_ACTIONS) return
        if (ConfigStore(context).load() == null) return
        val launch = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(launch)
        } catch (e: RuntimeException) {
            Log.w("BootReceiver", "Autostart not allowed on this device", e)
        }
    }

    private companion object {
        // QUICKBOOT_POWERON: "fast boot" on some HTC / Android TV box firmwares.
        val BOOT_ACTIONS = setOf(Intent.ACTION_BOOT_COMPLETED, "android.intent.action.QUICKBOOT_POWERON")
    }
}
