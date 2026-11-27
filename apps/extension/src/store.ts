import {
  OPTIONAL_HOSTS,
  PERMISSION_REASONS,
  REQUIRED_HOSTS,
  SITE_REASONS,
  type ManifestAccess,
} from "./permissions.ts";

export type JustifiedKind = "permiso" | "sitio" | "sitio opcional" | "servicio";

export interface Justification {
  /** What the manifest declares, as written there. */
  readonly item: string;
  readonly kind: JustifiedKind;
  /** How the store material names it. The resolver's address is a build setting, so it has none. */
  readonly label: string;
  readonly text: string;
}

export const RESOLVER_LABEL = "Servicio de OjoLink para revelar destinos";

function hostOf(pattern: string): string {
  return pattern.replace(/^https?:\/\//, "").replace(/\/\*$/, "");
}

/**
 * The published reason for everything a manifest declares. It throws on anything declared
 * with no reason, so a new permission cannot ship unexplained.
 */
export function justifications(manifest: ManifestAccess): Justification[] {
  const missing = (item: string): never => {
    throw new Error(`"${item}" is declared with no published justification`);
  };
  const capabilities = manifest.permissions.map((item): Justification => {
    const text = PERMISSION_REASONS[item];
    return { item, kind: "permiso", label: item, text: text ?? missing(item) };
  });
  const sites = manifest.host_permissions.map((item): Justification => {
    if (REQUIRED_HOSTS.includes(item)) {
      const host = hostOf(item);
      return { item, kind: "sitio", label: host, text: SITE_REASONS.mail.replace("{host}", host) };
    }
    return { item, kind: "servicio", label: RESOLVER_LABEL, text: SITE_REASONS.resolver };
  });
  const optional = manifest.optional_host_permissions.map((item): Justification => {
    if (!OPTIONAL_HOSTS.includes(item)) return missing(item);
    return { item, kind: "sitio opcional", label: item, text: SITE_REASONS.optional };
  });
  const all = [...capabilities, ...sites, ...optional];
  const resolvers = all.filter((entry) => entry.kind === "servicio");
  if (resolvers.length > 1) return missing(resolvers[1]?.item ?? "");
  return all;
}

/** The longest text a store's justification field takes. Chrome Web Store, November 2026. */
export const FIELD_LIMIT = 1000;

/**
 * One text for every site at once. Chrome Web Store has a single field for all host
 * permissions, so the reasons of each kind are joined, each with the sites it covers.
 */
export function hostJustification(entries: readonly Justification[]): string {
  const of = (kind: JustifiedKind) => entries.filter((entry) => entry.kind === kind);
  const mail = of("sitio");
  const parts: string[] = [];
  if (mail.length > 0) {
    const names = mail.map((entry) => entry.label).join(", ");
    parts.push(`Correo web (${names}): ${SITE_REASONS.mail.replace("{host}", "esos sitios")}`);
  }
  for (const entry of of("sitio opcional")) {
    parts.push(`Patrón opcional ${entry.item}: ${entry.text}`);
  }
  for (const entry of of("servicio")) parts.push(`${entry.label}: ${entry.text}`);
  return parts.join("\n\n");
}

/** The file the owner pastes from when a store asks why each permission is needed. */
export function renderPermissions(entries: readonly Justification[]): string {
  const lines = [
    "# Justificación de permisos",
    "",
    "Generado por `pnpm --filter @ojolink/extension store:permissions` a partir de `src/permissions.ts`. No lo edites a mano: cambia el texto en el código y vuelve a generarlo.",
    "",
    "Cada apartado es lo que el manifiesto declara y el texto que se pega en el formulario de la tienda.",
  ];
  for (const entry of entries) {
    lines.push("", `## ${entry.label}`, "", `Tipo: ${entry.kind}.`, "", entry.text);
  }
  lines.push(
    "",
    "## Permiso de host, en un solo campo",
    "",
    "Chrome Web Store tiene un único campo para todos los sitios. Pega este texto ahí:",
    "",
    hostJustification(entries),
  );
  return `${lines.join("\n")}\n`;
}
