export const UNRELEASED = "sin publicar";
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const HEADING = /^## (\S+) [—-] (.+)$/gm;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** Folders the build emits, besides the files the manifest names. */
const BUILD_FOLDERS = ["chunks/", "assets/", "content-scripts/"];
const FORBIDDEN_ENDINGS = [".map", ".ts", ".tsx", ".test.js", ".env", ".local", ".md"];

export interface ReleaseManifest {
  readonly version?: string;
  readonly background?: { readonly service_worker?: string };
  readonly action?: { readonly default_popup?: string };
  readonly options_ui?: { readonly page?: string };
  readonly icons?: Readonly<Record<string, string>>;
  readonly content_scripts?: readonly { readonly js?: readonly string[] }[];
}

/** The versions of the changelog, each with what follows its dash: a date or "sin publicar". */
export function changelogVersions(changelog: string): Map<string, string> {
  const versions = new Map<string, string>();
  for (const match of changelog.matchAll(HEADING)) {
    versions.set(match[1] ?? "", (match[2] ?? "").trim());
  }
  return versions;
}

/** Why this version cannot be released, or an empty list. */
export function checkVersion(version: string, changelog: string): string[] {
  if (!VERSION.test(version)) {
    return [`The version "${version}" must be three numbers separated by dots.`];
  }
  const state = changelogVersions(changelog).get(version);
  if (state === undefined) return [`CHANGELOG.md has no entry for ${version}.`];
  if (DATE.test(state)) {
    return [`Version ${version} was already released on ${state}. Raise the version.`];
  }
  if (state !== UNRELEASED) {
    return [`The entry for ${version} must say "${UNRELEASED}" or carry a date (YYYY-MM-DD).`];
  }
  return [];
}

/** Why this resolver cannot go in a release, or an empty list. */
export function checkResolver(value: string | undefined): string[] {
  if (value === undefined || value.trim() === "") {
    return ["A release needs the public resolver's address in WXT_RESOLVER_URL."];
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return ["WXT_RESOLVER_URL is not an address."];
  }
  if (LOCAL_HOSTS.has(url.hostname)) {
    return ["A release cannot use a resolver on this machine. Set the public address."];
  }
  if (url.protocol !== "https:") return ["The resolver of a release must be an https address."];
  if (url.username !== "" || url.password !== "") {
    return ["The resolver's address must not carry credentials."];
  }
  return [];
}

function listed(manifest: ReleaseManifest): Set<string> {
  const names = [
    "manifest.json",
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    manifest.options_ui?.page,
    ...Object.values(manifest.icons ?? {}),
    ...(manifest.content_scripts ?? []).flatMap((script) => script.js ?? []),
  ];
  return new Set(names.filter((name): name is string => typeof name === "string"));
}

/** What is wrong with the files of a package, or an empty list. */
export function checkContents(names: readonly string[], manifest: ReleaseManifest): string[] {
  const problems: string[] = [];
  const files = names.filter((name) => !name.endsWith("/"));
  if (!files.includes("manifest.json")) problems.push("manifest.json is not at the top level");
  const known = listed(manifest);
  for (const name of known) {
    if (!files.includes(name)) problems.push(`the manifest names "${name}", which is missing`);
  }
  for (const name of files) {
    const base = name.split("/").at(-1) ?? name;
    if (base.startsWith(".") || FORBIDDEN_ENDINGS.some((ending) => name.endsWith(ending))) {
      problems.push(`"${name}" does not belong in a release`);
    } else if (name === "build-info.json") {
      problems.push(`"${name}" belongs beside the package, not inside it`);
    } else if (!known.has(name) && !BUILD_FOLDERS.some((folder) => name.startsWith(folder))) {
      problems.push(`"${name}" is not named by the manifest nor emitted by the build`);
    }
  }
  return problems;
}

/** The values of a settings file, by name. Comments and empty values are skipped. */
export function readEnv(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || line.trim().startsWith("#")) continue;
    const value = (match[2] ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");
    if (value !== "") values.set(match[1] ?? "", value);
  }
  return values;
}

/** Settings that must not be in a package but are: every value except the two public addresses. */
export function leakedSettings(
  files: readonly { readonly name: string; readonly text: string }[],
  settings: ReadonlyMap<string, string>,
  allowed: readonly string[] = ["WXT_RESOLVER_URL", "WXT_DONATE_URL"],
): string[] {
  const leaks: string[] = [];
  for (const [name, value] of settings) {
    if (allowed.includes(name) || value.length < 6) continue;
    for (const file of files) {
      if (file.text.includes(value)) leaks.push(`${name} appears in ${file.name}`);
    }
  }
  return leaks;
}
