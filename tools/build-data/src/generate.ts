import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build, loadSources, OUTPUT_DIR } from "./build.ts";

const { files, summary } = build(loadSources());

mkdirSync(OUTPUT_DIR, { recursive: true });
for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(OUTPUT_DIR, name), content);
}
console.log(summary.join("\n"));
