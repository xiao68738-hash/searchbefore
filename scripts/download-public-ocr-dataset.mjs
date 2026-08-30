import fs from "node:fs";
import https from "node:https";
import path from "node:path";

const [urlArg, outputArg, expectedArg] = process.argv.slice(2);
if (!urlArg || !outputArg) {
  throw new Error("Usage: node scripts/download-public-ocr-dataset.mjs <https-url> <private-output> [expected-bytes]");
}

const output = path.resolve(outputArg);
const privateRoot = path.resolve("D:/SearchBefore/private");
if (output !== privateRoot && !output.toLowerCase().startsWith(`${privateRoot.toLowerCase()}${path.sep}`)) {
  throw new Error(`Dataset output must stay under ${privateRoot}`);
}
if (!urlArg.startsWith("https://")) throw new Error("Only HTTPS dataset URLs are allowed");
fs.mkdirSync(path.dirname(output), { recursive: true });

const expectedBytes = Number(expectedArg) || 0;
const initialBytes = fs.existsSync(output) ? fs.statSync(output).size : 0;
let attempts = 0;
const maxAttempts = 20;

function retry(error) {
  attempts += 1;
  if (attempts > maxAttempts) throw error;
  const currentBytes = fs.existsSync(output) ? fs.statSync(output).size : 0;
  console.error(`download retry ${attempts}/${maxAttempts} from ${currentBytes}: ${error.message}`);
  setTimeout(() => download(urlArg, currentBytes), Math.min(30_000, attempts * 2_000));
}

function download(url, offset, redirects = 0) {
  if (redirects > 8) throw new Error("Too many redirects");
  const headers = offset > 0 ? { Range: `bytes=${offset}-` } : {};
  const request = https.get(url, { headers }, response => {
    if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
      response.resume();
      download(new URL(response.headers.location, url).toString(), offset, redirects + 1);
      return;
    }
    if (![200, 206].includes(response.statusCode)) {
      response.resume();
      retry(new Error(`Download failed with HTTP ${response.statusCode}`));
      return;
    }
    const append = response.statusCode === 206 && offset > 0;
    const stream = fs.createWriteStream(output, { flags: append ? "a" : "w" });
    response.on("error", error => {
      stream.destroy();
      retry(error);
    });
    response.pipe(stream);
    stream.on("finish", () => {
      stream.close();
      const size = fs.statSync(output).size;
      if (expectedBytes && size !== expectedBytes) {
        retry(new Error(`Incomplete dataset download: ${size}/${expectedBytes} bytes`));
        return;
      }
      console.log(JSON.stringify({ status: "complete", bytes: size, resumedFrom: initialBytes }));
    });
  });
  request.on("error", retry);
}

if (expectedBytes && initialBytes === expectedBytes) {
  console.log(JSON.stringify({ status: "already-complete", bytes: initialBytes }));
} else {
  download(urlArg, initialBytes);
}
