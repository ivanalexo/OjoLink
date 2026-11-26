import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  checkContents,
  checkResolver,
  checkVersion,
  leakedSettings,
  readEnv,
  type ReleaseManifest,
} from "../src/release-rules.ts";
import { readZip } from "./zip.ts";

const root = process.cwd();
const TEXT = /\.(js|json|html|css)$/;

function fail(problems: readonly string[]): never {
  for (const problem of problems) process.stderr.write(`release: ${problem}\n`);
  process.exit(1);
}

function run(command: string, env: NodeJS.ProcessEnv): boolean {
  return spawnSync(command, { cwd: root, env, shell: true, stdio: "inherit" }).status === 0;
}

function capture(command: string): string {
  const result = spawnSync(command, { cwd: root, shell: true, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

/** The build settings as the build will see them: the environment first, then the local files. */
function settings(): Map<string, string> {
  const values = new Map<string, string>();
  for (const file of [".env", ".env.local"]) {
    const path = join(root, file);
    if (existsSync(path))
      for (const [name, value] of readEnv(readFileSync(path, "utf8"))) {
        values.set(name, value);
      }
  }
  for (const name of ["WXT_RESOLVER_URL", "WXT_DONATE_URL"]) {
    const value = process.env[name];
    if (value !== undefined && value.trim() !== "") values.set(name, value.trim());
  }
  return values;
}

const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  version: string;
};
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
const values = settings();
const before = [
  ...checkVersion(version, changelog),
  ...checkResolver(values.get("WXT_RESOLVER_URL")),
];
if (before.length > 0) fail(before);

const zip = join(root, ".output", `ojolink-${version}-chrome.zip`);
rmSync(zip, { force: true });
const env = { ...process.env, ...Object.fromEntries(values) };

if (!run("pnpm exec wxt zip", env) || !existsSync(zip)) fail(["the package could not be built"]);
if (!run("pnpm test", env)) {
  rmSync(zip, { force: true });
  fail(["the checks of the package did not pass; no file was left"]);
}

const entries = readZip(readFileSync(zip));
const manifestEntry = entries.find((entry) => entry.name === "manifest.json");
const manifest = JSON.parse(manifestEntry?.data.toString("utf8") ?? "{}") as ReleaseManifest & {
  permissions?: string[];
  host_permissions?: string[];
  optional_host_permissions?: string[];
};
const problems = [
  ...checkContents(
    entries.map((entry) => entry.name),
    manifest,
  ),
  ...(manifest.version === version ? [] : [`the manifest says version ${manifest.version}`]),
  ...leakedSettings(
    entries
      .filter((entry) => TEXT.test(entry.name))
      .map((entry) => ({ name: entry.name, text: entry.data.toString("utf8") })),
    values,
  ),
];
if (problems.length > 0) {
  rmSync(zip, { force: true });
  fail(problems);
}

const commit = capture("git rev-parse --short HEAD") || "unknown";
const clean = capture("git status --porcelain") === "";
const lines = [
  "",
  `Package:   ${zip}`,
  `Size:      ${(statSync(zip).size / 1024).toFixed(0)} kB, ${entries.length} files`,
  `Version:   ${version}`,
  `Resolver:  ${values.get("WXT_RESOLVER_URL")}`,
  `Donations: ${values.get("WXT_DONATE_URL") ?? "none, the panel shows no donation link"}`,
  `Commit:    ${commit}${clean ? "" : " (with changes that are not committed)"}`,
  `Permissions: ${(manifest.permissions ?? []).join(", ")}`,
  `Sites:       ${(manifest.host_permissions ?? []).join(", ")}`,
  `Optional:    ${(manifest.optional_host_permissions ?? []).join(", ")}`,
  "",
  "Nothing was uploaded and nothing was recorded. Follow PUBLICAR.md from here.",
  "",
];
process.stdout.write(lines.join("\n"));
