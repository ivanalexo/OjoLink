import type { SiteRejection } from "./sites.ts";

export const strings = {
  name: "OjoLink",
  description:
    "Revisa los enlaces de tu correo antes de que los abras. Todo se analiza en tu equipo.",
  checkedOne: "1 enlace revisado",
  checkedMany: "{count} enlaces revisados",
  noSigns: "sin señales de alerta",
  flaggedOne: "1 con aviso",
  flaggedMany: "{count} con avisos",
  leadsTo: "Lleva a {host}.",
  warningHeading: "OjoLink detuvo este enlace",
  warningLeadsTo: "Lleva a:",
  back: "Volver",
  openAnyway: "Abrir de todos modos",
  optionsTitle: "Sitios donde funciona OjoLink",
  defaultHeading: "Siempre activo",
  defaultIntro: "OjoLink revisa los enlaces en estos sitios de correo desde que se instala.",
  grantedHeading: "Sitios que agregaste",
  grantedEmpty: "Todavía no agregaste ningún sitio.",
  addLabel: "Agregar otro sitio de correo",
  addHint:
    "Escribe su dirección, por ejemplo mail.proton.me. El navegador te pedirá confirmar el permiso.",
  addButton: "Agregar sitio",
  removeButton: "Quitar",
  removeLabel: "Quitar {host}",
  added: "OjoLink ya funciona en {host}. Recarga esa página para empezar.",
  removed: "OjoLink dejó de funcionar en {host}.",
  dismissed: "No se agregó {host}: el permiso no se confirmó.",
  failed: "No se pudo cambiar el permiso. Inténtalo de nuevo.",
  rejections: {
    empty: "Escribe la dirección del sitio.",
    wildcard: "Escribe un solo sitio, sin asteriscos.",
    "not-https": "Solo se pueden agregar sitios seguros, los que empiezan con https.",
    port: "Escribe la dirección sin número de puerto.",
    "ip-address": "Escribe el nombre del sitio, no una dirección IP.",
    "not-a-host": "Eso no parece la dirección de un sitio.",
    "default-site": "OjoLink ya funciona en ese sitio.",
  } satisfies Record<SiteRejection, string>,
} as const;

export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? (values[name] ?? placeholder) : placeholder,
  );
}
