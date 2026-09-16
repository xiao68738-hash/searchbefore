package tw.searchbefore.nativeapp

import android.content.Context
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File

/** One atomic document: data and the sync journal can never be saved separately. */
class NativeStore(context: Context) {
    private val directory = File(context.noBackupFilesDir, "native-records").apply { mkdirs() }
    private val current = AtomicFile(File(directory, "state.json"))
    private val recovery = AtomicFile(File(directory, "before-import.json"))
    private val legacy = AtomicFile(File(context.filesDir, "native-backup.json"))
    private val legacyRecovery = AtomicFile(File(context.filesDir, "before-import.json"))
    private fun AtomicFile.exists() = baseFile.exists() || File(baseFile.path + ".bak").exists()

    fun load(): JSONObject {
        if (current.exists()) return NativeDocument.parse(current.readFully())
        val document = NativeDocument.empty()
        if (legacy.exists()) document.put("data", Backup.parse(legacy.readFully()))
        // Keep the old files intact until migration has been accepted; never silently reset corrupt data.
        if (legacyRecovery.exists() && !recovery.exists()) saveAtomic(recovery, Backup.encode(Backup.parse(legacyRecovery.readFully())))
        save(document)
        return document
    }
    fun save(document: JSONObject) = saveAtomic(current, NativeDocument.encode(document))
    fun keepRecovery(data: JSONObject) = saveAtomic(recovery, Backup.encode(data))
    fun readRecovery(): JSONObject = Backup.parse(recovery.readFully())
    fun hasRecovery() = recovery.exists()
    private fun saveAtomic(file: AtomicFile, bytes: ByteArray) {
        val stream = file.startWrite()
        try { stream.write(bytes); file.finishWrite(stream) }
        catch (e: Exception) { file.failWrite(stream); throw e }
    }
}

/** This envelope is private to the native installation, NEVER part of exported backups. */
object NativeDocument {
    fun empty() = JSONObject().put("version", 1).put("data", Backup.empty())
        .put("ownerUid", "").put("syncEnabled", false).put("lastSyncAt", "")
        .put("tombstones", JSONObject())
    fun encode(document: JSONObject): ByteArray = document.toString().toByteArray(Charsets.UTF_8)
    fun parse(bytes: ByteArray): JSONObject {
        require(bytes.size <= Backup.MAX_BYTES * 2) { "本機資料過大" }
        // Apply depth guard before parsing even the private journal.
        Backup.checkDepth(bytes.toString(Charsets.UTF_8))
        val input = JSONObject(bytes.toString(Charsets.UTF_8))
        require(input.getInt("version") == 1) { "不支援的本機資料版本" }
        val out = empty().put("data", Backup.parse(Backup.encode(input.getJSONObject("data"))))
        val owner = input.getString("ownerUid")
        require(owner.length <= 128 && !owner.contains('/'))
        out.put("ownerUid", owner).put("syncEnabled", input.getBoolean("syncEnabled") && owner.isNotEmpty())
            .put("lastSyncAt", input.optString("lastSyncAt"))
        val tombs = input.getJSONObject("tombstones")
        NativeSync.validateJournal(tombs)
        out.put("tombstones", JSONObject(tombs.toString()))
        return out
    }
    fun replaceData(document: JSONObject, data: JSONObject, importing: Boolean = false): JSONObject {
        val next = JSONObject(document.toString())
        next.put("data", Backup.parse(Backup.encode(data)))
        NativeSync.journalChanges(document, next)
        // Import/restore is local only. It must not silently upload or delete existing cloud data.
        if (importing) next.put("syncEnabled", false).put("lastSyncAt", "")
        return parse(encode(next))
    }
}
