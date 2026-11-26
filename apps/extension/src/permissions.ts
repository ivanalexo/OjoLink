import { DEFAULT_PATTERNS } from "./sites.ts";

/**
 * Every browser capability the extension declares, with the reason it needs it. These are the
 * texts published to the stores, written for the person who installs the extension.
 */
export const PERMISSION_REASONS: Readonly<Record<string, string>> = {
  storage:
    "Guarda en tu equipo tus ajustes y los dominios que decides proteger, y recuerda por unos minutos, en memoria, los destinos que revelaste. No se sincroniza con tu cuenta ni se envía a ningún servidor.",
  scripting:
    "Permite que OjoLink revise los enlaces en un sitio de correo que tú agregas, además de los tres que trae. No se usa para ninguna otra página.",
};

/** The reason for each kind of site the extension declares. Published like the ones above. */
export const SITE_REASONS = {
  mail: "OjoLink lee los enlaces de los mensajes que abres en {host} para avisarte de los sospechosos antes de que hagas clic. Los analiza en tu equipo: no envía el contenido de tus mensajes ni tus enlaces, y no lee nada fuera de esa página.",
  optional:
    "No concede acceso a ningún sitio por sí solo. Existe para que quien usa otro correo web pueda agregarlo: cada sitio necesita que lo escribas en las opciones y que aceptes el aviso del propio navegador, y puedes quitarlo cuando quieras.",
  resolver:
    "Es el único servidor con el que OjoLink se comunica. Solo se le consulta cuando pides «Revelar destino» de un enlace corto, o si activas esa opción al pasar el mouse, y solo se envía ese enlace corto. No se usa para nada más.",
} as const;

export const REQUIRED_HOSTS: readonly string[] = DEFAULT_PATTERNS;

/**
 * Lets the person add one more site at a time. It grants nothing by itself: each site needs
 * the person's action and the browser's own prompt.
 */
export const OPTIONAL_HOSTS: readonly string[] = ["https://*/*"];

/** Capabilities the extension must never declare. */
export const EXCLUDED_PERMISSIONS: readonly string[] = [
  "tabs",
  "activeTab",
  "history",
  "cookies",
  "downloads",
  "webRequest",
  "webNavigation",
  "declarativeNetRequest",
  "browsingData",
  "management",
  "<all_urls>",
];

const SCRIPT_POLICY = "script-src 'self'; object-src 'none'";

/** What the extension's own pages and background may load and contact. */
export function extensionPagesPolicy(resolver: string | null): string {
  return `${SCRIPT_POLICY}; connect-src ${resolver === null ? "'none'" : `'self' ${resolver}`}`;
}

export interface ManifestAccess {
  readonly permissions: string[];
  readonly host_permissions: string[];
  readonly optional_host_permissions: string[];
  readonly content_security_policy: { extension_pages: string };
}

/**
 * Everything the manifest declares about access. The resolver is the one outside address
 * the extension may contact; a package built without one declares none.
 */
export function buildManifest(resolver: string | null): ManifestAccess {
  return {
    permissions: Object.keys(PERMISSION_REASONS),
    host_permissions: [...REQUIRED_HOSTS, ...(resolver === null ? [] : [`${resolver}/*`])],
    optional_host_permissions: [...OPTIONAL_HOSTS],
    content_security_policy: { extension_pages: extensionPagesPolicy(resolver) },
  };
}
