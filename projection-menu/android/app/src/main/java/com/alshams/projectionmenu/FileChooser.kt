package com.alshams.projectionmenu

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.webkit.MimeTypeMap
import android.webkit.ValueCallback
import android.webkit.WebChromeClient.FileChooserParams
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts

/** Backs `<input type="file">` (the staff app's media uploads) with the system file picker. */
class FileChooser(activity: ComponentActivity) {
    private var pending: ValueCallback<Array<Uri>>? = null

    // Registered at construction: the activity must create this before it is started.
    private val launcher = activity.registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        pending?.onReceiveValue(parseResult(result.resultCode, result.data))
        pending = null
    }

    /** Always invokes [callback] eventually, so it always returns true. */
    fun show(callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
        cancel()
        val intent = params.createIntent().apply {
            // createIntent() uses the first accept entry as the MIME type, which breaks
            // extension lists such as ".mp4,.webm,.glb": filter by real MIME types instead.
            val mimeTypes = AcceptTypes.toMimeTypes(params.acceptTypes) {
                MimeTypeMap.getSingleton().getMimeTypeFromExtension(it)
            }
            type = mimeTypes?.singleOrNull() ?: "*/*"
            if (mimeTypes != null && mimeTypes.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes)
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
        }
        pending = callback
        try {
            launcher.launch(intent)
        } catch (_: ActivityNotFoundException) {
            cancel()
        }
        return true
    }

    /** Resolves a pending chooser with "nothing selected" (e.g. the WebView is going away). */
    fun cancel() {
        pending?.onReceiveValue(null)
        pending = null
    }

    private fun parseResult(resultCode: Int, data: Intent?): Array<Uri>? {
        if (resultCode != Activity.RESULT_OK) return null
        // FileChooserParams.parseResult only reads getData(); multiple picks arrive as ClipData.
        val clip = data?.clipData
        if (clip != null && clip.itemCount > 0) {
            return (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).uri }.toTypedArray()
        }
        return FileChooserParams.parseResult(resultCode, data)
    }
}

object AcceptTypes {
    /**
     * MIME types for an `accept` list (extensions such as ".png,.jpg" or MIME types),
     * or null when the list is empty or has an entry with no known MIME type (then
     * any file is allowed).
     */
    fun toMimeTypes(accept: Array<String>?, mimeForExtension: (String) -> String?): Array<String>? {
        val entries = accept.orEmpty()
            .flatMap { it.split(',') }
            .map { it.trim().lowercase() }
            .filter { it.isNotEmpty() }
        if (entries.isEmpty()) return null
        val mimeTypes = entries.map { entry ->
            when {
                entry.startsWith('.') -> mimeForExtension(entry.substring(1))
                '/' in entry -> entry
                else -> null
            } ?: return null
        }
        return mimeTypes.distinct().toTypedArray()
    }
}
