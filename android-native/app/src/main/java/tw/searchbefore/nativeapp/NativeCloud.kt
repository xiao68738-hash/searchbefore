package tw.searchbefore.nativeapp

import android.annotation.SuppressLint
import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreSettings
import com.google.firebase.firestore.MemoryCacheSettings
import com.google.firebase.firestore.Source
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldPath
import kotlinx.coroutines.tasks.await
import org.json.JSONArray
import org.json.JSONObject

/** Only public Android client configuration; never service-account keys or web session tokens. */
class NativeCloud(context: Context) {
    private val appContext = context.applicationContext
    @SuppressLint("DiscouragedApi")
    private fun setting(name: String): String {
        val id = appContext.resources.getIdentifier(name, "string", appContext.packageName)
        return if (id == 0) "" else appContext.getString(id)
    }
    private val options = FirebaseOptions.fromResource(appContext)
    private val clientId = setting("default_web_client_id")
    private val app = options?.takeIf { it.applicationId.contains(":android:") && it.projectId == "searchbefore-4648b" }
        ?.let { FirebaseApp.getApps(appContext).find { app -> app.name == "native" } ?: FirebaseApp.initializeApp(appContext, it, "native") }
    val auth: FirebaseAuth? = app?.let { FirebaseAuth.getInstance(it) }
    val configured: Boolean get() = auth != null && clientId.endsWith(".apps.googleusercontent.com")
    var diagnosticStage: String = "IDLE"; private set
    private val database: FirebaseFirestore? by lazy {
        app?.let { FirebaseFirestore.getInstance(it).apply {
            // NativeStore is the durable journal. Never leave an account's Firestore cache on disk.
            firestoreSettings = FirebaseFirestoreSettings.Builder()
                .setLocalCacheSettings(MemoryCacheSettings.newBuilder().build()).build()
        } }
    }
    suspend fun signIn(activityContext: Context) {
        check(configured) { "原生 Google 登入設定尚未完成" }
        val option = GetSignInWithGoogleOption.Builder(clientId).build()
        val result = CredentialManager.create(activityContext).getCredential(activityContext,
            GetCredentialRequest.Builder().addCredentialOption(option).build())
        val credential = result.credential
        require(credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) { "不支援的登入回應" }
        val token = GoogleIdTokenCredential.createFrom(credential.data).idToken
        requireNotNull(auth).signInWithCredential(GoogleAuthProvider.getCredential(token, null)).await()
        // No cloud reads or uploads here. Login is not consent to sync.
    }
    suspend fun signOut() {
        auth?.signOut()
        CredentialManager.create(appContext).clearCredentialState(ClearCredentialStateRequest())
    }
    private fun jsonValue(value: Any?): Any = when (value) {
        null -> JSONObject.NULL
        is Map<*, *> -> JSONObject().apply { value.forEach { (key, v) -> require(key is String); put(key, jsonValue(v)) } }
        is List<*> -> JSONArray(value.map { jsonValue(it) })
        is String, is Number, is Boolean -> value
        else -> error("不支援的雲端欄位格式")
    }
    private fun firestoreValue(value: Any?): Any? = when (value) {
        null, JSONObject.NULL -> null
        is JSONObject -> value.keys().asSequence().associateWith { firestoreValue(value.get(it)) }
        is JSONArray -> (0 until value.length()).map { firestoreValue(value.get(it)) }
        else -> value
    }
    private fun document(id: String, raw: Map<String, Any>?): JSONObject? = raw?.let {
        (jsonValue(it) as JSONObject).put("id", id).also(NativeSync::validateItem)
    }
    /** Full server reads, not updatedAt > checkpoint: late offline changes must not be skipped. */
    suspend fun synchronize(local: JSONObject, uid: String, isCurrent: () -> Boolean): JSONObject {
        val db = requireNotNull(database)
        fun guard() { check(isCurrent() && auth?.currentUser?.uid == uid) { "帳號或同步同意已改變" } }
        val server = linkedMapOf<String, List<JSONObject>>()
        var downloadedBytes = 0
        for (key in NativeSync.collections) {
            guard()
            diagnosticStage = "READ_$key"
            val rows = mutableListOf<JSONObject>()
            val ids = mutableSetOf<String>()
            var cursor: DocumentSnapshot? = null
            while (true) {
                guard()
                val pageSize = NativePagePolicy.requestSize(rows.size)
                var query = db.collection("users").document(uid).collection(key)
                    .orderBy(FieldPath.documentId()).limit(pageSize)
                cursor?.let { query = query.startAfter(it) }
                val page = query.get(Source.SERVER).await()
                guard()
                NativePagePolicy.validatePage(rows.size, page.size())
                for (item in page.documents) {
                    require(ids.add(item.id)) { "雲端分頁重複，請重新同步" }
                    val row = requireNotNull(document(item.id, item.data))
                    downloadedBytes += row.toString().toByteArray(Charsets.UTF_8).size
                    require(downloadedBytes <= Backup.MAX_BYTES * 2) { "雲端資料超出同步大小上限" }
                    rows.add(row)
                }
                if (page.size() < pageSize) break
                cursor = page.documents.last()
            }
            server[key] = rows
        }
        diagnosticStage = "VALIDATE_DOWNLOAD"
        NativeSync.applyRemote(local, server) // Validate complete download before any upload.
        for (key in NativeSync.collections) {
            val originals = server.getValue(key).associateBy { it.getString("id") }
            val observed = originals.toMutableMap()
            for (candidate in NativeSync.localRows(local, key)) {
                val id = candidate.getString("id")
                if (NativeSync.same(NativeSync.winner(candidate, originals[id]), originals[id])) continue
                guard()
                diagnosticStage = "WRITE_$key"
                val ref = db.collection("users").document(uid).collection(key).document(id)
                val committed = db.runTransaction { transaction ->
                    guard()
                    val latest = transaction.get(ref)
                    val remote = document(id, latest.data)
                    val chosen = requireNotNull(NativeSync.winner(candidate, remote))
                    guard()
                    if (!NativeSync.same(chosen, remote)) {
                        @Suppress("UNCHECKED_CAST")
                        transaction.set(ref, firestoreValue(chosen) as Map<String, Any?>)
                    }
                    chosen
                }.await()
                guard()
                observed[id] = committed
            }
            server[key] = observed.values.toList()
        }
        guard()
        diagnosticStage = "MERGE"
        return NativeSync.applyRemote(local, server).put("lastSyncAt", Backup.nextStamp())
    }
}
