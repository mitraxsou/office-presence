package com.pwc.officepresence.ui

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.activity.compose.setContent
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.pwc.officepresence.BuildConfig
import com.pwc.officepresence.data.ApiClient
import com.pwc.officepresence.data.AppPrefs
import com.pwc.officepresence.data.ok
import com.pwc.officepresence.notify.Notifier
import com.pwc.officepresence.ui.compose.OpFormat
import com.pwc.officepresence.ui.compose.OpPrimaryButton
import com.pwc.officepresence.ui.compose.Wordmark
import com.pwc.officepresence.ui.theme.LocalOpPalette
import com.pwc.officepresence.ui.theme.OfficePresenceTheme
import com.pwc.officepresence.ui.theme.OpColor
import com.pwc.officepresence.ui.theme.OpShape
import com.pwc.officepresence.ui.theme.OpType
import kotlinx.coroutines.delay
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
            startActivity(Intent(this, ShellActivity::class.java))
            finish()
            return
        }
        val forcedMessage = prefs.pendingSignInMessage.takeIf { it.isNotBlank() }
        if (forcedMessage != null) prefs.pendingSignInMessage = ""
        setContent {
            val dark = when (prefs.themeMode) {
                "dark" -> true
                "light" -> false
                else -> androidx.compose.foundation.isSystemInDarkTheme()
            }
            OfficePresenceTheme(dark = dark) {
                LoginScreen(
                    prefs = prefs,
                    forcedSignOutMessage = forcedMessage,
                    onSignedIn = {
                        startActivity(Intent(this, ShellActivity::class.java))
                        finish()
                    },
                )
            }
        }
    }
}

private enum class LoginStep { Email, Code, Password }

@Composable
private fun LoginScreen(
    prefs: AppPrefs,
    onSignedIn: () -> Unit,
    forcedSignOutMessage: String? = null,
) {
    val p = LocalOpPalette.current
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val main = remember { Handler(Looper.getMainLooper()) }
    var step by remember { mutableStateOf(LoginStep.Email) }
    var email by remember { mutableStateOf(prefs.email.orEmpty()) }
    var password by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var verifying by remember { mutableStateOf(false) }
    var errorTitle by remember { mutableStateOf<String?>(null) }
    var errorBody by remember { mutableStateOf<String?>(null) }
    var triesLeft by remember { mutableIntStateOf(5) }
    var resendSeconds by remember { mutableIntStateOf(0) }
    var banner by remember { mutableStateOf(forcedSignOutMessage) }
    val emailOk = OpFormat.emailValid(email)

    LaunchedEffect(resendSeconds) {
        if (resendSeconds > 0) {
            delay(1000)
            resendSeconds -= 1
        }
    }

    fun requestCode() {
        if (!emailOk || sending) return
        sending = true
        errorTitle = null
        errorBody = null
        thread {
            try {
                val res = ApiClient(BuildConfig.API_BASE_URL) { null }.requestOtp(email.trim())
                main.post {
                    sending = false
                    if (res.ok()) {
                        step = LoginStep.Code
                        code = ""
                        resendSeconds = 45
                        errorTitle = null
                        errorBody = null
                    } else {
                        errorTitle = "Could not send code"
                        errorBody = res.optString("error", "Try again in a moment.")
                    }
                }
            } catch (e: Exception) {
                main.post {
                    sending = false
                    errorTitle = "Could not send code"
                    errorBody = e.message ?: "Check your connection."
                }
            }
        }
    }

    fun verifyCode() {
        if (code.length != 6 || verifying) return
        verifying = true
        errorTitle = null
        errorBody = null
        thread {
            try {
                val res = ApiClient(BuildConfig.API_BASE_URL) { null }.verifyOtp(
                    email.trim(),
                    code,
                    prefs.installId,
                    prefs.deviceName,
                )
                val token = res.optString("token")
                main.post {
                    verifying = false
                    if (res.ok() && token.isNotBlank()) {
                        prefs.token = token
                        prefs.email = email.trim()
                        res.optString("deviceId", "").takeIf { it.isNotBlank() }?.let { prefs.deviceId = it }
                        com.pwc.officepresence.ui.analytics.OpAnalytics.log(
                            ctx,
                            "sign_in_success",
                            mapOf("method" to "otp"),
                        )
                        com.pwc.officepresence.notify.FcmTokenSync.refreshAndUpload(ctx)
                        onSignedIn()
                    } else {
                        triesLeft = (triesLeft - 1).coerceAtLeast(0)
                        errorTitle = "That code did not match"
                        errorBody = if (triesLeft > 0) {
                            "$triesLeft tries left. After that, wait 10 minutes."
                        } else {
                            "Wait 10 minutes, then try again."
                        }
                    }
                }
            } catch (e: Exception) {
                main.post {
                    verifying = false
                    errorTitle = "That code did not match"
                    errorBody = e.message ?: "Try again."
                }
            }
        }
    }

    fun signInWithPassword() {
        if (!emailOk || password.isEmpty() || verifying) return
        verifying = true
        errorTitle = null
        errorBody = null
        thread {
            try {
                val res = ApiClient(BuildConfig.API_BASE_URL) { null }.loginWithPassword(
                    email.trim(),
                    password,
                    prefs.installId,
                    prefs.deviceName,
                )
                val token = res.optString("token")
                main.post {
                    verifying = false
                    if (res.ok() && token.isNotBlank()) {
                        prefs.token = token
                        prefs.email = email.trim()
                        res.optString("deviceId", "").takeIf { it.isNotBlank() }?.let { prefs.deviceId = it }
                        com.pwc.officepresence.ui.analytics.OpAnalytics.log(
                            ctx,
                            "sign_in_success",
                            mapOf("method" to "password"),
                        )
                        com.pwc.officepresence.notify.FcmTokenSync.refreshAndUpload(ctx)
                        onSignedIn()
                    } else {
                        errorTitle = "Could not sign in"
                        errorBody = res.optString("error", "Email or password is incorrect")
                    }
                }
            } catch (e: Exception) {
                main.post {
                    verifying = false
                    errorTitle = "Could not sign in"
                    errorBody = e.message ?: "Check your connection."
                }
            }
        }
    }

    Box(Modifier.fillMaxSize().background(p.bg).padding(20.dp)) {
        when (step) {
            LoginStep.Email -> Column(Modifier.fillMaxSize()) {
                Wordmark()
                Spacer(Modifier.height(28.dp))
                Text("Sign in", style = OpType.Title, color = p.ink)
                Text(
                    "Use your PwC email. We send a 6-digit code to you in Microsoft Teams.",
                    style = OpType.Body,
                    color = p.ink2,
                    modifier = Modifier.padding(top = 8.dp),
                )
                if (banner != null) {
                    Spacer(Modifier.height(16.dp))
                    Text(
                        banner!!,
                        style = OpType.Body,
                        color = p.ink,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(OpShape.Card)
                            .background(p.surface)
                            .border(1.dp, p.lineStrong, OpShape.Card)
                            .padding(12.dp),
                    )
                }
                Spacer(Modifier.height(28.dp))
                Text("Work email", style = OpType.Meta, color = p.ink3)
                Spacer(Modifier.height(6.dp))
                BasicTextField(
                    value = email,
                    onValueChange = { email = it; errorTitle = null },
                    singleLine = true,
                    textStyle = TextStyle(color = p.ink, fontSize = 16.sp),
                    cursorBrush = SolidColor(OpColor.Accent),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(OpShape.Input)
                        .background(p.surface)
                        .border(1.dp, p.lineStrong, OpShape.Input)
                        .padding(horizontal = 14.dp, vertical = 14.dp),
                    decorationBox = { inner ->
                        if (email.isEmpty()) Text("name@pwc.com", color = p.ink3, fontSize = 16.sp)
                        inner()
                    },
                )
                if (errorTitle != null) {
                    Spacer(Modifier.height(12.dp))
                    ErrorBanner(errorTitle!!, errorBody)
                }
                Spacer(Modifier.weight(1f))
                OpPrimaryButton(
                    label = if (sending) "Sending code" else "Send code",
                    onClick = { requestCode() },
                    enabled = emailOk,
                    loading = sending,
                )
                Text(
                    if (sending) "Open Teams on any device to find it." else "Or sign in with a password you set in Profile.",
                    style = OpType.Meta,
                    color = p.ink3,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                )
                Text(
                    "Sign in with password",
                    color = p.ink,
                    style = OpType.Label,
                    textDecoration = TextDecoration.Underline,
                    modifier = Modifier
                        .align(Alignment.CenterHorizontally)
                        .padding(top = 14.dp)
                        .clickable {
                            step = LoginStep.Password
                            errorTitle = null
                            errorBody = null
                        },
                )
            }
            LoginStep.Password -> Column(Modifier.fillMaxSize()) {
                IconButton(onClick = {
                    step = LoginStep.Email
                    password = ""
                    errorTitle = null
                }) {
                    Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back", tint = p.ink)
                }
                Spacer(Modifier.height(8.dp))
                Text("Sign in", style = OpType.Title, color = p.ink)
                Text(
                    "Use your PwC email and the password you set in Profile.",
                    style = OpType.Body,
                    color = p.ink2,
                    modifier = Modifier.padding(top = 8.dp),
                )
                Spacer(Modifier.height(28.dp))
                Text("Work email", style = OpType.Meta, color = p.ink3)
                Spacer(Modifier.height(6.dp))
                BasicTextField(
                    value = email,
                    onValueChange = { email = it; errorTitle = null },
                    singleLine = true,
                    textStyle = TextStyle(color = p.ink, fontSize = 16.sp),
                    cursorBrush = SolidColor(OpColor.Accent),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(OpShape.Input)
                        .background(p.surface)
                        .border(1.dp, p.lineStrong, OpShape.Input)
                        .padding(horizontal = 14.dp, vertical = 14.dp),
                    decorationBox = { inner ->
                        if (email.isEmpty()) Text("name@pwc.com", color = p.ink3, fontSize = 16.sp)
                        inner()
                    },
                )
                Spacer(Modifier.height(14.dp))
                Text("Password", style = OpType.Meta, color = p.ink3)
                Spacer(Modifier.height(6.dp))
                BasicTextField(
                    value = password,
                    onValueChange = { password = it; errorTitle = null },
                    singleLine = true,
                    textStyle = TextStyle(color = p.ink, fontSize = 16.sp),
                    cursorBrush = SolidColor(OpColor.Accent),
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(OpShape.Input)
                        .background(p.surface)
                        .border(1.dp, p.lineStrong, OpShape.Input)
                        .padding(horizontal = 14.dp, vertical = 14.dp),
                    decorationBox = { inner ->
                        if (password.isEmpty()) Text("Password", color = p.ink3, fontSize = 16.sp)
                        inner()
                    },
                )
                if (errorTitle != null) {
                    Spacer(Modifier.height(12.dp))
                    ErrorBanner(errorTitle!!, errorBody)
                }
                Spacer(Modifier.weight(1f))
                OpPrimaryButton(
                    label = if (verifying) "Signing in" else "Sign in",
                    onClick = { signInWithPassword() },
                    enabled = emailOk && password.isNotEmpty(),
                    loading = verifying,
                )
                Text(
                    "Sign in with Teams code",
                    color = p.ink,
                    style = OpType.Label,
                    textDecoration = TextDecoration.Underline,
                    modifier = Modifier
                        .align(Alignment.CenterHorizontally)
                        .padding(top = 14.dp)
                        .clickable {
                            step = LoginStep.Email
                            password = ""
                            errorTitle = null
                        },
                )
            }
            LoginStep.Code -> {
                val failed = errorTitle != null
                Column(Modifier.fillMaxSize()) {
                    IconButton(onClick = {
                        step = LoginStep.Email
                        code = ""
                        errorTitle = null
                    }) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back", tint = p.ink)
                    }
                    Spacer(Modifier.height(8.dp))
                    Text("Check Teams", style = OpType.Title, color = p.ink)
                    Text(
                        "Enter the 6-digit code sent to ${email.trim()} in a Teams chat from Office Presence.",
                        style = OpType.Body,
                        color = p.ink2,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    Spacer(Modifier.height(24.dp))
                    OtpBoxes(
                        code = code,
                        onCodeChange = {
                            val next = it.filter { ch -> ch.isDigit() }.take(6)
                            code = next
                            errorTitle = null
                            // Auto-verify as soon as all 6 digits are entered.
                            if (next.length == 6) verifyCode()
                        },
                        highlightError = failed,
                    )
                    if (failed) {
                        Spacer(Modifier.height(12.dp))
                        ErrorBanner(errorTitle!!, errorBody)
                    } else if (resendSeconds > 0) {
                        Text(
                            "Resend code in 0:${resendSeconds.toString().padStart(2, '0')}",
                            style = OpType.Meta,
                            color = p.ink3,
                            modifier = Modifier.padding(top = 12.dp),
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    if (failed) {
                        OpPrimaryButton(label = "Resend code", onClick = { requestCode() })
                    } else {
                        OpPrimaryButton(
                            label = if (verifying) "Signing in" else "Sign in",
                            onClick = { verifyCode() },
                            enabled = code.length == 6,
                            loading = verifying,
                        )
                    }
                    Text(
                        "Use a different email",
                        color = p.ink,
                        style = OpType.Label,
                        textDecoration = TextDecoration.Underline,
                        modifier = Modifier
                            .align(Alignment.CenterHorizontally)
                            .padding(top = 14.dp)
                            .clickable {
                                step = LoginStep.Email
                                code = ""
                                errorTitle = null
                            },
                    )
                }
            }
        }
    }
}

@Composable
private fun ErrorBanner(title: String, body: String?) {
    val p = LocalOpPalette.current
    Row(
        Modifier
            .fillMaxWidth()
            .clip(OpShape.Input)
            .background(OpColor.AccentWash)
            .padding(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            Modifier.size(22.dp).clip(CircleShape).background(OpColor.Accent),
            contentAlignment = Alignment.Center,
        ) {
            Text("!", color = OpColor.OnAccent, fontWeight = FontWeight.Bold, fontSize = 12.sp)
        }
        Spacer(Modifier.width(10.dp))
        Column {
            Text(title, style = OpType.Label.copy(fontWeight = FontWeight.Bold), color = p.ink)
            if (!body.isNullOrBlank()) {
                Text(body, style = OpType.Meta, color = p.ink, modifier = Modifier.padding(top = 2.dp))
            }
        }
    }
}

@Composable
private fun OtpBoxes(code: String, onCodeChange: (String) -> Unit, highlightError: Boolean) {
    val p = LocalOpPalette.current
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    Box {
        BasicTextField(
            value = code,
            onValueChange = onCodeChange,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            modifier = Modifier.fillMaxWidth().height(56.dp).focusRequester(focus),
            textStyle = TextStyle(color = Color.Transparent),
            cursorBrush = SolidColor(Color.Transparent),
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            repeat(6) { i ->
                val ch = code.getOrNull(i)?.toString().orEmpty()
                val focused = code.length == i || (code.length == 6 && i == 5)
                val borderColor = when {
                    highlightError -> OpColor.Accent
                    focused -> OpColor.Accent.copy(alpha = 0.7f)
                    else -> p.lineStrong
                }
                Box(
                    Modifier
                        .weight(1f)
                        .height(56.dp)
                        .clip(OpShape.Input)
                        .background(p.surface)
                        .border(1.5.dp, borderColor, OpShape.Input),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(ch, style = OpType.Heading, color = p.ink)
                }
            }
        }
    }
}
