package com.pwc.officepresence.data

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class ApiClient(private val baseUrl: String, private val tokenProvider: () -> String?) {
    fun requestOtp(email: String): JSONObject =
        send("POST", "/api/auth/otp/request", JSONObject().put("email", email), auth = false)

    fun verifyOtp(email: String, code: String, installId: String, deviceName: String): JSONObject =
        send(
            "POST",
            "/api/auth/otp/verify",
            JSONObject()
                .put("email", email)
                .put("code", code)
                .put("client", "android")
                .put("platform", "android")
                .put("installId", installId)
                .put("deviceName", deviceName),
            auth = false,
        )

    fun loginWithPassword(email: String, password: String, installId: String, deviceName: String): JSONObject =
        send(
            "POST",
            "/api/auth/password/login",
            JSONObject()
                .put("email", email)
                .put("password", password)
                .put("client", "android")
                .put("platform", "android")
                .put("installId", installId)
                .put("deviceName", deviceName),
            auth = false,
        )

    fun getPasswordStatus(): JSONObject = send("GET", "/api/me/password")

    fun setPassword(password: String, confirmPassword: String, currentPassword: String? = null): JSONObject {
        val body = JSONObject()
            .put("password", password)
            .put("confirmPassword", confirmPassword)
        if (!currentPassword.isNullOrEmpty()) body.put("currentPassword", currentPassword)
        return send("PUT", "/api/me/password", body)
    }

    fun ingest(events: JSONArray, deviceName: String): JSONObject =
        send("POST", "/api/ingest", JSONObject().put("events", events).put("deviceName", deviceName))

    fun sync(monthVersions: String? = null): JSONObject {
        val q = if (monthVersions.isNullOrBlank()) "" else "?months=${enc(monthVersions)}"
        return send("GET", "/api/me/sync$q")
    }

    fun year(year: Int): JSONObject = send("GET", "/api/me/year?year=$year")
    fun offices(): JSONObject = send("GET", "/api/offices")
    fun notificationPrefs(): JSONObject = send("GET", "/api/me/notification-prefs")
    fun patchNotificationPrefs(patch: JSONObject): JSONObject = send("PATCH", "/api/me/notification-prefs", patch)
    fun devices(): JSONObject = send("GET", "/api/me/devices")
    fun renameDevice(id: String, label: String): JSONObject =
        send("PATCH", "/api/me/devices", JSONObject().put("id", id).put("label", label))
    fun updateFcmToken(fcmToken: String): JSONObject =
        send("PATCH", "/api/me/devices", JSONObject().put("fcmToken", fcmToken))

    fun registerFcm(id: String, fcmToken: String, appVersionCode: Int): JSONObject =
        send(
            "PATCH",
            "/api/me/devices",
            JSONObject()
                .put("id", id)
                .put("fcmToken", fcmToken)
                .put("appVersionCode", appVersionCode),
        )
    fun revokeDevice(id: String): JSONObject = send("DELETE", "/api/me/devices?id=${enc(id)}")
    fun setPrivacy(share: Boolean): JSONObject =
        send("PATCH", "/api/me/privacy", JSONObject().put("sharePresenceWithPeers", share).put("consent", share))
    fun peers(): JSONObject = send("GET", "/api/peers/presence")
    fun setDeveloper(enabled: Boolean): JSONObject =
        send("PATCH", "/api/me/developer", JSONObject().put("developerMode", enabled).put("confirm", enabled))
    fun suggestOffice(name: String, lat: Double, lng: Double, radius: Double): JSONObject =
        send(
            "POST",
            "/api/me/developer",
            JSONObject().put("action", "suggest_office").put("name", name)
                .put("latitude", lat).put("longitude", lng).put("radiusMeters", radius),
        )
    fun setAlias(officeId: String, displayName: String): JSONObject =
        send("PUT", "/api/me/aliases", JSONObject().put("officeLocationId", officeId).put("displayName", displayName))

    fun reports(month: String? = null): JSONObject {
        val q = if (month.isNullOrBlank()) "" else "?month=${enc(month)}"
        return send("GET", "/api/me/reports$q")
    }

    fun submitCorrection(
        dayKey: String,
        proposedStart: String,
        proposedEnd: String,
        reason: String,
        officeLocationId: String?,
        issue: String = "wrong_times",
        remove: Boolean = false,
    ): JSONObject {
        val body = JSONObject()
            .put("day", dayKey)
            .put("dayKey", dayKey)
            .put("issue", issue)
            .put("reason", reason)
        if (remove) {
            body.put("requested", JSONObject().put("remove", true))
        } else {
            body.put("proposedStart", proposedStart)
            body.put("proposedEnd", proposedEnd)
            val requested = JSONObject().put("in_at", proposedStart).put("out_at", proposedEnd)
            if (!officeLocationId.isNullOrBlank()) {
                requested.put("office_id", officeLocationId)
                body.put("officeLocationId", officeLocationId)
            }
            body.put("requested", requested)
        }
        return send("POST", "/api/me/corrections", body)
    }

    fun listCorrections(month: String? = null): JSONObject {
        val q = if (month.isNullOrBlank()) "" else "?month=${enc(month)}"
        return send("GET", "/api/me/corrections$q")
    }

    fun cancelCorrection(id: String): JSONObject =
        send("POST", "/api/me/corrections", JSONObject().put("action", "cancel").put("id", id))

    fun undoCorrection(id: String): JSONObject =
        send("POST", "/api/me/corrections", JSONObject().put("action", "undo").put("id", id))

    fun suggestOfficeByAddress(name: String, address: String): JSONObject =
        send("POST", "/api/me/offices/suggest", JSONObject().put("name", name).put("address", address))

    fun submitTodayFix(dayKey: String, visits: JSONArray, reason: String): JSONObject =
        send(
            "POST",
            "/api/me/corrections",
            JSONObject()
                .put("day", dayKey)
                .put("issue", "wrong_times")
                .put("reason", reason)
                .put("requested", JSONObject().put("visits", visits)),
        )

    fun submitCorrection(body: JSONObject): JSONObject = send("POST", "/api/me/corrections", body)

    fun previewCorrection(
        day: String,
        officeId: String? = null,
        inAt: String? = null,
        outAt: String? = null,
        remove: Boolean = false,
        stillIn: Boolean = false,
        surface: String? = null,
        officeIds: List<String> = emptyList(),
    ): JSONObject {
        val parts = mutableListOf("day=${enc(day)}")
        if (remove) parts += "remove=1"
        if (stillIn) parts += "still_in=1"
        if (!surface.isNullOrBlank()) parts += "surface=${enc(surface)}"
        val ids = officeIds.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        if (ids.isNotEmpty()) parts += "office_ids=${enc(ids.joinToString(","))}"
        if (!officeId.isNullOrBlank()) parts += "office_id=${enc(officeId)}"
        if (!inAt.isNullOrBlank()) parts += "in_at=${enc(inAt)}"
        if (!outAt.isNullOrBlank()) parts += "out_at=${enc(outAt)}"
        return send("GET", "/api/me/corrections/preview?${parts.joinToString("&")}")
    }

    fun adminUsers(): JSONObject = send("GET", "/api/admin/users")

    /** Active non-admin users including test accounts, for View as. */
    fun adminUsersForViewAs(q: String? = null): JSONObject {
        val parts = mutableListOf("includeTest=1", "status=active", "role=user")
        if (!q.isNullOrBlank()) parts += "q=${enc(q)}"
        return send("GET", "/api/admin/users?${parts.joinToString("&")}")
    }

    fun adminSeedDummies(): JSONObject = send("POST", "/api/admin/users", JSONObject().put("seedDummies", true))
    fun adminCreateUser(email: String, name: String?, role: String, isDummy: Boolean): JSONObject =
        send(
            "POST",
            "/api/admin/users",
            JSONObject()
                .put("email", email)
                .put("name", name ?: "")
                .put("role", role)
                .put("isDummy", isDummy),
        )
    fun adminDeleteUser(id: String): JSONObject = send("DELETE", "/api/admin/users?id=${enc(id)}")
    fun adminSimulate(userId: String, inOffice: Boolean, officeLocationId: String?): JSONObject {
        val body = JSONObject()
            .put("action", "simulate")
            .put("userId", userId)
            .put("inOffice", inOffice)
            .put("confirm", true)
        if (!officeLocationId.isNullOrBlank()) body.put("officeLocationId", officeLocationId)
        return send("POST", "/api/admin/users", body)
    }

    fun startViewAs(userId: String): JSONObject =
        send("POST", "/api/admin/view-as", JSONObject().put("userId", userId))

    /** Must be called with the admin device token, not the view-as JWT. */
    fun endViewAs(sessionId: String?, adminToken: String): JSONObject {
        val body = JSONObject()
        if (!sessionId.isNullOrBlank()) body.put("sessionId", sessionId)
        return send("POST", "/api/admin/view-as/end", body, auth = true, tokenOverride = adminToken)
    }

    fun getProfile(): JSONObject = send("GET", "/api/me/profile")
    fun patchProfile(body: JSONObject): JSONObject = send("PATCH", "/api/me/profile", body)

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    private fun send(
        method: String,
        path: String,
        body: JSONObject? = null,
        auth: Boolean = true,
        tokenOverride: String? = null,
    ): JSONObject {
        val conn = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            setRequestProperty("Accept", "application/json")
            if (auth) {
                val tok = tokenOverride ?: tokenProvider()
                tok?.let { setRequestProperty("Authorization", "Bearer $it") }
            }
            connectTimeout = 20000
            readTimeout = 30000
        }
        if (body != null) {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }
        }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.let { s -> BufferedReader(InputStreamReader(s)).use { it.readText() } } ?: ""
        val json = try {
            if (text.isBlank()) JSONObject() else JSONObject(text)
        } catch (_: Exception) {
            JSONObject().put("error", "Server error ($code)")
        }
        json.put("_httpStatus", code)
        return json
    }
}

fun JSONObject.ok(): Boolean = optInt("_httpStatus", 0) in 200..299
