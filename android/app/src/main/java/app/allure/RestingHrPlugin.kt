package app.allure

import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Heart rate data capacitor-health can't read from Health Connect.
 * read({ days, prompt }): resting HR measured by the watch, resolves { bpm: [values, oldest
 * first] }, empty when access is refused, or not granted and prompt is false.
 * heartRate({ start, end }): every heart rate sample in that range (ms epoch), resolves
 * { samples: [{ time, bpm }] }. The JS side asks for READ_HEART_RATE first.
 */
@CapacitorPlugin(name = "RestingHr")
class RestingHrPlugin : Plugin() {
    private val permission = HealthPermission.getReadPermission(RestingHeartRateRecord::class)
    private lateinit var launcher: ActivityResultLauncher<Set<String>>
    // Calls waiting on the permission screen: a second read({ prompt: true }) while it is open
    // joins them instead of replacing the first, whose promise would never settle.
    private val pending = mutableListOf<PluginCall>()

    override fun load() {
        // Must be registered while the activity is being created, hence here and not in read().
        launcher = activity.registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
            val calls = pending.toList()
            pending.clear()
            calls.forEach { if (permission in granted) query(it) else it.resolve(JSObject().put("bpm", JSArray())) }
        }
    }

    @PluginMethod
    fun read(call: PluginCall) {
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val granted = client().permissionController.getGrantedPermissions()
                when {
                    permission in granted -> query(call)
                    call.getBoolean("prompt", false) == true -> {
                        pending.add(call)
                        if (pending.size == 1) launcher.launch(setOf(permission))
                    }
                    else -> call.resolve(JSObject().put("bpm", JSArray()))
                }
            } catch (e: Exception) {
                call.reject(e.message, e)
            }
        }
    }

    @PluginMethod
    fun heartRate(call: PluginCall) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val range = TimeRangeFilter.between(
                    Instant.ofEpochMilli(call.getDouble("start")!!.toLong()),
                    Instant.ofEpochMilli(call.getDouble("end")!!.toLong()),
                )
                val samples = JSArray()
                var page: String? = null
                do {
                    val res = client().readRecords(ReadRecordsRequest(HeartRateRecord::class, range, pageToken = page))
                    res.records.flatMap { it.samples }.forEach {
                        samples.put(JSObject().put("time", it.time.toEpochMilli()).put("bpm", it.beatsPerMinute))
                    }
                    page = res.pageToken
                } while (page != null)
                call.resolve(JSObject().put("samples", samples))
            } catch (e: Exception) {
                call.reject(e.message, e)
            }
        }
    }

    private fun client() = HealthConnectClient.getOrCreate(context)

    private fun query(call: PluginCall) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val end = Instant.now()
                val start = end.minus((call.getInt("days") ?: 30).toLong(), ChronoUnit.DAYS)
                val records = client().readRecords(
                    ReadRecordsRequest(RestingHeartRateRecord::class, TimeRangeFilter.between(start, end))
                ).records
                val bpm = JSArray()
                records.sortedBy { it.time }.forEach { bpm.put(it.beatsPerMinute) }
                call.resolve(JSObject().put("bpm", bpm))
            } catch (e: Exception) {
                call.reject(e.message, e)
            }
        }
    }
}
