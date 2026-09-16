package tw.searchbefore.nativeapp

import android.os.Bundle
import android.util.AtomicFile
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.time.LocalDate

class NativeState : ViewModel() {
    var catalog by mutableStateOf<Catalog?>(null)
    var data by mutableStateOf<JSONObject?>(null)
    var error by mutableStateOf("")
    var busy by mutableStateOf(false)
    var pendingImport by mutableStateOf<JSONObject?>(null)
}

class MainActivity : ComponentActivity() {
    private val localFile get() = File(filesDir, "native-backup.json")
    private val recoveryFile get() = File(filesDir, "before-import.json")
    private fun atomicSave(file: File, bytes: ByteArray) {
        val atomic = AtomicFile(file)
        val stream = atomic.startWrite()
        try { stream.write(bytes); atomic.finishWrite(stream) }
        catch (e: Exception) { atomic.failWrite(stream); throw e }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(colorScheme = lightColorScheme(primary = Color(0xFF2E6B3F), background = Color(0xFFF7F4EB), surface = Color(0xFFFFFDF7))) {
                val state: NativeState = viewModel()
                val scope = rememberCoroutineScope()
                var tab by rememberSaveable { mutableStateOf(0) }
                val export = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
                    if (uri != null) scope.launch {
                        state.busy = true
                        try {
                            val bytes = Backup.encode(requireNotNull(state.data))
                            withContext(Dispatchers.IO) { contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: error("無法開啟檔案") }
                            state.error = "備份已匯出；請妥善保管，檔案含私人紀錄。"
                        } catch (e: Exception) { state.error = "匯出失敗，原紀錄未變動。" }
                        finally { state.busy = false }
                    }
                }
                val importBackup = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
                    if (uri != null) scope.launch {
                        state.busy = true
                        try {
                            state.pendingImport = withContext(Dispatchers.IO) {
                                val bytes = contentResolver.openInputStream(uri)?.use { stream ->
                                    val buffer = java.io.ByteArrayOutputStream()
                                    val chunk = ByteArray(8192)
                                    while (true) {
                                        val n = stream.read(chunk); if (n < 0) break
                                        require(buffer.size() + n <= Backup.MAX_BYTES) { "備份檔過大" }
                                        buffer.write(chunk, 0, n)
                                    }
                                    buffer.toByteArray()
                                } ?: error("無法讀取檔案")
                                Backup.parse(bytes)
                            }
                        } catch (e: Exception) { state.error = "備份無法讀取或格式不符；原紀錄未變動。" }
                        finally { state.busy = false }
                    }
                }
                LaunchedEffect(Unit) {
                    if (state.catalog == null) {
                        state.busy = true
                        try {
                            val loaded = withContext(Dispatchers.IO) {
                                val cat = Catalog(assets.open("catalog.json").bufferedReader().use { it.readText() })
                                val data = if (localFile.exists()) Backup.parse(AtomicFile(localFile).readFully()) else Backup.empty()
                                cat to data
                            }
                            state.catalog = loaded.first; state.data = loaded.second
                        } catch (e: Exception) { state.error = "資料載入失敗。原檔已保留，請勿清除 APP 資料。" }
                        finally { state.busy = false }
                    }
                }
                fun persist(next: JSONObject, keepRecovery: Boolean = false) {
                    if (state.busy) return
                    state.busy = true
                    scope.launch {
                        try {
                            val current = state.data?.let { Backup.encode(it) }
                            withContext(Dispatchers.IO) {
                                if (keepRecovery && current != null) atomicSave(recoveryFile, current)
                                atomicSave(localFile, Backup.encode(next))
                            }
                            state.data = next; state.error = "已儲存在這台裝置；尚未上傳雲端。"
                        } catch (e: Exception) { state.error = "儲存失敗，請保留畫面並重試。" }
                        finally { state.busy = false }
                    }
                }
                Scaffold(modifier = Modifier.fillMaxSize().systemBarsPadding(), bottomBar = {
                    NavigationBar {
                        listOf("查詢", "紀錄", "個人").forEachIndexed { index, title ->
                            NavigationBarItem(selected = tab == index, enabled = !state.busy, onClick = { tab = index },
                                icon = { Text(listOf("查", "記", "我")[index]) }, label = { Text(title) })
                        }
                    }
                }) { padding ->
                    Column(Modifier.padding(padding).padding(horizontal = 16.dp).fillMaxSize()) {
                        Text("噴前查", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = 12.dp))
                        Text("原生開發預覽・不取代目前正式功能", style = MaterialTheme.typography.labelMedium)
                        if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth().padding(vertical = 8.dp))
                        if (state.error.isNotBlank()) {
                            Text(state.error, modifier = Modifier.padding(vertical = 8.dp), color = MaterialTheme.colorScheme.primary)
                            TextButton(onClick = { state.error = "" }) { Text("收起訊息") }
                        }
                        val cat = state.catalog
                        val data = state.data
                        if (cat != null && data != null) when (tab) {
                            0 -> QueryScreen(cat, data, !state.busy) { row, date, plotId ->
                                runCatching { Backup.appendRecord(requireNotNull(state.data), row, date, plotId) }
                                    .onSuccess { persist(it) }.onFailure { state.error = it.message ?: "紀錄格式有誤" }
                            }
                            1 -> RecordsScreen(data, cat, !state.busy) { crop, tag, date ->
                                runCatching { Backup.addPlot(requireNotNull(state.data), crop, tag, date, cat.crops) }
                                    .onSuccess { persist(it) }.onFailure { state.error = it.message ?: "田區格式有誤" }
                            }
                            2 -> LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                item { Info("你的資料", "原生預覽僅儲存在此裝置，不會自動讀取、清除或上傳網站／現有 APP 的資料。") }
                                item { Info("Google 登入與雲端備份", "原生版尚未完成登入設定與兩裝置還原驗收。此處不會以網站登入狀態冒充原生登入成功。") }
                                item { Button(enabled = !state.busy, onClick = { export.launch("噴前查原生備份_${LocalDate.now()}.json") }) { Text("匯出完整備份") } }
                                item { OutlinedButton(enabled = !state.busy, onClick = { importBackup.launch(arrayOf("application/json", "text/plain")) }) { Text("匯入網站／APP 的 JSON 備份") } }
                                item { Text("匯入前會確認，並在本機保留上一份資料。授權、登入狀態與雲端同步同意不會匯入。") }
                                item { OutlinedButton(enabled = !state.busy && recoveryFile.exists(), onClick = {
                                    scope.launch {
                                        state.busy = true
                                        try { state.pendingImport = withContext(Dispatchers.IO) { Backup.parse(AtomicFile(recoveryFile).readFully()) } }
                                        catch (e: Exception) { state.error = "無法讀取回復檔，原紀錄未變動。" }
                                        finally { state.busy = false }
                                    }
                                }) { Text("回復匯入前的資料") } }
                                item { Text("資料版本 ${cat.version}\n資料來源：農業部農藥開放資料。本預覽僅列精確作物登記，尚未加入作物群組延伸。未列出不代表可使用；依產品標示及最新公告為準。") }
                            }
                        }
                    }
                }
                state.pendingImport?.let { pending ->
                    AlertDialog(onDismissRequest = { state.pendingImport = null }, title = { Text("確認匯入備份") },
                        text = { Text("讀入 ${pending.getJSONArray("records").length()} 筆用藥、${pending.getJSONArray("farmRecords").length()} 筆農務、${pending.getJSONArray("fieldPlots").length()} 個田區。只替換原生預覽內的資料，上一份資料會保留供回復。網站與雲端不變。") },
                        confirmButton = { TextButton(enabled = !state.busy, onClick = { state.pendingImport = null; persist(pending, true) }) { Text("保留上一份並匯入") } },
                        dismissButton = { TextButton(onClick = { state.pendingImport = null }) { Text("取消") } })
                }
            }
        }
    }
}

@Composable private fun Info(title: String, body: String) {
    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium); Text(body)
    } }
}

@Composable private fun QueryScreen(catalog: Catalog, data: JSONObject, enabled: Boolean, record: (UsageRow, String, String) -> Unit) {
    var mode by rememberSaveable { mutableStateOf(0) }
    var query by rememberSaveable { mutableStateOf("") }
    var crop by rememberSaveable { mutableStateOf("") }
    var pest by rememberSaveable { mutableStateOf("") }
    var overview by rememberSaveable { mutableStateOf(false) }
    var shown by rememberSaveable(crop, pest, query, overview) { mutableStateOf(20) }
    var recording by remember { mutableStateOf<UsageRow?>(null) }
    var date by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    var plotId by rememberSaveable { mutableStateOf("") }
    BackHandler(crop.isNotEmpty()) { if (pest.isNotEmpty()) pest = "" else if (overview) overview = false else crop = "" }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 16.dp)) {
        item { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = mode == 0, onClick = { mode = 0; crop = ""; pest = ""; query = "" }, label = { Text("按作物查") })
            FilterChip(selected = mode == 1, onClick = { mode = 1; crop = ""; pest = ""; query = "" }, label = { Text("按藥劑查") })
        } }
        if (crop.isEmpty()) {
            item { OutlinedTextField(value = query, onValueChange = { query = it.take(120) }, singleLine = true,
                label = { Text(if (mode == 0) "作物名稱，例如：蔥" else "普通名稱或商品名") }, modifier = Modifier.fillMaxWidth()) }
            if (mode == 0) {
                val matches = catalog.crops.filter { query.isBlank() || it.contains(query.trim()) }
                items(matches.take(shown), key = { it }) { c -> OutlinedButton(onClick = { crop = c; pest = ""; overview = false }, modifier = Modifier.fillMaxWidth()) { Text(c) } }
                if (matches.size > shown) item { TextButton(onClick = { shown += 30 }) { Text("顯示更多作物") } }
            } else {
                val results = catalog.byAgent(query)
                if (query.isNotBlank() && results.isEmpty()) item { Text("沒有找到精確名稱相關的登記；未列出不代表可使用。") }
                items(results.take(shown), key = { it.id }) { row ->
                    OutlinedButton(onClick = { crop = row.crop; pest = row.pest }, modifier = Modifier.fillMaxWidth()) { Text("${row.name}｜${row.crop} × ${row.pest}\n${row.json.optString("content")} ${row.json.optString("form")}") }
                }
                if (results.size > shown) item { TextButton(onClick = { shown += 20 }) { Text("顯示更多登記") } }
            }
        } else {
            item { TextButton(onClick = { if (pest.isNotEmpty()) pest = "" else if (overview) overview = false else crop = "" }) { Text("返回上一層") } }
            item { Text(if (pest.isBlank()) crop else "$crop × $pest", style = MaterialTheme.typography.headlineSmall) }
            if (pest.isBlank()) {
                item { OutlinedButton(onClick = { overview = !overview }) { Text(if (overview) "切回病蟲害清單" else "作物用藥總覽") } }
                if (overview) {
                    items(catalog.overview(crop).entries.toList(), key = { it.key }) { (name, rows) ->
                        Card { Column(Modifier.padding(16.dp)) { Text(name, style = MaterialTheme.typography.titleLarge)
                            rows.map { it.pest }.distinct().forEach { p -> TextButton(onClick = { pest = p }) { Text(p) } }
                        } }
                    }
                } else items(catalog.pests(crop), key = { it }) { p ->
                    OutlinedButton(onClick = { pest = p }, modifier = Modifier.fillMaxWidth()) { Text("$p　${catalog.exact(crop, p).size} 筆登記用法") }
                }
            } else {
                val rows = catalog.exact(crop, pest)
                item { Text("僅列此作物 × 此防治對象原登記，不合併相關分類。") }
                items(rows.take(shown), key = { it.id }) { row -> UsageCard(row, enabled) { recording = row; plotId = "" } }
                if (rows.size > shown) item { TextButton(onClick = { shown += 20 }) { Text("顯示更多用法") } }
                item { Text("資料供查詢參考，實際用法請核對產品標示與主管機關最新公告。", style = MaterialTheme.typography.bodySmall) }
                if (catalog.related(crop, pest).isNotEmpty()) item {
                    Card { Column(Modifier.padding(16.dp)) {
                        Text("看看相關防治對象", style = MaterialTheme.typography.titleMedium)
                        catalog.related(crop, pest).forEach { other ->
                            TextButton(onClick = { pest = other }) { Text("也要看看$crop × ${other}用藥嗎？") }
                        }
                        Text("分開查看，不代表藥劑可互用。", style = MaterialTheme.typography.bodySmall)
                    } }
                }
            }
        }
    }
    recording?.let { row -> AlertDialog(onDismissRequest = { recording = null }, title = { Text("紀錄實際施藥") },
        text = { Column { Text("${row.crop} × ${row.pest}｜${row.name}\n請確認已實際施用；不會因瀏覽或計算自動紀錄。")
            OutlinedTextField(value = date, onValueChange = { date = it.take(10) }, label = { Text("日期 YYYY-MM-DD") })
            PlotPicker(Backup.plots(data).filter { it.optString("crop", it.optString("name")) == row.crop }, plotId, "未指定田區", enabled) { plotId = it }
            Text("只列相同登記作物的田區；未指定的紀錄不歸入任何田區。", style = MaterialTheme.typography.bodySmall)
        } }, confirmButton = { TextButton(enabled = enabled && Backup.validDate(date) && !LocalDate.parse(date).isAfter(LocalDate.now()), onClick = { record(row, date, plotId); recording = null }) { Text("儲存到本機") } },
        dismissButton = { TextButton(onClick = { recording = null }) { Text("取消") } }) }
}

@Composable private fun UsageCard(row: UsageRow, enabled: Boolean, onRecord: () -> Unit) {
    var calculate by rememberSaveable(row.id) { mutableStateOf(false) }
    var water by rememberSaveable(row.id) { mutableStateOf("1") }
    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(row.name, style = MaterialTheme.typography.titleLarge)
        Text("${row.json.optString("content")} ${row.json.optString("form")}  ${row.json.optString("moa")}")
        Text("${row.usage.getString("label")}：${row.usage.getString("value")}")
        Text("安全採收期：" + (row.phi?.let { "$it 天" } ?: if (row.json.optBoolean("seed")) "不適用" else "請查產品標示"))
        if (row.json.optBoolean("phiAdjusted")) Text("已依備註採較長採收期")
        row.residueText?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        val dose = row.json.optString("dose")
        if (dose.isNotBlank() && dose != "-") Text("登記用量（依原單位）：$dose\n不是每桶水量，請核對附註。")
        val note = row.json.optString("note")
        if (note.isNotBlank() && note != "-") Text(note)
        if (row.brands.isNotEmpty()) Text("商品名：${row.brands.joinToString("、")}", style = MaterialTheme.typography.bodySmall)
        if (row.canCalculate) {
            OutlinedButton(onClick = { calculate = !calculate }) { Text("配藥計算") }
            if (calculate) {
                OutlinedTextField(value = water, onValueChange = { water = it.take(16) }, label = { Text("每桶水量（公升）") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
                Text(row.amount(water)?.let { "藥劑製品用量：$it ${row.unit}" } ?: "請輸入有效水量；極小量需另用合適量具核對。")
                Text("只依此筆稀釋倍數換算，仍須遵守登記用量及產品標示。", style = MaterialTheme.typography.bodySmall)
            }
        } else Text("此用法不提供自動稀釋計算，請依產品標示操作。")
        Button(enabled = enabled, onClick = onRecord) { Text("紀錄用藥") }
    } }
}

@Composable private fun PlotPicker(plots: List<JSONObject>, selected: String, emptyLabel: String, enabled: Boolean, select: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    var search by remember { mutableStateOf("") }
    val label = plots.find { it.optString("id") == selected }?.let { Backup.plotLabel(it) } ?: emptyLabel
    OutlinedButton(enabled = enabled, onClick = { search = ""; open = true }) { Text(label) }
    if (open) AlertDialog(onDismissRequest = { open = false }, title = { Text("選擇田區") }, text = {
        Column {
            OutlinedTextField(value = search, onValueChange = { search = it.take(120) }, label = { Text("搜尋田區") })
            LazyColumn(Modifier.heightIn(max = 240.dp)) {
                item { TextButton(onClick = { select(""); open = false }) { Text(emptyLabel) } }
                items(plots.filter { Backup.plotLabel(it).contains(search.trim()) }, key = { it.getString("id") }) { p ->
                    TextButton(onClick = { select(p.getString("id")); open = false }) { Text(Backup.plotLabel(p)) }
                }
            }
        }
    }, confirmButton = { TextButton(onClick = { open = false }) { Text("取消") } })
}

@Composable private fun RecordsScreen(data: JSONObject, catalog: Catalog, enabled: Boolean, addPlot: (String, String, String) -> Unit) {
    var selected by rememberSaveable { mutableStateOf("") }
    var adding by rememberSaveable { mutableStateOf(false) }
    var crop by rememberSaveable { mutableStateOf("") }
    var tag by rememberSaveable { mutableStateOf("") }
    var plantDate by rememberSaveable { mutableStateOf("") }
    val plots = Backup.plots(data)
    val records = data.getJSONArray("records").let { a -> (0 until a.length()).map { a.getJSONObject(it) }.sortedByDescending { it.optString("date") } }
    val effectiveSelection = selected.takeIf { id -> plots.any { it.getString("id") == id } }.orEmpty()
    val visible = records.filter { effectiveSelection.isEmpty() || it.optString("plotId") == effectiveSelection }
    LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 16.dp)) {
        item { Text("本機紀錄 ${visible.size} / ${records.size} 筆", style = MaterialTheme.typography.titleLarge) }
        item { PlotPicker(plots, effectiveSelection, "全部田區與未指定紀錄", enabled) { selected = it } }
        item { OutlinedButton(enabled = enabled, onClick = { crop = ""; tag = ""; plantDate = ""; adding = true }) { Text("新增田區／種植批次") } }
        item { Text("目前 ${plots.size} 個田區。另保留 ${data.getJSONArray("farmRecords").length()} 筆農務及 ${data.getJSONArray("recipes").length()} 個配方於備份；農務與配方編輯仍在移轉中。") }
        item { Text("田區篩選不會推定未指定紀錄的歸屬；沒有紀錄不代表可採收。") }
        if (records.isEmpty()) item { Text("還沒有紀錄。查詢藥劑後可按「紀錄用藥」，或從個人頁匯入 JSON 備份。") }
        if (records.isNotEmpty() && visible.isEmpty()) item { Text("此田區尚無指定的用藥紀錄。") }
        items(visible, key = { it.getString("id") }) { r ->
            val harvest = Backup.harvestDate(r)?.let { "安全採收日參考：$it" } ?: "採收期未確認，請查產品標示"
            val plot = plots.find { it.optString("id") == r.optString("plotId") }?.let { Backup.plotLabel(it) } ?: "未指定田區"
            Info("${r.optString("date")}｜${r.optString("crop")} × ${r.optString("pest")}", "${r.optString("agent")}\n$plot\n$harvest\n依產品標示及田間實際情況確認。")
        }
    }
    if (adding) AlertDialog(onDismissRequest = { adding = false }, title = { Text("新增田區／種植批次") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = crop, onValueChange = { crop = it.take(120) }, label = { Text("原登記作物，例如：蔥") })
            if (crop !in catalog.crops) Text("請填完整登記名稱。可回查詢頁確認；原生預覽尚不合併作物別名。")
            OutlinedTextField(value = tag, onValueChange = { tag = it.take(120) }, label = { Text("田區名稱，例如：後院第一區") })
            OutlinedTextField(value = plantDate, onValueChange = { plantDate = it.take(10) }, label = { Text("種植日期 YYYY-MM-DD（可留空）") })
        }
    }, confirmButton = { TextButton(enabled = enabled && crop in catalog.crops && tag.isNotBlank() && (plantDate.isEmpty() || (Backup.validDate(plantDate) && !LocalDate.parse(plantDate).isAfter(LocalDate.now()))),
        onClick = { addPlot(crop, tag, plantDate); adding = false }) { Text("儲存田區") } }, dismissButton = { TextButton(onClick = { adding = false }) { Text("取消") } })
}
