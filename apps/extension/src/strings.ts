import type { FailureReason } from "./reveal.ts";
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
  open: "Abrir",
  cancel: "Cancelar",
  reveal: "Revelar destino",
  retry: "Intentar de nuevo",
  privacyPolicy: "Política de privacidad",
  hiddenHeading: "Este enlace no muestra a dónde lleva",
  hiddenShortener: "Pasa por {service}, un acortador de enlaces.",
  hiddenTracker: "Pasa por {service}, un enlace de seguimiento.",
  hiddenBody: "No se puede saber a qué sitio lleva sin abrirlo o sin preguntárselo al servicio.",
  revealNotice: "Al revelar, se envía solo este enlace corto al servicio de OjoLink.",
  revealUnavailable:
    "Esta copia de OjoLink no tiene configurado el servicio para revelar destinos.",
  revealingHeading: "Revelando a dónde lleva…",
  revealingTitle: "Preguntando al servicio de OjoLink por el enlace de {service}.",
  revealingBody: "Suele tardar un momento.",
  revealedHeading: "Destino revelado",
  revealedClearBody:
    "El enlace lleva a este sitio. OjoLink no le encontró señales de alerta; eso no garantiza que sea de confianza.",
  revealedReason: "Destino revelado. {reason}",
  revealedLeadsTo: "Destino revelado: lleva a {host}.",
  stillHiddenHeading: "El destino sigue oculto",
  stillHiddenTitle: "Lleva a otro enlace que tampoco muestra su destino.",
  stillHiddenBody: "Trátalo con cuidado: todavía no se sabe a qué sitio lleva.",
  failedHeading: "No se pudo revelar el destino",
  failedBody: "Trátalo con cuidado: no se sabe a qué sitio lleva.",
  failures: {
    unresolved: "El servicio no pudo averiguar a dónde lleva este enlace.",
    offline: "No hay conexión a internet.",
    limited: "Se hicieron muchas consultas seguidas. Inténtalo en un momento.",
    unavailable: "Esta copia de OjoLink no tiene configurado el servicio para revelar destinos.",
    error: "El servicio no respondió.",
  } satisfies Record<FailureReason, string>,
  markReveals: "Pulsa para revelar a dónde lleva.",
  hoverRevealing: "Revelando a dónde lleva…",
  hoverLimit: "Muchas consultas seguidas. Usa la marca para revelar este enlace.",
  hoverFailed: "No se pudo revelar a dónde lleva.",
  hoverStillHidden: "El destino sigue oculto tras otro enlace.",
  privacyHeading: "Qué sale de tu equipo",
  privacyReveal:
    "OjoLink revisa los enlaces en tu equipo. Solo cuando pulsas «Revelar destino» se envía ese enlace corto, y nada más, al servicio de OjoLink para averiguar a dónde lleva.",
  privacyNoResolver:
    "OjoLink revisa los enlaces en tu equipo y no envía nada. Esta copia no tiene configurado el servicio para revelar destinos.",
  hoverLabel: "Revelar el destino al dejar el mouse sobre un enlace",
  hoverHint:
    "Apagado por defecto. Si lo activas, cada enlace corto sobre el que dejes el mouse se envía al servicio de OjoLink.",
  hoverSaved: "Ajuste guardado.",
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
