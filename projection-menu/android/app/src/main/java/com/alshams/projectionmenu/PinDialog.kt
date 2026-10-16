package com.alshams.projectionmenu

import android.app.Activity
import android.content.DialogInterface
import android.os.Build
import android.os.SystemClock
import android.text.InputFilter
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.Toast
import androidx.appcompat.app.AlertDialog

/** Native numeric PIN prompt that guards settings in the kiosk modes. */
class PinDialog(private val activity: Activity, private val checkPin: (String) -> Boolean) {
    private var dialog: AlertDialog? = null
    private var failures = 0
    private var lockedUntil = 0L

    /** Calls [onSuccess] after a correct PIN; cancelling just closes the dialog. */
    fun ask(onSuccess: () -> Unit) {
        if (dialog?.isShowing == true) return
        if (SystemClock.elapsedRealtime() < lockedUntil) {
            Toast.makeText(activity, R.string.pin_locked, Toast.LENGTH_LONG).show()
            return
        }

        val input = EditText(activity).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            filters = arrayOf(InputFilter.LengthFilter(8))
            gravity = Gravity.CENTER
            textDirection = View.TEXT_DIRECTION_LTR
            imeOptions = EditorInfo.IME_ACTION_DONE
            isSingleLine = true
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
        }
        val padding = (24 * activity.resources.displayMetrics.density).toInt()
        val frame = FrameLayout(activity).apply {
            setPadding(padding, padding / 3, padding, 0)
            addView(input)
        }
        val created = AlertDialog.Builder(activity)
            .setTitle(R.string.pin_title)
            .setMessage(R.string.pin_message)
            .setView(frame)
            .setPositiveButton(R.string.pin_confirm, null)
            .setNegativeButton(R.string.cancel, null)
            .create()

        fun submit() {
            if (checkPin(input.text.toString())) {
                failures = 0
                created.dismiss()
                onSuccess()
                return
            }
            input.text.clear()
            if (++failures >= MAX_FAILURES) {
                failures = 0
                lockedUntil = SystemClock.elapsedRealtime() + LOCKOUT_MS
                created.dismiss()
                Toast.makeText(activity, R.string.pin_locked, Toast.LENGTH_LONG).show()
            } else {
                input.error = activity.getString(R.string.pin_wrong)
            }
        }

        // Replace the default click handler so a wrong PIN keeps the dialog open.
        created.setOnShowListener {
            created.getButton(DialogInterface.BUTTON_POSITIVE).setOnClickListener { submit() }
            input.requestFocus()
        }
        input.setOnEditorActionListener { _, actionId, _ ->
            (actionId == EditorInfo.IME_ACTION_DONE).also { if (it) submit() }
        }
        created.setOnDismissListener { dialog = null }
        created.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
        dialog = created
        created.show()
    }

    fun dismiss() {
        dialog?.dismiss()
    }

    private companion object {
        const val MAX_FAILURES = 5
        const val LOCKOUT_MS = 60_000L
    }
}
