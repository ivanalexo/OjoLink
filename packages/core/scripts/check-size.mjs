import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const LIMIT_KB = Number(process.env.OJOLINK_SIZE_LIMIT_KB ?? 300);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const result = await build({
  entryPoints: [join(root, "src", "index.ts")],
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2022",
  write: false,
  metafile: true,
  logLevel: "silent",
});

const output = result.outputFiles[0];
const gzipKb = gzipSync(output.contents).length / 1024;
const rawKb = output.contents.length / 1024;

const groups = { "embedded data": 0, tldts: 0, "engine code": 0 };
const [meta] = Object.values(result.metafile.outputs);
for (const [path, { bytesInOutput }] of Object.entries(meta.inputs)) {
  const file = path.replaceAll("\\", "/");
  if (file.includes("node_modules/")) groups.tldts += bytesInOutput;
  else if (file.startsWith("src/data/")) groups["embedded data"] += bytesInOutput;
  else groups["engine code"] += bytesInOutput;
}

const kb = (value) => `${value.toFixed(1)} KB`;
console.log(`engine bundle: ${kb(gzipKb)} gzip (${kb(rawKb)} minified), limit ${LIMIT_KB} KB gzip`);
for (const [name, bytes] of Object.entries(groups)) {
  const share = ((bytes / output.contents.length) * 100).toFixed(0);
  console.log(`  ${name}: ${kb(bytes / 1024)} minified (${share}%)`);
}

if (gzipKb >= LIMIT_KB) {
  console.error(`engine bundle is over the size budget: ${kb(gzipKb)} gzip, limit ${LIMIT_KB} KB`);
  process.exit(1);
}
