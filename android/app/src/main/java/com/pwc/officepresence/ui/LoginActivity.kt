package com.pwc.officepresence.ui

import android.content.Intent
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import com.pwc.officepresence.BuildConfig
import com.pwc.officepresence.R
import com.pwc.officepresence.data.ApiClient
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.ok
import com.pwc.officepresence.notify.Notifier
import kotlin.concurrent.thread

class LoginActivity : AppCompatActivity() {
    private lateinit var prefs: AppPrefs

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        prefs = AppPrefs(this)
        prefs.applyTheme()
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) Notifier.playLaunchSound(this)
        if (!prefs.token.isNullOrBlank()) {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
            return
        }
        setContentView(R.layout.activity_login)
        val email = findViewById<TextInputEditText>(R.id.email)
        val code = findViewById<TextInputEditText>(R.id.code)
        val status = findViewById<TextView>(R.id.status)
        prefs.email?.let { email.setText(it) }

        findViewById<MaterialButton>(R.id.sendCode).setOnClickListener {
            status.text = "Sending code to Teams..."
            thread {
                try {
                    val api = ApiClient(BuildConfig.API_BASE_URL) { null }
                    val res = api.requestOtp(email.text?.toString()?.trim().orEmpty())
                    runOnUiThread {
                        status.text = res.optString("message", res.optString("error", "Sent"))
                    }
                } catch (e: Exception) {
                    runOnUiThread { status.text = e.message }
                }
            }
        }

        findViewById<MaterialButton>(R.id.verify).setOnClickListener {
            status.text = "Verifying..."
            thread {
                try {
                    val api = ApiClient(BuildConfig.API_BASE_URL) { null }
                    val res = api.verifyOtp(
                        email.text?.toString()?.trim().orEmpty(),
                        code.text?.toString()?.trim().orEmpty(),
                        prefs.installId,
                        prefs.deviceName,
                    )
                    val token = res.optString("token")
                    if (res.ok() && token.isNotBlank()) {
                        prefs.token = token
                        prefs.email = email.text?.toString()?.trim()
                        res.optString("deviceId", "").takeIf { it.isNotBlank() }?.let { prefs.deviceId = it }
                        runOnUiThread {
                            startActivity(Intent(this, MainActivity::class.java))
                            finish()
                        }
                    } else {
                        runOnUiThread { status.text = res.optString("error", "Verify failed") }
                    }
                } catch (e: Exception) {
                    runOnUiThread { status.text = e.message }
                }
            }
        }
    }
}
