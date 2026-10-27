package com.pwc.officepresence.data

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class EventLog(context: Context) : SQLiteOpenHelper(context, "events.db", null, 2) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE events(
              id TEXT PRIMARY KEY,
              type TEXT NOT NULL,
              recorded_at TEXT NOT NULL,
              lat REAL,
              lng REAL,
              accuracy REAL,
              wifi_ssid TEXT,
              wifi_bssid TEXT,
              simulated INTEGER NOT NULL DEFAULT 0,
              uploaded INTEGER NOT NULL DEFAULT 0,
              office_id TEXT
            )
            """.trimIndent(),
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) db.execSQL("ALTER TABLE events ADD COLUMN office_id TEXT")
    }

    fun add(
        type: String,
        recordedAtIso: String,
        lat: Double? = null,
        lng: Double? = null,
        accuracy: Double? = null,
        wifiSsid: String? = null,
        wifiBssid: String? = null,
        simulated: Boolean = false,
        officeId: String? = null,
    ): String {
        val id = UUID.randomUUID().toString()
        writableDatabase.execSQL(
            "INSERT INTO events(id,type,recorded_at,lat,lng,accuracy,wifi_ssid,wifi_bssid,simulated,uploaded,office_id) VALUES(?,?,?,?,?,?,?,?,?,0,?)",
            arrayOf(id, type, recordedAtIso, lat, lng, accuracy, wifiSsid, wifiBssid, if (simulated) 1 else 0, officeId),
        )
        return id
    }

    fun pendingBatch(limit: Int = 50): JSONArray {
        val arr = JSONArray()
        readableDatabase.rawQuery(
            "SELECT id,type,recorded_at,lat,lng,accuracy,wifi_ssid,wifi_bssid,simulated,office_id FROM events WHERE uploaded=0 ORDER BY recorded_at ASC LIMIT ?",
            arrayOf(limit.toString()),
        ).use { c ->
            while (c.moveToNext()) {
                val o = JSONObject()
                o.put("clientEventId", c.getString(0))
                o.put("type", c.getString(1))
                o.put("at", c.getString(2))
                if (!c.isNull(3)) o.put("lat", c.getDouble(3))
                if (!c.isNull(4)) o.put("lng", c.getDouble(4))
                if (!c.isNull(5)) o.put("accuracyMeters", c.getDouble(5))
                if (!c.isNull(6)) o.put("wifiSsid", c.getString(6))
                if (!c.isNull(7)) o.put("wifiBssid", c.getString(7))
                o.put("simulated", c.getInt(8) == 1)
                if (!c.isNull(9)) o.put("officeLocationId", c.getString(9))
                arr.put(o)
            }
        }
        return arr
    }

    fun pendingCount(): Int =
        readableDatabase.rawQuery("SELECT COUNT(*) FROM events WHERE uploaded=0", null).use { c ->
            if (c.moveToFirst()) c.getInt(0) else 0
        }

    fun markUploaded(ids: List<String>) {
        if (ids.isEmpty()) return
        val db = writableDatabase
        db.beginTransaction()
        try {
            for (id in ids) db.execSQL("UPDATE events SET uploaded=1 WHERE id=?", arrayOf(id))
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun clearAll() {
        writableDatabase.execSQL("DELETE FROM events")
    }

    fun clearQueue() {
        writableDatabase.execSQL("DELETE FROM events WHERE uploaded=0")
    }

    fun recent(limit: Int = 30): List<String> {
        val out = mutableListOf<String>()
        readableDatabase.rawQuery(
            "SELECT type,recorded_at,simulated,uploaded FROM events ORDER BY recorded_at DESC LIMIT ?",
            arrayOf(limit.toString()),
        ).use { c ->
            while (c.moveToNext()) {
                val sim = if (c.getInt(2) == 1) " sim" else ""
                val up = if (c.getInt(3) == 1) " sent" else " queued"
                out += "${c.getString(1).take(19).replace('T', ' ')} ${c.getString(0)}$sim$up"
            }
        }
        return out
    }
}
