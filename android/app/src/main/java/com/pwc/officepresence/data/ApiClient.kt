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

    fun ingest(events: JSONArray, deviceName: String): JSONObject =
        send("POST", "/api/ingest", JSONObject().put("events", events).put("deviceName", deviceName))

    fun sync(): JSONObject = send("GET", "/api/me/sync")
    fun offices(): JSONObject = send("GET", "/api/offices")
    fun notificationPrefs(): JSONObject = send("GET", "/api/me/notification-prefs")
    fun patchNotificationPrefs(patch: JSONObject): JSONObject = send("PATCH", "/api/me/notification-prefs", patch)
    fun devices(): JSONObject = send("GET", "/api/me/devices")
    fun renameDevice(id: String, label: String): JSONObject =
        send("PATCH", "/api/me/devices", JSONObject().put("id", id).put("label", label))
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
    ): JSONObject {
        val body = JSONObject()
            .put("dayKey", dayKey)
            .put("proposedStart", proposedStart)
            .put("proposedEnd", proposedEnd)
            .put("reason", reason)
        if (!officeLocationId.isNullOrBlank()) body.put("officeLocationId", officeLocationId)
        return send("POST", "/api/me/corrections", body)
    }

    fun adminUsers(): JSONObject = send("GET", "/api/admin/users")
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
        val body = JSONObject().put("action", "simulate").put("userId", userId).put("inOffice", inOffice)
        if (!officeLocationId.isNullOrBlank()) body.put("officeLocationId", officeLocationId)
        return send("POST", "/api/admin/users", body)
    }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    private fun send(method: String, path: String, body: JSONObject? = null, auth: Boolean = true): JSONObject {
        val conn = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            setRequestProperty("Accept", "application/json")
            if (auth) tokenProvider()?.let { setRequestProperty("Authorization", "Bearer $it") }
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
