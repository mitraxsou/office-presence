package com.pwc.officepresence.data

import com.pwc.officepresence.presence.OfficeFenceInput
import org.json.JSONArray
import org.json.JSONObject

/** Office as returned by GET /api/offices: admin name, personal alias, points per visit day. */
data class Office(
    val id: String,
    val adminName: String,
    val alias: String?,
    val latitude: Double,
    val longitude: Double,
    val radiusMeters: Double,
    val pointsPerVisitDay: Int,
    val addressLabel: String?,
) {
    val displayName: String get() = alias?.takeIf { it.isNotBlank() } ?: adminName

    fun toFence() = OfficeFenceInput(latitude, longitude, radiusMeters, id, pointsPerVisitDay)

    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("adminName", adminName)
        .put("alias", alias ?: JSONObject.NULL)
        .put("latitude", latitude)
        .put("longitude", longitude)
        .put("radiusMeters", radiusMeters)
        .put("pointsPerVisitDay", pointsPerVisitDay)
        .put("addressLabel", addressLabel ?: JSONObject.NULL)

    companion object {
        fun fromJson(o: JSONObject) = Office(
            id = o.getString("id"),
            adminName = o.optString("adminName", o.optString("name", "Office")),
            alias = o.optString("alias", "").takeIf { it.isNotBlank() && it != "null" },
            latitude = o.getDouble("latitude"),
            longitude = o.getDouble("longitude"),
            radiusMeters = o.optDouble("radiusMeters", 100.0),
            pointsPerVisitDay = o.optInt("pointsPerVisitDay", 1),
            addressLabel = o.optString("addressLabel", "").takeIf { it.isNotBlank() && it != "null" },
        )

        fun listFromJson(arr: JSONArray?): List<Office> =
            if (arr == null) emptyList() else (0 until arr.length()).map { fromJson(arr.getJSONObject(it)) }

        fun listToJson(list: List<Office>): JSONArray = JSONArray().apply { list.forEach { put(it.toJson()) } }
    }
}
