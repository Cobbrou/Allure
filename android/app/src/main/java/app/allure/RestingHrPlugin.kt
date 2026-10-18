package app.allure

import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
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
 * Resting heart rate measured by the watch, read from Health Connect (capacitor-health
 * has no resting HR record). read({ days, prompt }) resolves { bpm: [values, oldest first] },
 * empty when access is refused, or not granted and prompt is false.
 */
@CapacitorPlugin(name = "RestingHr")
class RestingHrPlugin : Plugin() {
    private val permission = HealthPermission.getReadPermission(RestingHeartRateRecord::class)
    private lateinit var launcher: ActivityResultLauncher<Set<String>>
    private var pending: PluginCall? = null

    override fun load() {
        // Must be registered while the activity is being created, hence here and not in read().
        launcher = activity.registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
            val call = pending ?: return@registerForActivityResult
            pending = null
            if (permission in granted) query(call) else call.resolve(JSObject().put("bpm", JSArray()))
        }
    }

    @PluginMethod
    fun read(call: PluginCall) {
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val granted = client().permissionController.getGrantedPermissions()
                when {
                    permission in granted -> query(call)
                    call.getBoolean("prompt", false) == true -> { pending = call; launcher.launch(setOf(permission)) }
                    else -> call.resolve(JSObject().put("bpm", JSArray()))
                }
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
