import fs from "node:fs";
import path from "node:path";

const [reportsArg, outputArg] = process.argv.slice(2);
if (!reportsArg || !outputArg) throw new Error("Usage: node scripts/build-ocr-benchmark-report.mjs <private-reports-root> <output.md>");

const reportsRoot = path.resolve(reportsArg);
const output = path.resolve(outputArg);
const readReport = file => {
  const target = path.join(reportsRoot, file);
  return fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, "utf8")) : null;
};
const percent = value => Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "-";
const milliseconds = value => Number.isFinite(value) ? `${Math.round(value)} ms` : "-";

const structureLanes = [
  ["Microsoft TATR v1", "tatr-v1-threshold-050.json"],
  ["NAF 格線結構 v2", "gridline-v2.json"],
  ["格線 v2 + TATR fallback", "hybrid-v2.json"],
  ["單頁規律格線 v3", "gridline-v3.json"],
  ["格線 v3 + TATR fallback", "hybrid-v3.json"],
  ["區域局部格線 v4 + TATR fallback", "hybrid-v4-regions.json"],
  ["區域投影格線 v5 + TATR fallback", "hybrid-v5-gated.json"],
  ["雙頁共識格線 v6 + TATR fallback", "hybrid-v6-consensus.json"],
  ["高相似同版型轉移 v7", "gridline-v7-transfer-gated.json"],
  ["方向／低格數保守補救 v8", "gridline-v8-orientation-low-cell.json"],
  ["低覆蓋同卷宗補救 v9", "gridline-v9-underfilled-sibling.json"],
  ["Projection 信心閘門 v10", "gridline-v10-projection-gated.json"],
  ["方向補救信心閘門 v11", "gridline-v11-gated.json"],
].map(([name, file]) => ({ name, report: readReport(file) }));

const holdoutLanes = ["v6", "v8", "v9", "v10", "v11"].map(name => ({
  name,
  report: readReport(name === "v11" ? "holdout-gridline-v11-gated.json" : `holdout-gridline-${name}.json`),
}));

const providerLanes = [
  { name: "Google ML Kit", file: "ml-kit.json", ready: false, missing: "Android SDK、Gradle、裝置或模擬器" },
  { name: "Google Document AI", file: "google-document-ai.json", ready: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID), missing: "service account、project、location、Form Parser processor ID" },
  { name: "Azure Document Intelligence", file: "azure-document-intelligence.json", ready: Boolean(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY), missing: "endpoint 與 key" },
].map(lane => ({ ...lane, report: readReport(lane.file) }));
const windowsTextReport = readReport("windows-ocr-naf-text-crops-v1.json");

const lines = [
  "# OCR benchmark 進度報告",
  "",
  `產生時間：${new Date().toISOString()}`,
  "",
  "## 結構辨識結果",
  "",
  "| Lane | 文件數 | Cell precision | Cell recall | Cell F1 | 表格偵測率 | Median | P95 |",
  "|---|---:|---:|---:|---:|---:|---:|---:|",
];
for (const lane of structureLanes) {
  const report = lane.report;
  lines.push(report
    ? `| ${lane.name} | ${report.corpus?.evaluatedDocumentCount ?? "-"} | ${percent(report.structure?.cellPrecision)} | ${percent(report.structure?.cellRecall)} | ${percent(report.structure?.cellF1)} | ${percent(report.structure?.documentTableDetectionRate)} | ${milliseconds(report.latencyMs?.median)} | ${milliseconds(report.latencyMs?.p95)} |`
    : `| ${lane.name} | 尚未產生報告 | - | - | - | - | - | - |`);
}

if (holdoutLanes.some(lane => lane.report)) {
  lines.push("", "## 未參與調整的 holdout", "", "| Lane | 文件數 | Cell precision | Cell recall | Cell F1 | 表格偵測率 |", "|---|---:|---:|---:|---:|---:|");
  for (const lane of holdoutLanes) {
    if (!lane.report) continue;
    lines.push(`| ${lane.name} | ${lane.report.corpus?.evaluatedDocumentCount ?? "-"} | ${percent(lane.report.structure?.cellPrecision)} | ${percent(lane.report.structure?.cellRecall)} | ${percent(lane.report.structure?.cellF1)} | ${percent(lane.report.structure?.documentTableDetectionRate)} |`);
  }
  lines.push("", "Holdout 已排除原40份迭代文件；只有固定規則後的結果可用來判斷泛化。原40份結果不得當成正式準確率。");
}

lines.push("", "## 文字 ground truth 與本機比較", "", "NAF 官方標註已提供40份文件、376個轉錄欄位（4,134字元／811詞），可直接計算 CER／WER，不需重複人工抄錄。");
if (windowsTextReport) {
  lines.push("", "| 引擎 | 欄位數 | Exact field | CER | WER | 辨識欄位率 |", "|---|---:|---:|---:|---:|---:|", `| Windows.Media.Ocr en-US（比較基準） | ${windowsTextReport.corpus?.evaluatedFieldCount ?? "-"} | ${percent(windowsTextReport.text?.exactFieldRate)} | ${percent(windowsTextReport.text?.characterErrorRate)} | ${percent(windowsTextReport.text?.wordErrorRate)} | ${percent(windowsTextReport.text?.recognizedFieldRate)} |`);
}

lines.push("", "## ML Kit／Document AI／Azure 三方狀態", "", "| Provider | 狀態 | 缺少項目 | 可報告指標 |", "|---|---|---|---|");
for (const lane of providerLanes) {
  const status = lane.report ? "已有實測結果" : lane.ready ? "環境就緒，尚未執行" : "等待外部設定／執行";
  const metrics = lane.name === "Google ML Kit" ? "376欄位文字 CER/WER；不提供表格結構" : "Cell P/R/F1、IoU、延遲及376欄位CER/WER";
  lines.push(`| ${lane.name} | ${status} | ${lane.report ? "-" : lane.missing} | ${metrics} |`);
}

const allProvidersComplete = providerLanes.every(lane => lane.report);
lines.push("", "## 判讀限制", "", "- 結構cell與NAF轉錄欄位是兩套幾何標註，分層保存，只建立可追溯的空間連結。", "- ML Kit 是文字辨識器，不提供 cell/table 結構；結構指標不能與 Document AI、Azure 直接對等比較。", "- Windows.Media.Ocr 只用來驗證本機管線，不是指定三方結果。", "- 原始圖片、供應商回應及辨識文字只可存放於 `D:\\SearchBefore\\private`。", "", `三方 benchmark 完整性：${allProvidersComplete ? "完整" : "未完成；不得宣稱已完成三方比較"}`, "");

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, lines.join("\n"), "utf8");
console.log(JSON.stringify({ output, structureReports: structureLanes.filter(lane => lane.report).length, providerReports: providerLanes.filter(lane => lane.report).length, allProvidersComplete }));
