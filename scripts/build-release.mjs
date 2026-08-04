import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { minify as minifyHtml } from "html-minifier-terser";
import { minify as minifyJs } from "terser";
import { build as bundleJs } from "esbuild";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const outDir = path.join(root, "dist");

const htmlFiles = ["index.html", "about.html", "privacy.html", "delete-account.html"];
const jsFiles = [
  "service-config.js",
  "web-support-config.js",
  "account.js",
  "cloud-sync.js",
  "safety.js",
  "farm-records.js",
  "crop-forms.js",
  "query-aids.js",
  "form-ocr.js",
  "form-ocr-ui.js",
  "export-formats.js",
  "sw.js"
];
const imageFiles = ["brand-lockup.png", "brand-logo-120.png", "icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"];
const vendorFiles = ["pinyin-pro.js"];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const name of htmlFiles) {
  const source = await readFile(path.join(root, name), "utf8");
  const output = await minifyHtml(source, {
    collapseWhitespace: true,
    conservativeCollapse: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    minifyCSS: true,
    minifyJS: {
      compress: { passes: 2, toplevel: false },
      mangle: { toplevel: false },
      format: { comments: false }
    },
    keepClosingSlash: true,
    sortAttributes: false,
    sortClassName: false
  });
  await writeFile(path.join(outDir, name), output, "utf8");
}

for (const name of jsFiles) {
  const source = await readFile(path.join(root, name), "utf8");
  const result = await minifyJs(source, {
    compress: { passes: 2, toplevel: false },
    mangle: { toplevel: false },
    format: { comments: false }
  });
  if (!result.code) throw new Error(`無法產生 ${name}`);
  await writeFile(path.join(outDir, name), result.code, "utf8");
}

await bundleJs({
  absWorkingDir: root,
  entryPoints: ["./paddle-ocr-browser-entry.js"],
  outfile: path.join(root, "paddle-ocr-browser.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  external: ["fs", "path"],
  target: ["es2020"],
  minify: true,
  sourcemap: false,
  legalComments: "none"
});
await copyFile(path.join(root, "paddle-ocr-browser.js"), path.join(outDir, "paddle-ocr-browser.js"));

const manifest = JSON.parse(await readFile(path.join(root, "manifest.webmanifest"), "utf8"));
manifest.start_url = "/";
manifest.scope = "/";
await writeFile(path.join(outDir, "manifest.webmanifest"), JSON.stringify(manifest), "utf8");

for (const name of imageFiles) {
  await copyFile(path.join(root, name), path.join(outDir, name));
}

for (const name of vendorFiles) {
  await copyFile(path.join(root, name), path.join(outDir, name));
}

console.log(`✓ 正式發布成品已產生：${path.relative(root, outDir)}`);
