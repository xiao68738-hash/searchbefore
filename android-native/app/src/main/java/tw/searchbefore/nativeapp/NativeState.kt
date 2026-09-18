package tw.searchbefore.nativeapp

import android.app.Application
import android.content.Context
import android.net.Uri
import androidx.compose.runtime.*
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicLong

/** All IO belongs to the retained ViewModel, not to a rotatable Compose screen. */
class NativeState(application: Application) : AndroidViewModel(application) {
    var catalog by mutableStateOf<Catalog?>(null); private set
    private var document by mutableStateOf<JSONObject?>(null)
    val data get() = document?.getJSONObject("data")
    val displayPreferences get() = DisplayPreferences.read(document?.optJSONObject("displayPrefs"))
    var error by mutableStateOf("")
    var busy by mutableStateOf(false); private set
    var pendingImport by mutableStateOf<JSONObject?>(null)
    var hasRecovery by mutableStateOf(false); private set
    private var undoData by mutableStateOf<JSONObject?>(null)
    val canUndo get() = undoData != null
    var accountLabel by mutableStateOf(""); private set
    var signedIn by mutableStateOf(false); private set
    val configured get() = cloud.configured
    val accountId get() = cloud.auth?.currentUser?.uid.orEmpty()
    val syncEnabled get() = document?.optBoolean("syncEnabled") == true && document?.optString("ownerUid") == cloud.auth?.currentUser?.uid
    val ownerConflict get() = document?.optString("ownerUid").orEmpty().let { it.isNotEmpty() && signedIn && it != cloud.auth?.currentUser?.uid }
    val lastSyncAt get() = document?.optString("lastSyncAt").orEmpty()
    val remindersEnabled get() = document?.optBoolean("remindersEnabled") == true
    var reminderStatus by mutableStateOf(""); private set
    private val store = NativeStore(application)
    private val cloud = NativeCloud(application)
    private val session = AtomicLong(0)
    private var observedUid: String? = null
    private val listener = FirebaseAuth.AuthStateListener { auth ->
        val user = auth.currentUser
        if (observedUid != user?.uid) { observedUid = user?.uid; session.incrementAndGet() }
        signedIn = user != null
        accountLabel = user?.email ?: user?.displayName.orEmpty()
    }
    init {
        cloud.auth?.addAuthStateListener(listener)
        task("資料載入失敗。原檔已保留，請勿清除 APP 資料。") {
            // Restore the small local envelope before parsing the catalog, so saved dark/large
            // preferences also apply to the loading screen. No network or automatic sync.
            document = withContext(Dispatchers.IO) { store.load() }
            catalog = withContext(Dispatchers.IO) {
                Catalog(application.assets.open("catalog.json").bufferedReader().use { it.readText() })
            }
            hasRecovery = withContext(Dispatchers.IO) { store.hasRecovery() }
            refreshReminders()
        }
    }
    private fun task(failure: String, block: suspend () -> Unit) {
        if (busy) return
        busy = true
        viewModelScope.launch {
            try { block() }
            catch (_: GetCredentialCancellationException) { error = "已取消登入，本機紀錄不變。" }
            catch (_: NoCredentialException) { error = "找不到可用的 Google 帳號。請先在 Android 系統加入 Google 帳號，並確認 Google Play 服務可用。" }
            catch (_: TimeoutCancellationException) { error = failure }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                val code = NativeFailure.code(e)
                error = "$failure\n${NativeFailure.hint(e)}（錯誤代碼：$code）"
                if (getApplication<Application>().applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0) {
                    android.util.Log.w("NativeTask", "$code stage=${cloud.diagnosticStage} markers=${NativeFailure.markers(e)} ${NativeFailure.locations(e)}")
                }
            }
            finally { busy = false }
        }
    }
    private suspend fun commit(next: JSONObject, keepRecovery: Boolean = false) = withContext(NonCancellable) {
        val checked = NativeDocument.parse(NativeDocument.encode(next))
        val previous = data?.let { JSONObject(it.toString()) }
        withContext(Dispatchers.IO) {
            if (keepRecovery && previous != null) store.keepRecovery(previous)
            store.save(checked)
        }
        document = checked
        hasRecovery = withContext(Dispatchers.IO) { store.hasRecovery() }
        NativeReminders.invalidate(getApplication())
        refreshReminders()
    }
    fun persist(next: JSONObject, importing: Boolean = false) = task("儲存失敗，原紀錄已保留，請重試。") {
        val previous = data?.let { JSONObject(it.toString()) }
        val updated = NativeDocument.replaceData(requireNotNull(document), next, importing)
        if (importing) session.incrementAndGet()
        commit(updated, importing)
        undoData = if (importing) null else previous
        error = if (importing) "已匯入並保留上一份資料；雲端同步及本機提醒已暫停，請核對後重新同意。" else "已儲存在此裝置；可在個人頁按立即同步。"
    }
    fun undo() = task("無法撤銷，原紀錄已保留。") {
        val previous = requireNotNull(undoData)
        commit(NativeDocument.replaceData(requireNotNull(document), previous))
        undoData = null
        error = "已撤銷上次本機修改；尚未同步到雲端。"
    }
    fun setDisplayPreferences(preferences: DisplayPreferences) = task("顯示設定儲存失敗，原設定保留。") {
        commit(JSONObject(requireNotNull(document).toString()).put("displayPrefs", preferences.encode()))
        // Does not create an undo record, update timestamps, upload, or request consent.
    }
    fun export(uri: Uri) = task("匯出失敗，原紀錄未變動。") {
        val bytes = Backup.encode(requireNotNull(data))
        withContext(Dispatchers.IO) {
            getApplication<Application>().contentResolver.openOutputStream(uri, "wt")?.use { it.write(bytes) } ?: error("無法開啟檔案")
        }
        error = "備份已匯出；請妥善保管，檔案含私人紀錄。"
    }
    fun readImport(uri: Uri) = task("備份無法讀取或格式不符；原紀錄未變動。") {
        pendingImport = withContext(Dispatchers.IO) {
            val bytes = getApplication<Application>().contentResolver.openInputStream(uri)?.use { stream ->
                val buffer = java.io.ByteArrayOutputStream()
                val chunk = ByteArray(8192)
                while (true) {
                    val n = stream.read(chunk); if (n < 0) break
                    require(buffer.size() + n <= Backup.MAX_BYTES)
                    buffer.write(chunk, 0, n)
                }
                buffer.toByteArray()
            } ?: error("無法讀取檔案")
            Backup.parse(bytes)
        }
    }
    fun exportCsv(uri: Uri) = task("CSV 匯出失敗，原紀錄未變動。") {
        val bytes = Farm.csv(requireNotNull(data))
        withContext(Dispatchers.IO) {
            getApplication<Application>().contentResolver.openOutputStream(uri, "wt")?.use { it.write(bytes) } ?: error("無法開啟檔案")
        }
        error = "用藥與農務 CSV 已匯出。這是閱讀用報表，完整還原請使用 JSON 備份。"
    }
    fun exportReport(uri: Uri, pdf: Boolean) = task("報表匯出失敗。PDF 上限 2,000 筆，更多資料請用 CSV／Excel；原紀錄未變動。") {
        val snapshot = JSONObject(requireNotNull(data).toString())
        withContext(Dispatchers.IO) {
            getApplication<Application>().contentResolver.openOutputStream(uri, "wt")?.use { output ->
                if(pdf) NativePdf.write(snapshot, output) else output.write(NativeReports.xlsx(snapshot))
            } ?: error("無法開啟檔案")
        }
        error = "報表已匯出。這不是驗證證明，也不能替代完整 JSON 還原備份。"
    }
    fun readRecovery() = task("無法讀取回復檔，原紀錄未變動。") {
        pendingImport = withContext(Dispatchers.IO) { store.readRecovery() }
    }
    fun signIn(context: Context) = task("Google 登入未完成。請確認網路、Google Play 服務與預覽版簽章設定；本機紀錄不變。") {
        cloud.signIn(context)
        error = "已登入；尚未同意同步時，不會上傳紀錄。"
    }
    fun signOut() = task("已停止同步；登出未完整完成，請再試一次。") {
        undoData = null
        session.incrementAndGet()
        commit(JSONObject(requireNotNull(document).toString()).put("syncEnabled", false).put("remindersEnabled", false))
        cloud.signOut()
        error = "已登出，雲端同步及本機提醒已關閉。本機紀錄仍保留在這台裝置。"
    }
    fun setSyncEnabled(enable: Boolean) = task("同步設定無法儲存，請再試一次。") {
        session.incrementAndGet()
        val next = JSONObject(requireNotNull(document).toString())
        if (enable) {
            val uid = requireNotNull(cloud.auth?.currentUser?.uid)
            // Never adopt a different account's local records via a generic enable button.
            require(next.optString("ownerUid").let { it.isEmpty() || it == uid })
            next.put("ownerUid", uid)
        }
        commit(next.put("syncEnabled", enable))
        error = if (enable) "已同意同步。按「立即同步」才會合併此帳號的雲端紀錄。" else "已關閉同步，雲端既有紀錄與本機資料均保留。"
    }
    fun synchronize() = task("同步未完成，不能視為雲端備份成功。本機資料已保留；部分上傳可能已完成，可安全重試。") {
        check(syncEnabled && !ownerConflict)
        val uid = requireNotNull(cloud.auth?.currentUser?.uid)
        val generation = session.get()
        val snapshot = JSONObject(requireNotNull(document).toString())
        val result = withTimeout(120000) {
            cloud.synchronize(snapshot, uid) { session.get() == generation }
        }
        check(session.get() == generation && cloud.auth.currentUser?.uid == uid)
        commit(result)
        undoData = null
        error = "已完成與伺服器的紀錄同步。配方與個人偏好仍只在本機及匯出備份中。"
    }
    fun refreshReminders() {
        if (document == null) return
        val ok = runCatching { NativeReminders.reconcile(getApplication(), remindersEnabled) }.getOrDefault(false)
        reminderStatus = if (!remindersEnabled) "本機提醒未開啟。" else if(ok) "已排程每日核對；實際時間由 Android 決定，省電或強制停止可能延後。" else "提醒無法送達：請確認系統通知權限／通知類別，或重新開啟提醒。"
    }
    fun setRemindersEnabled(enable: Boolean) = task("提醒設定未完成；請檢查系統通知權限。") {
        if (enable) check(NativeReminders.allowed(getApplication()))
        commit(JSONObject(requireNotNull(document).toString()).put("remindersEnabled", enable))
        error = if (enable) reminderStatus else "本機提醒已關閉，已移除排程與已送出的提醒。"
    }
    fun testReminder() = task("測試通知未送出；請確認已開啟提醒及系統通知權限。") {
        val sent = withContext(Dispatchers.IO) { NativeReminders.check(getApplication(), test = true) }
        check(sent)
        error = "已送出測試通知，請查看通知欄。這不代表後續排程能準時送達。"
    }
    override fun onCleared() {
        session.incrementAndGet()
        cloud.auth?.removeAuthStateListener(listener)
        super.onCleared()
    }
}
