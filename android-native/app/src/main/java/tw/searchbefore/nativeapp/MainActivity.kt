package tw.searchbefore.nativeapp

import android.os.Bundle
import android.os.Build
import android.Manifest
import android.content.Intent
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.activity.compose.setContent
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.core.view.WindowCompat
import androidx.core.net.toUri
import org.json.JSONObject
import java.time.LocalDate

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val state: NativeState = viewModel()
            SearchBeforeTheme(preferences = state.displayPreferences) {
                // Keep actual content usable in short windows without shrinking text or
                // removing navigation, migration help, safety notices or data controls.
                val windowHeight = LocalWindowInfo.current.containerSize.height
                val compactChrome = with(LocalDensity.current) { windowHeight.toDp() < 480.dp }
                SideEffect {
                    WindowCompat.getInsetsController(window, window.decorView).apply {
                        isAppearanceLightStatusBars = !state.displayPreferences.dark
                        isAppearanceLightNavigationBars = !state.displayPreferences.dark
                    }
                }
                var tab by rememberSaveable { mutableIntStateOf(if(intent.getBooleanExtra("open_records", false)) 4 else 0) }
                var recordSection by rememberSaveable { mutableIntStateOf(0) }
                var calculationId by rememberSaveable { mutableStateOf("") }
                var calculationForm by rememberSaveable { mutableStateOf("") }
                var calculationWater by rememberSaveable { mutableStateOf("1") }
                var calculationLaunch by rememberSaveable { mutableIntStateOf(0) }
                var reportFrom by rememberSaveable { mutableStateOf("") }
                var reportTo by rememberSaveable { mutableStateOf("") }
                var reportPlot by rememberSaveable { mutableStateOf("") }
                var reportKind by rememberSaveable { mutableStateOf("all") }
                var reportLayoutName by rememberSaveable { mutableStateOf(ReportLayout.INTEGRATED.name) }
                val reportLayout = ReportLayout.parse(reportLayoutName)
                val reportScope = ReportScope(reportFrom, reportTo, reportPlot, reportKind)
                // Preserve the selected scope through the system document picker/activity recreation.
                var exportScopeJson by rememberSaveable { mutableStateOf("{}") }
                var calendarExportPlot by rememberSaveable { mutableStateOf("") }
                fun prepareReport(scope: ReportScope, layout: ReportLayout = ReportLayout.INTEGRATED) {
                    exportScopeJson = JSONObject().put("from", scope.from).put("to", scope.to).put("plotId", scope.plotId).put("kind", scope.kind).put("layout", layout.name).toString()
                }
                fun selectedReportLayout() = ReportLayout.parse(JSONObject(exportScopeJson).optString("layout", ReportLayout.INTEGRATED.name))
                fun selectedReport(): ReportScope = JSONObject(exportScopeJson).let {
                    ReportScope(it.optString("from"), it.optString("to"), it.optString("plotId"), it.optString("kind", "all"))
                }
                val pageState = rememberSaveableStateHolder()
                DisposableEffect(state) {
                    val observer = androidx.lifecycle.LifecycleEventObserver { _, event -> if(event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) state.refreshReminders() }
                    lifecycle.addObserver(observer)
                    onDispose { lifecycle.removeObserver(observer) }
                }
                val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
                    if(granted) state.setRemindersEnabled(true) else { state.error = "未允許通知，不影響查詢或本機紀錄。"; state.refreshReminders() }
                }
                var consent by remember { mutableStateOf(false) }
                var consentAccount by remember { mutableStateOf("") }
                var migrationHelp by rememberSaveable { mutableStateOf(false) }
                val export = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
                    if (uri != null) state.export(uri)
                }
                val importBackup = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
                    if (uri != null) state.readImport(uri)
                }
                val exportCsv = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
                    if (uri != null) state.exportCsv(uri, selectedReport(), selectedReportLayout())
                }
                val exportExcel = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) { uri -> if(uri != null) state.exportReport(uri, false, selectedReport(), selectedReportLayout()) }
                val exportCalendar = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/calendar")) { uri -> if(uri != null) state.exportCalendar(uri, calendarExportPlot) }
                val exportPdf = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/pdf")) { uri -> if(uri != null) state.exportReport(uri, true, selectedReport(), selectedReportLayout()) }
                fun persist(next: JSONObject, keepRecovery: Boolean = false) {
                    state.persist(next, keepRecovery)
                }
                // Paint behind system insets too: dark icons/labels must not sit on the
                // default white window background. Insets still keep every control clear.
                Scaffold(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).systemBarsPadding().imePadding(), bottomBar = {
                    TwaNavigation(tab, !state.busy, compact = compactChrome) { tab = it }
                }) { padding ->
                    Column(Modifier.padding(padding).fillMaxSize()) {
                        BrandHeader(!state.busy, compact = compactChrome) { migrationHelp = true }
                        Column(Modifier.padding(horizontal = 16.dp).weight(1f).clipToBounds()) {
                        if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth().padding(vertical = 8.dp))
                        if (state.canUndo) TextButton(enabled = !state.busy, onClick = state::undo) { Text("撤銷上次本機修改") }
                        if (state.error.isNotBlank()) {
                            if(compactChrome) Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                Text(state.error, modifier = Modifier.weight(1f).heightIn(max = 56.dp).verticalScroll(rememberScrollState()).padding(vertical = 4.dp), color = MaterialTheme.colorScheme.primary)
                                TextButton(onClick = { state.error = "" }) { Text("收起訊息") }
                            } else {
                                Text(state.error, modifier = Modifier.heightIn(max = 120.dp).verticalScroll(rememberScrollState()).padding(vertical = 8.dp), color = MaterialTheme.colorScheme.primary)
                                TextButton(onClick = { state.error = "" }) { Text("收起訊息") }
                            }
                        }
                        val cat = state.catalog
                        val data = state.data
                        if (cat != null && data != null) pageState.SaveableStateProvider(tab) { when (tab) {
                            0 -> QueryScreen(cat, data, !state.busy, onCalculate = { row ->
                                pageState.removeState(1); calculationWater = "1"; calculationLaunch++
                                calculationId = row.id; calculationForm = row.json.optString("selectedHarvestForm"); tab = 1
                            }, saveRecipe = { row, water ->
                                runCatching { if(row.canCalculate) Recipes.add(requireNotNull(state.data), row, water)
                                    else Recipes.addReference(requireNotNull(state.data), row) }.onSuccess { persist(it) }.onFailure { state.error = it.message ?: "配方／用途收藏無法儲存" }
                            }) { row, date, plotId, details ->
                                runCatching { Backup.appendRecord(requireNotNull(state.data), row, date, plotId, details) }
                                    .onSuccess { persist(it) }.onFailure { state.error = it.message ?: "紀錄格式有誤" }
                            }
                            1 -> CalculationScreen(cat.rows.find { it.id == calculationId }?.withHarvestForm(calculationForm), !state.busy,
                                choose = { tab = 0 }, saveRecipe = { row, water ->
                                    runCatching { Recipes.add(requireNotNull(state.data), row, water) }.onSuccess { persist(it) }.onFailure { state.error = it.message ?: "配方無法儲存" }
                                }, data = data, record = { row, date, plotId, details, confirmed ->
                                    runCatching { CalculationRecording.append(requireNotNull(state.data), row, date, plotId, details, confirmed) }
                                        .onSuccess { persist(it) }.onFailure { state.error = it.message ?: "紀錄格式有誤" }.isSuccess
                                }, initialWater = calculationWater, launchKey = calculationLaunch.toString())
                            2 -> RecipesScreen(data, !state.busy, save = { persist(it) }, report = { state.error = it }, catalog = cat,
                                use = { row, water ->
                                    pageState.removeState(1); calculationLaunch++; calculationWater = water
                                    calculationId = row.id; calculationForm = row.json.optString("selectedHarvestForm"); tab = 1
                                })
                            3 -> CountdownScreen(data, !state.busy, exportCalendar = { plot ->
                                calendarExportPlot = plot; exportCalendar.launch("噴前查等待期提醒_${LocalDate.now()}.ics")
                            }) { recordSection = 0; tab = 4 }
                            4 -> Column {
                                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    FilterChip(selected = recordSection == 0, onClick = { recordSection = 0 }, label = { Text("用藥與田區") })
                                    FilterChip(selected = recordSection == 1, onClick = { recordSection = 1 }, label = { Text("農務") })
                                    FilterChip(selected = recordSection == 2, onClick = { recordSection = 2 }, label = { Text("整合時間軸") })
                                }
                                if(recordSection == 2) TimelineScreen(data, !state.busy) { farm -> recordSection = if(farm) 1 else 0 }
                                else if(recordSection == 1) FarmScreen(data, !state.busy, save = { persist(it) }, report = { state.error = it }, export = { scope ->
                                    prepareReport(scope); exportCsv.launch("噴前查農務_${LocalDate.now()}.csv")
                                })
                                else RecordsScreen(data, cat, !state.busy,
                                addPlot = { draft ->
                                    runCatching { Backup.addPlot(requireNotNull(state.data), draft.crop, draft.tag, draft.plantDate, cat.crops, draft.variety, draft.custom) }
                                        .onSuccess { persist(it) }.onFailure { state.error = it.message ?: "田區格式有誤" }
                                        .isSuccess
                                }, editRecord = { id, stamp, date, plotId, details ->
                                    runCatching { Backup.updateRecord(requireNotNull(state.data), id, stamp, date, plotId, details.operator, details) }
                                        .onSuccess { persist(it) }.onFailure { state.error = it.message ?: "紀錄修改失敗" }
                                }, editPlot = { id, stamp, draft ->
                                    runCatching { Backup.updatePlot(requireNotNull(state.data), id, stamp, draft.tag, draft.plantDate, draft.variety) }
                                        .onSuccess { persist(it) }.onFailure { state.error = it.message ?: "田區修改失敗" }
                                        .isSuccess
                                }, delete = { collection, id, stamp ->
                                    runCatching { Farm.delete(requireNotNull(state.data), collection, id, stamp) }
                                        .onSuccess { persist(it) }.onFailure { state.error = it.message ?: "刪除失敗" }
                                }, changeDefaultPlot = { id ->
                                    runCatching { Backup.selectDefaultPlot(requireNotNull(state.data), id) }
                                        .onSuccess { persist(it) }.onFailure { state.error = it.message ?: "預設田區設定失敗" }
                                })
                            }
                            5 -> LazyColumn(Modifier.testTag("personalList"), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 16.dp)) {
                                item { QueryStep(1, "個人與資料管理") }
                                item { Info("你的資料", "預設儲存在此裝置。Google 登入不等於同意上傳；只有明確開啟同步後，才可與同帳號雲端紀錄合併。登出不會刪除本機紀錄。") }
                                item { Info("本機資料概況", "${data.getJSONArray("fieldPlots").length()} 個田區　${data.getJSONArray("records").length()} 筆用藥\n${data.getJSONArray("farmRecords").length()} 筆農務　${data.getJSONArray("recipes").length()} 個配方\n配方與顯示偏好不會同步到雲端。") }
                                item { QueryStep(2, "帳號與雲端同步") }
                                item { Info("Google 登入", if (state.signedIn) "目前帳號：${state.accountLabel}" else if (state.configured) "未登入，仍可使用本機查詢、紀錄與備份。" else "此安裝包尚未加入原生 Firebase 設定，登入暫不可用。") }
                                item {
                                    if (state.signedIn) OutlinedButton(enabled = !state.busy, onClick = state::signOut) { Text("登出 Google") }
                                    else Button(enabled = !state.busy && state.configured, onClick = { state.signIn(this@MainActivity) }) { Text("使用 Google 登入") }
                                }
                                if (state.ownerConflict) item { Info("帳號不同，已阻擋同步", "這台裝置的紀錄屬於先前同步的帳號。請登出後使用原帳號，避免把他人的紀錄傳到目前帳號。") }
                                if (state.signedIn && !state.ownerConflict) item {
                                    OutlinedButton(enabled = !state.busy, onClick = { if (state.syncEnabled) state.setSyncEnabled(false) else { consentAccount = state.accountId; consent = true } }) {
                                        Text(if (state.syncEnabled) "關閉雲端同步" else "開啟雲端同步")
                                    }
                                    Button(enabled = !state.busy && state.syncEnabled, onClick = state::synchronize) { Text("立即同步／匯入雲端紀錄") }
                                    Text(if (state.lastSyncAt.isNotEmpty()) "上次完整同步：${state.lastSyncAt}" else "尚未完成雲端同步；本機儲存不代表雲端已備份。")
                                }
                                item { NativeLegalLinks(!state.busy) { page ->
                                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, page.url.toUri())) }
                                        .onFailure { state.error = "無法開啟瀏覽器。請自行前往 ${page.url}；尚未提交任何申請。" }
                                } }
                                item { QueryStep(3, "備份與報表") }
                                item { Text("JSON 用於完整紀錄還原；Excel／PDF 是閱讀用報表，不能用來還原。顯示設定僅留在本機，換裝置須重新設定。") }
                                item { Button(enabled = !state.busy, onClick = { export.launch("噴前查原生備份_${LocalDate.now()}.json") }, modifier = Modifier.fillMaxWidth()) { Text("匯出完整備份") } }
                                item { ReportScopeFields(data, reportScope, !state.busy) { next ->
                                    reportFrom = next.from; reportTo = next.to; reportPlot = next.plotId; reportKind = next.kind
                                } }
                                item { ReportLayoutFields(reportLayout, !state.busy) { layout ->
                                    reportLayoutName = layout.name
                                    if(layout != ReportLayout.INTEGRATED) reportKind = "records"
                                } }
                                val reportValidation = runCatching { reportScope.validate(data); reportLayout.validate(reportScope) }
                                val validReport = reportValidation.isSuccess
                                if(reportValidation.isFailure) item { Text(reportValidation.exceptionOrNull()?.message ?: "請核對匯出條件") }
                                item { OutlinedButton(enabled = !state.busy && validReport, onClick = { prepareReport(reportScope, reportLayout); exportCsv.launch("噴前查${reportLayout.label}_${LocalDate.now()}.csv") }) { Text("匯出 CSV 報表") } }
                                item { OutlinedButton(enabled = !state.busy && validReport, onClick = { prepareReport(reportScope, reportLayout); exportExcel.launch("噴前查${reportLayout.label}_${LocalDate.now()}.xlsx") }) { Text("匯出 Excel 報表") } }
                                item { OutlinedButton(enabled = !state.busy && validReport, onClick = { prepareReport(reportScope, reportLayout); exportPdf.launch("噴前查${reportLayout.label}_${LocalDate.now()}.pdf") }) { Text("匯出 PDF 報表") } }
                                item { OutlinedButton(enabled = !state.busy, onClick = { importBackup.launch(arrayOf("application/json", "text/plain")) }) { Text("匯入網站／APP 的 JSON 備份") } }
                                item { Text("匯入前會確認，並在本機保留上一份資料。授權、登入狀態與雲端同步同意不會匯入。") }
                                item { OutlinedButton(enabled = !state.busy && state.hasRecovery, onClick = state::readRecovery) { Text("回復匯入前的資料") } }
                                item { QueryStep(4, "通知與閱讀設定") }
                                item {
                                    Info("本機紀錄提醒", "${state.reminderStatus}\n每天至多提醒一次：核對近期未確認或接近等待期的紀錄；不保證可採收／殘留合格。鎖定畫面不放作物、藥劑或帳號；不會因開啟通知而同步資料。匯入或登出會關閉提醒。")
                                    OutlinedButton(enabled = !state.busy, onClick = {
                                        if(state.remindersEnabled) state.setRemindersEnabled(false)
                                        else if(Build.VERSION.SDK_INT >= 33 && !NativeReminders.allowed(this@MainActivity)) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                                        else state.setRemindersEnabled(true)
                                    }) { Text(if(state.remindersEnabled) "關閉本機提醒" else "開啟本機提醒") }
                                    OutlinedButton(enabled = !state.busy && state.remindersEnabled, onClick = state::testReminder) { Text("傳送測試提醒") }
                                    TextButton(onClick = {
                                        if(Build.VERSION.SDK_INT >= 26) startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
                                        else startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, "package:$packageName".toUri()))
                                    }) { Text("系統通知設定") }
                                }
                                item { DisplaySettings(state.displayPreferences, !state.busy, state::setDisplayPreferences) }
                                item { NativeHelpCard(cat, !state.busy) }
                                item { Text("資料版本 ${cat.version}\n資料來源：農業部農藥開放資料。僅列所選作物的原登記，不自動延伸到相似作物或作物群組。未列出不代表可使用；依產品標示及最新公告為準。") }
                            }
                        } }
                        }
                    }
                }
                state.pendingImport?.let { pending ->
                    AlertDialog(onDismissRequest = { state.pendingImport = null }, title = { Text("確認匯入備份") },
                        text = { Text("讀入 ${pending.getJSONArray("records").length()} 筆用藥、${pending.getJSONArray("farmRecords").length()} 筆農務、${pending.getJSONArray("fieldPlots").length()} 個田區、${pending.getJSONArray("recipes").length()} 個配方。只替換此裝置的原生 APP 紀錄，上一份資料會保留供回復；顯示偏好保持不變。網站與雲端不變。") },
                        confirmButton = { TextButton(enabled = !state.busy, onClick = { state.pendingImport = null; persist(pending, true) }) { Text("保留上一份並匯入") } },
                        dismissButton = { TextButton(onClick = { state.pendingImport = null }) { Text("取消") } })
                }
                if (migrationHelp) AlertDialog(onDismissRequest = { migrationHelp = false }, title = { Text("把舊版紀錄帶過來") },
                    text = {
                        Column(Modifier.verticalScroll(rememberScrollState()).testTag("migrationHelp"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text("升級不會自動讀取瀏覽器裡的舊紀錄。請先備份，不要清除 Chrome 資料或移除舊版；空白清單不代表舊資料已刪除。")
                            Text("1. 用原本的瀏覽器開啟 searchbefore.tw，在個人頁匯出完整 JSON 備份；配方也包含在內。字體、深色模式等顯示偏好不含在備份中，請在新裝置重新設定。")
                            OutlinedButton(onClick = {
                                runCatching { startActivity(Intent(Intent.ACTION_VIEW, "https://searchbefore.tw/".toUri())) }
                                    .onFailure { state.error = "無法開啟瀏覽器，請自行開啟 https://searchbefore.tw/ 匯出備份。" }
                            }) { Text("開啟網站備份") }
                            Text("2. 選擇 JSON 備份並核對筆數。匯入會替換此裝置的原生資料，保留上一份供回復，不會清除網站或雲端資料。")
                            OutlinedButton(enabled = !state.busy, onClick = { migrationHelp = false; importBackup.launch(arrayOf("application/json", "text/plain")) }) { Text("選擇 JSON 備份") }
                            Text("3. 若舊版已完成雲端同步，可在個人頁登入同一 Google 帳號，再自行開啟同步並按立即同步。僅登入不會還原；雲端不包含配方與偏好。")
                            TextButton(onClick = { migrationHelp = false; tab = 5 }) { Text("前往個人頁") }
                            Text("完成後請核對田區、用藥日期、用量、農務和配方。尚未核對前，請保留原始備份，不要清除原裝置或瀏覽器的資料。")
                        }
                    },
                    confirmButton = { TextButton(onClick = { migrationHelp = false }) { Text("先繼續使用") } })
                if (consent) AlertDialog(onDismissRequest = { consent = false }, title = { Text("同意合併雲端紀錄？") },
                    text = { Text("帳號：${state.accountLabel}\n同步範圍包含用藥紀錄、田區、農務紀錄與刪除標記。配方與偏好設定不會上傳。按立即同步後會與此帳號的既有雲端資料合併；匯入備份會再次暫停同步。") },
                    confirmButton = { TextButton(enabled = !state.busy && state.signedIn && !state.ownerConflict && state.accountId == consentAccount, onClick = { consent = false; state.setSyncEnabled(true) }) { Text("同意開啟") } },
                    dismissButton = { TextButton(onClick = { consent = false }) { Text("取消") } })
            }
        }
    }
}

@Composable fun Info(title: String, body: String) {
    BrandCard { Text(title, style = MaterialTheme.typography.titleMedium); Text(body, style = MaterialTheme.typography.bodyMedium) }
}

@Composable private fun QueryScreen(catalog: Catalog, data: JSONObject, enabled: Boolean, onCalculate: (UsageRow) -> Unit, saveRecipe: (UsageRow, String) -> Unit, record: (UsageRow, String, String, ApplicationDetails) -> Unit) {
    var mode by rememberSaveable { mutableIntStateOf(0) }
    var comparing by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    var crop by rememberSaveable { mutableStateOf("") }
    var harvestForm by rememberSaveable { mutableStateOf("") }
    var pest by rememberSaveable { mutableStateOf("") }
    var overview by rememberSaveable { mutableStateOf(false) }
    var agentScope by rememberSaveable { mutableStateOf("") }
    var agentCropQuery by rememberSaveable(query) { mutableStateOf("") }
    var expandedAgentCrops by rememberSaveable(query) { mutableStateOf(listOf<String>()) }
    var pestQuery by rememberSaveable(crop) { mutableStateOf("") }
    var overviewQuery by rememberSaveable(crop) { mutableStateOf("") }
    var phiMax by rememberSaveable(crop, pest, agentScope) { mutableIntStateOf(0) }
    var showSpecial by rememberSaveable(crop, pest, agentScope) { mutableStateOf(false) }
    var showExcluded by rememberSaveable(crop, pest, agentScope) { mutableStateOf(false) }
    var shown by rememberSaveable(crop, pest, query, overview, harvestForm, phiMax, overviewQuery, agentScope) { mutableIntStateOf(20) }
    var recording by rememberSaveable(stateSaver = Saver<UsageRow?, String>(
        save = { it?.json?.toString().orEmpty() }, restore = { it.takeIf(String::isNotEmpty)?.let { raw -> UsageRow(JSONObject(raw)) } }
    )) { mutableStateOf<UsageRow?>(null) }
    var date by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    var plotId by rememberSaveable { mutableStateOf("") }
    var details by rememberSaveable(stateSaver = ApplicationDetailsSaver) { mutableStateOf(ApplicationDetails()) }
    val cropSuggestions = remember(query, mode) { if(mode == 0) catalog.cropSuggestions(query) else emptyList() }
    val agentSuggestions = remember(query, mode) { if(mode == 1) catalog.agentSuggestions(query) else emptyList() }
    val today = LocalDate.now()
    val rotationHistory = remember(data, crop, today) { if(crop.isEmpty()) emptyMap() else RotationHistory.latestByCode(data, crop, today) }
    val queryListState = rememberLazyListState()
    val focusManager = LocalFocusManager.current
    val scopeKey = org.json.JSONArray(listOf(mode, crop, pest, overview)).toString()
    var lastScope by rememberSaveable { mutableStateOf(scopeKey) }
    // Reset on a genuinely different registration, not when returning from another tab.
    LaunchedEffect(scopeKey) {
        if(lastScope != scopeKey) { queryListState.scrollToItem(0); lastScope = scopeKey }
    }
    fun goBack() { if (pest.isNotEmpty()) { pest = ""; agentScope = "" } else if (overview) overview = false else crop = "" }
    if(comparing) {
        BackHandler { comparing = false }
        MultiCropComparisonScreen(catalog, enabled, back = { comparing = false }) { row ->
            comparing = false; mode = 0; crop = row.crop; pest = row.pest; harvestForm = row.json.optString("selectedHarvestForm")
            overview = false; agentScope = row.name; query = ""
        }
        return
    }
    BackHandler(crop.isNotEmpty()) { goBack() }
    LazyColumn(state = queryListState, modifier = Modifier.testTag("queryList"), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 16.dp)) {
        if (crop.isEmpty()) item { SafetyNotice() }
        item { QueryModeSwitch(mode) { mode = it; crop = ""; pest = ""; query = ""; overview = false; harvestForm = ""; agentScope = "" } }
        if(crop.isEmpty()) item { OutlinedButton(enabled = enabled, onClick = { focusManager.clearFocus(); comparing = true }, modifier = Modifier.fillMaxWidth()) { Text("多作物共同查找") } }
        if (crop.isEmpty()) {
            item { QueryStep(1, if(mode == 0) "選作物（共 ${catalog.crops.size} 種）" else "找藥劑") }
            item { OutlinedTextField(value = query, onValueChange = { query = it.take(120) }, singleLine = true,
                label = { Text(if (mode == 0) "作物名稱，例如：蔥" else "普通名稱或商品名") }, modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.large,
                colors = OutlinedTextFieldDefaults.colors(unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                    focusedContainerColor = MaterialTheme.colorScheme.surface, unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { focusManager.clearFocus() })) }
            if (mode == 0) {
                val matches = catalog.cropMatches(query)
                catalog.formAlias(query)?.let { (aliasCrop, aliasForm) -> item {
                    OutlinedButton(onClick = { crop = aliasCrop; harvestForm = aliasForm; pest = ""; overview = false }) { Text("查看登記作物：$aliasCrop" + if(aliasForm.isNotEmpty()) "／$aliasForm" else "") }
                } }
                items(matches.take(shown), key = { it }) { c -> SearchChoice(c) { crop = c; harvestForm = ""; pest = ""; overview = false } }
                if (matches.size > shown) item { TextButton(onClick = { shown += 30 }) { Text("顯示更多作物") } }
                if(cropSuggestions.isNotEmpty()) item { Text("你是不是想找？請自行確認作物名稱，不會自動選取。") }
                items(cropSuggestions, key = { "suggest:" + it.value }) { hit -> OutlinedButton(onClick = { crop = hit.value; harvestForm = ""; pest = ""; overview = false }) { Text("${hit.value}｜${hit.label}") } }
            } else {
                val results = catalog.byAgent(query)
                val groups = agentCropGroups(results, agentCropQuery)
                if (query.isNotBlank() && results.isEmpty()) item { Text("沒有找到精確名稱相關的登記；未列出不代表可使用。") }
                if(results.isNotEmpty()) {
                    item { Text("只列實際登記的作物與防治對象。不同普通名稱分開，不將同名商品或相關作物視為可互用。") }
                    item { OutlinedTextField(agentCropQuery, { agentCropQuery = it.take(120) }, label = { Text("篩選登記作物") }, singleLine = true,
                        modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { focusManager.clearFocus() })) }
                    item { Text("${groups.size} 組藥劑／作物・${groups.sumOf { it.rows.size }} 筆原登記用法") }
                    item { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TextButton(enabled = enabled, onClick = { expandedAgentCrops = groups.map { it.key } }) { Text("全部展開") }
                        TextButton(enabled = enabled, onClick = { expandedAgentCrops = emptyList() }) { Text("全部收合") }
                    } }
                    if(groups.isEmpty()) item { Text("沒有符合篩選的登記作物。") }
                }
                items(groups.take(shown), key = { it.key }) { group ->
                    AgentCropCard(group, group.key in expandedAgentCrops, enabled,
                        toggle = { expandedAgentCrops = if(group.key in expandedAgentCrops) expandedAgentCrops - group.key else expandedAgentCrops + group.key },
                        select = { row -> crop = row.crop; harvestForm = ""; pest = row.pest; agentScope = row.name })
                }
                if (groups.size > shown) item { TextButton(onClick = { shown += 20 }) { Text("顯示更多登記作物") } }
                if(agentSuggestions.isNotEmpty()) item { Text("相近名稱建議，不代表同一藥劑；請核對後點選。") }
                items(agentSuggestions, key = { "suggest:" + it.value }) { hit -> OutlinedButton(onClick = { query = hit.value }) { Text("${hit.value}｜${hit.label}") } }
            }
        } else {
            item { TextButton(onClick = { goBack() }) { Text("返回上一層") } }
            item { QueryStep(if(pest.isEmpty()) 2 else 3, if(pest.isNotEmpty()) "查看登記用法" else if(overview) "作物用藥總覽" else "選病蟲害") }
            item { Text(if (pest.isBlank()) crop else "$crop × $pest", style = MaterialTheme.typography.headlineSmall) }
            if(catalog.forms(crop).isNotEmpty()) item {
                Text("先確認採收部位；未註明不代表適用，所有原登記仍保留供核對。")
                Column {
                    FilterChip(selected = harvestForm.isEmpty(), onClick = { harvestForm = "" }, label = { Text("不指定（全部顯示）") })
                    catalog.forms(crop).forEach { (id, label) -> FilterChip(selected = harvestForm == id, onClick = { harvestForm = id }, label = { Text(label) }) }
                }
            }
            if (pest.isBlank()) {
                item { OutlinedButton(onClick = { overview = !overview }) { Text(if (overview) "切回病蟲害清單" else "作物用藥總覽") } }
                if (overview) {
                    item { Text("依藥劑名稱整理原登記防治對象。點選對象查看各筆用法；不同劑型、含量或採收部位不代表可互用。") }
                    item { OutlinedTextField(overviewQuery, { overviewQuery = it.take(120) }, label = { Text("篩選藥劑或病蟲害") },
                        singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { focusManager.clearFocus() })) }
                    val entries = catalog.filteredOverview(crop, overviewQuery)
                    item { Text("${entries.size} 種藥劑；依原登記防治對象數排序，不代表優先推薦。") }
                    if(entries.isEmpty()) item { Text("查無符合的已登記藥劑或病蟲害。") }
                    items(entries.take(shown), key = { it.key }) { (name, rows) ->
                        CropOverviewCard(name, rows.map { it.pest }, notices = overviewResidueNotices(rows, harvestForm)) { pest = it }
                    }
                    if(entries.size > shown) item { TextButton(onClick = { shown += 20 }) { Text("顯示更多藥劑") } }
                } else {
                    item { OutlinedTextField(pestQuery, { pestQuery = it.take(120) }, label = { Text("篩選病蟲害或分類，例：夜蛾科") },
                        singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { focusManager.clearFocus() })) }
                    val pests = catalog.pests(crop).filter { catalog.pestLabel(pestQuery, it) != null }
                        .sortedByDescending { catalog.exact(crop, it).size }
                    if(pestQuery.isNotBlank()) item { Text("${pests.size} 項；分類相關結果按原登記分列，不代表用藥可互用。分類對照尚非完整清單。") }
                    if(pests.isEmpty()) item { Text("查無符合的直接登記項目，可改查原病蟲害名稱。") }
                    items(pests, key = { it }) { p ->
                        SearchChoice("$p　${catalog.exact(crop, p).size} 筆登記用法") { pest = p }
                        catalog.pestLabel(pestQuery, p)?.takeIf { it.isNotEmpty() }?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                    }
                }
            } else {
                val original = catalog.exact(crop, pest).map { it.withHarvestForm(harvestForm) }
                val rows = QueryFilters.registrations(original, agentScope, phiMax.takeIf { it > 0 })
                    .sortedBy { if(it.formExcluded) 2 else if(it.json.optString("formCategory") == "matched") 0 else 1 }
                val sections = QueryFilters.sections(rows)
                item { Text("僅列此作物 × 此防治對象原登記，不合併相關分類。") }
                if(agentScope.isNotEmpty()) item {
                    Info("目前只看：$agentScope", "以下僅列這個普通名稱在本作物／防治對象的原登記；仍須核對劑型、含量與商品標示。")
                    TextButton(onClick = { agentScope = "" }) { Text("查看此作物／防治對象的全部藥劑") }
                }
                item { key(crop, pest, agentScope) { PhiFilterBar(phiMax) { phiMax = it } } }
                item { Text("一般用法 ${sections.ordinary.size} 筆・特殊用法 ${sections.special.size} 筆・不符或待確認 ${sections.excluded.size} 筆") }
                if(rows.isEmpty()) item { Text("沒有符合目前篩選的登記用法。可改選「全部」，不代表其他藥劑可使用。") }
                items(sections.ordinary.take(shown), key = { it.id }) { row -> UsageCard(row, enabled, onRecipe = { water -> saveRecipe(row, water) }, onCalculate = { onCalculate(row) }, rotation = rotationHistory[row.json.optString("moa").trim().uppercase()], onRecord = { recording = row; plotId = Backup.defaultPlot(data, row.crop); date = LocalDate.now().toString(); details = ApplicationDetails() }) }
                if (sections.ordinary.size > shown) item { TextButton(onClick = { shown += 20 }) { Text("顯示更多用法") } }
                if(sections.special.isNotEmpty()) {
                    item { OutlinedButton(onClick = { showSpecial = !showSpecial }, modifier = Modifier.fillMaxWidth()) {
                        Text("${if(showSpecial) "收合" else "展開"}特殊施用方式（${sections.special.size} 筆）")
                    } }
                    if(showSpecial) {
                        item { Info("特殊施用方式，與一般噴施分開", "包含種子處理、撒布、原液等用途；不提供稀釋計算，請依原登記方式與產品標示操作。") }
                        items(sections.special, key = { it.id }) { row -> UsageCard(row, enabled, onRecipe = { water -> saveRecipe(row, water) }, rotation = rotationHistory[row.json.optString("moa").trim().uppercase()], onRecord = { recording = row; plotId = Backup.defaultPlot(data, row.crop); date = LocalDate.now().toString(); details = ApplicationDetails() }) }
                    }
                }
                if(sections.excluded.isNotEmpty()) {
                    item { OutlinedButton(onClick = { showExcluded = !showExcluded }, modifier = Modifier.fillMaxWidth()) {
                        Text("${if(showExcluded) "收合" else "展開"}型態不符或待確認（${sections.excluded.size} 筆）")
                    } }
                    if(showExcluded) items(sections.excluded, key = { it.id }) { row -> UsageCard(row, enabled, onRecipe = {}, onRecord = {}) }
                }
                item { Text("資料供查詢參考，實際用法請核對產品標示與主管機關最新公告。", style = MaterialTheme.typography.bodySmall) }
                if (catalog.related(crop, pest).isNotEmpty()) item {
                    Card { Column(Modifier.padding(16.dp)) {
                        Text("看看相關防治對象", style = MaterialTheme.typography.titleMedium)
                        catalog.related(crop, pest).forEach { other ->
                            TextButton(onClick = { pest = other; agentScope = "" }) { Text("也要看看$crop × ${other}用藥嗎？") }
                        }
                        Text("分開查看，不代表藥劑可互用。", style = MaterialTheme.typography.bodySmall)
                    } }
                }
                item { NativeFeedbackEntry(catalog, enabled, listOf("作物：$crop", "防治對象：$pest",
                    agentScope.takeIf { it.isNotEmpty() }?.let { "藥劑篩選：$it" }, harvestForm.takeIf { it.isNotEmpty() }?.let { "採收部位：$it" }).filterNotNull().joinToString("\n")) }
            }
        }
    }
    recording?.let { row -> AlertDialog(onDismissRequest = { recording = null }, title = { Text("紀錄實際施藥") },
        text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) { Text("${row.crop} × ${row.pest}｜${row.name}\n請確認已實際施用；不會因瀏覽或計算自動紀錄。")
            OutlinedTextField(value = date, onValueChange = { date = it.take(11) }, label = { Text("日期 YYYY-MM-DD") })
            PlotPicker(Backup.plots(data).filter { it.optString("crop", it.optString("name")) == row.crop }, plotId, "未指定田區", enabled) { plotId = it }
            Text("只列相同登記作物的田區；未指定的紀錄不歸入任何田區。", style = MaterialTheme.typography.bodySmall)
            ApplicationFields(details) { details = it }
        } }, confirmButton = { TextButton(enabled = enabled && runCatching { details.validate() }.isSuccess && Backup.validDate(date) && !LocalDate.parse(date).isAfter(LocalDate.now()), onClick = { record(row, date, plotId, details); recording = null }) { Text("儲存實際用藥") } },
        dismissButton = { TextButton(onClick = { recording = null }) { Text("取消") } }) }
}

@Composable internal fun CropOverviewCard(name: String, pests: List<String>, notices: List<String> = emptyList(), onPest: (String) -> Unit) {
    BrandCard(Modifier.testTag("cropOverviewCard")) {
        Text(name, style = MaterialTheme.typography.titleLarge)
        if(notices.isNotEmpty()) {
            notices.forEach { ResidueNotice(it) }
            Text("提醒依個別原登記及所選採收部位判定；請點入核對，不代表全部含量或劑型均適用。", style = MaterialTheme.typography.bodySmall)
        }
        Text("原登記防治對象", style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
        pests.distinct().forEach { pest ->
            OutlinedButton(onClick = { onPest(pest) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(pest, modifier = Modifier.weight(1f))
                    Text("›")
                }
            }
        }
    }
}

@Composable internal fun UsageCard(row: UsageRow, enabled: Boolean, onRecipe: (String) -> Unit, onRecord: () -> Unit, onCalculate: (() -> Unit)? = null, rotation: JSONObject? = null) {
    var calculate by rememberSaveable(row.id) { mutableStateOf(false) }
    var water by rememberSaveable(row.id) { mutableStateOf("1") }
    BrandCard {
        if(row.formExcluded) Text("此型態不適用或待核對：${row.json.optString("formReason")}。保留原登記供查閱，不提供一鍵計算或記錄。", color = MaterialTheme.colorScheme.error)
        Text(row.name, style = MaterialTheme.typography.headlineMedium)
        Text("${row.json.optString("content")} ${row.json.optString("form")}", color = MaterialTheme.colorScheme.onSurfaceVariant)
        BrandNames(row)
        RegistrationTags(row.json.optString("formKind"), row.json.optString("moa"))
        if(rotation != null) Info("輪用提醒", "${rotation.optString("date")} 曾記錄相同作用機制（${row.json.optString("moa")}）：${rotation.optString("agent")}。\n此處彙整近 30 天同作物各田區的紀錄；請核對實際田區與輪用安排，不代表已產生抗藥性。")
        UsageFacts(row.usage.getString("label"), row.usage.getString("value"), row.harvestLabel())
        if (row.json.optBoolean("phiAdjusted")) Text("已依備註採較長採收期")
        if(row.json.optString("phiText").contains("-") && row.phi != null) Text("登記區間依原文顯示；篩選與倒數採 ${row.phi} 天，仍請核對產品標示。", style = MaterialTheme.typography.bodySmall)
        if(row.usage.optString("detail").isNotBlank()) Info("登記施用方式", row.usage.getString("detail"))
        if(row.json.optString("times").isNotBlank()) Info("施用次數", row.json.getString("times"))
        row.residueText?.let { ResidueNotice(it) }
        val dose = row.json.optString("dose")
        if (dose.isNotBlank() && dose != "-") {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Text("登記用量（依原單位）", style = MaterialTheme.typography.titleMedium)
            Text(dose, style = MaterialTheme.typography.headlineSmall)
            Text("這是登記的施用量，不是每桶水的配藥量；小面積使用也需核對原單位與附註。", style = MaterialTheme.typography.bodySmall)
        }
        val note = row.json.optString("note")
        if (note.isNotBlank() && note != "-") { Text("使用注意事項", style = MaterialTheme.typography.titleMedium); Text(note, style = MaterialTheme.typography.bodyMedium) }
        if (row.canCalculate && !row.formExcluded) {
            Button(enabled = enabled, onClick = { if(onCalculate != null) onCalculate() else calculate = !calculate }, modifier = Modifier.fillMaxWidth()) { Text(if(calculate) "收起配藥計算" else "配藥計算") }
            if (calculate) {
                OutlinedTextField(value = water, onValueChange = { water = it.take(16) }, label = { Text("每桶水量（公升）") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
                Text(row.amount(water)?.let { "藥劑製品用量：$it ${row.unit}" } ?: "請輸入有效水量；極小量需另用合適量具核對。")
                MeasurementAdviceText(row, row.amount(water))
                Text("只依此筆稀釋倍數換算，仍須遵守登記用量及產品標示。", style = MaterialTheme.typography.bodySmall)
                OutlinedButton(enabled = enabled && row.amount(water) != null, onClick = { onRecipe(water) }) { Text("存成常用配方") }
            }
        } else {
            Text("此用法不提供自動稀釋計算，請依產品標示操作。")
            OutlinedButton(enabled = enabled && !row.formExcluded, onClick = { onRecipe("") }) { Text("收藏此用途") }
        }
        OutlinedButton(enabled = enabled && !row.formExcluded, onClick = onRecord, modifier = Modifier.fillMaxWidth()) { Text("紀錄用藥") }
    }
}

@Composable fun PlotPicker(plots: List<JSONObject>, selected: String, emptyLabel: String, enabled: Boolean, select: (String) -> Unit) {
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

@Composable internal fun RecordsScreen(data: JSONObject, catalog: Catalog, enabled: Boolean,
    addPlot: (PlotDraft) -> Boolean,
    editRecord: (String, String, String, String, ApplicationDetails) -> Unit,
    editPlot: (String, String, PlotDraft) -> Boolean,
    delete: (String, String, String) -> Unit, changeDefaultPlot: (String) -> Unit) {
    var selected by rememberSaveable { mutableStateOf("") }
    var recordQuery by rememberSaveable { mutableStateOf("") }
    val focus = LocalFocusManager.current
    var adding by rememberSaveable { mutableStateOf(false) }
    var editingPlotJson by rememberSaveable { mutableStateOf("") }
    val editingPlot = editingPlotJson.takeIf { it.isNotEmpty() }?.let(::JSONObject)
    var editingRecord by rememberSaveable(stateSaver = Saver<JSONObject?, String>(
        save = { it?.toString().orEmpty() }, restore = { it.takeIf(String::isNotEmpty)?.let(::JSONObject) }
    )) { mutableStateOf<JSONObject?>(null) }
    var deleting by remember { mutableStateOf<Pair<String, JSONObject>?>(null) }
    var recordDate by rememberSaveable { mutableStateOf("") }
    var recordPlot by rememberSaveable { mutableStateOf("") }
    var recordDetails by rememberSaveable(stateSaver = ApplicationDetailsSaver) { mutableStateOf(ApplicationDetails()) }
    val plots = Backup.plots(data)
    val records = data.getJSONArray("records").let { a -> (0 until a.length()).map { a.getJSONObject(it) }.sortedByDescending { it.optString("date") } }
    val effectiveSelection = selected.takeIf { id -> plots.any { it.getString("id") == id } }.orEmpty()
    val visible = records.filter { (effectiveSelection.isEmpty() || it.optString("plotId") == effectiveSelection) && recordMatches(it, recordQuery) }
    LazyColumn(Modifier.testTag("recordsList"), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 16.dp)) {
        item { QueryStep(1, "用藥紀錄") }
        item { Text("本機紀錄 ${visible.size} / ${records.size} 筆", style = MaterialTheme.typography.titleLarge) }
        item { PlotPicker(plots, effectiveSelection, "全部田區與未指定紀錄", enabled) { selected = it } }
        item { OutlinedTextField(recordQuery, { recordQuery = it.take(120) }, enabled = enabled,
            label = { Text("搜尋藥劑、作物、日期或備註") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { focus.clearFocus() })) }
        item { OutlinedButton(enabled = enabled, onClick = { adding = true }) { Text("新增田區／種植批次") } }
        if (effectiveSelection.isNotEmpty()) item {
            OutlinedButton(enabled = enabled && data.optString("activePlotId") != effectiveSelection,
                onClick = { changeDefaultPlot(effectiveSelection) }) { Text("設為新增紀錄預設田區") }
            OutlinedButton(enabled = enabled, onClick = {
                editingPlotJson = plots.first { it.getString("id") == effectiveSelection }.toString()
            }) { Text("修改這個田區") }
            TextButton(enabled = enabled, onClick = { deleting = "fieldPlots" to plots.first { it.getString("id") == effectiveSelection } }) { Text("刪除空白田區") }
        }
        item { Text("目前 ${plots.size} 個田區、${data.getJSONArray("farmRecords").length()} 筆農務紀錄及 ${data.getJSONArray("recipes").length()} 個常用配方。") }
        plots.firstOrNull { it.getString("id") == data.optString("activePlotId") }?.let { active -> item {
            Text("新增紀錄預設：${Backup.plotLabel(active)}。用藥只在原登記作物完全相同時帶入，儲存前仍可更換。")
            TextButton(enabled = enabled, onClick = { changeDefaultPlot("") }) { Text("取消預設田區") }
        } }
        item { Text("田區篩選不會推定未指定紀錄的歸屬；沒有紀錄不代表可採收。") }
        if (records.isEmpty()) item { Text("還沒有紀錄。查詢藥劑後可按「紀錄用藥」，或從個人頁匯入 JSON 備份。") }
        if (records.isNotEmpty() && visible.isEmpty()) item { Text("沒有符合目前田區與搜尋條件的紀錄；可清空搜尋或改選全部田區。") }
        items(visible, key = { it.getString("id") }) { r ->
            val harvest = Backup.harvestDate(r)?.let { "安全採收日參考：$it" } ?: "採收期未確認，請查產品標示"
            val plot = plots.find { it.optString("id") == r.optString("plotId") }?.let { Backup.plotLabel(it) } ?: "未指定田區"
            BrandCard {
            Text(r.optString("date"), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
            Text(r.optString("agent"), style = MaterialTheme.typography.titleLarge)
            Text("${r.optString("crop")} × ${r.optString("pest")}｜$plot")
            HorizontalDivider()
            Text(harvest, style = MaterialTheme.typography.titleMedium)
            Text(ApplicationDetails.summary(r))
            Text("操作者：${r.optString("operator").ifBlank { "未填" }}")
            if(r.optString("notes").isNotBlank()) Text("備註：${r.optString("notes")}")
            Text("依產品標示及田間實際情況確認。", style = MaterialTheme.typography.bodySmall)
            TextButton(enabled = enabled, onClick = {
                editingRecord = r; recordDate = r.getString("date"); recordPlot = r.optString("plotId"); recordDetails = ApplicationDetails.from(r)
            }) { Text("修改實際用藥紀錄") }
            TextButton(enabled = enabled, onClick = { deleting = "records" to r }) { Text("刪除此筆用藥紀錄") }
            }
        }
    }
    if (adding) PlotEditorDialog(catalog.crops, null, enabled, dismiss = { adding = false }, save = addPlot)
    deleting?.let { (collection, item) -> AlertDialog(onDismissRequest = { deleting = null }, title = { Text("確認刪除？") },
        text = { Text(if(collection == "fieldPlots") "${Backup.plotLabel(item)}\n仍有用藥或農務紀錄的田區不能刪除。" else "${item.optString("date")}｜${item.optString("agent")}\n刪除會影響採收等待期參考。若已同意同步，下次同步會傳送刪除標記。") },
        confirmButton = { TextButton(enabled = enabled, onClick = { delete(collection, item.getString("id"), item.optString("updatedAt")); deleting = null }) { Text("確認刪除") } },
        dismissButton = { TextButton(onClick = { deleting = null }) { Text("取消") } }) }
    editingRecord?.let { record ->
        val matchingPlots = plots.filter { it.optString("crop", it.optString("name")) == record.getString("crop") }
        val plotValid = recordPlot.isEmpty() || matchingPlots.any { it.getString("id") == recordPlot }
        AlertDialog(onDismissRequest = { editingRecord = null }, title = { Text("修改用藥紀錄") }, text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("${record.getString("crop")} × ${record.optString("pest")}｜${record.getString("agent")}")
                OutlinedTextField(value = recordDate, onValueChange = { recordDate = it.take(11) }, label = { Text("實際施藥日期 YYYY-MM-DD") })
                PlotPicker(matchingPlots, recordPlot, "未指定田區", enabled) { recordPlot = it }
                if (!plotValid) Text("原紀錄田區與作物不符，請重新選擇或解除歸屬。", color = MaterialTheme.colorScheme.error)
                ApplicationFields(recordDetails) { recordDetails = it }
                Text("藥劑、原登記倍數與採收期保持不變。實際用量不是用藥建議；改日期會重新計算逐筆採收日參考。")
            }
        }, confirmButton = { TextButton(enabled = enabled && plotValid && runCatching { recordDetails.validate() }.isSuccess && Backup.validDate(recordDate) && !LocalDate.parse(recordDate).isAfter(LocalDate.now()), onClick = {
            editRecord(record.getString("id"), record.optString("updatedAt"), recordDate, recordPlot, recordDetails); editingRecord = null
        }) { Text("儲存修改") } }, dismissButton = { TextButton(onClick = { editingRecord = null }) { Text("取消") } })
    }
    editingPlot?.let { plot ->
        PlotEditorDialog(catalog.crops, plot, enabled, dismiss = { editingPlotJson = "" }) { draft ->
            editPlot(plot.getString("id"), plot.optString("updatedAt"), draft)
        }
    }
}
