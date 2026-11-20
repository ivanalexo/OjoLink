export const strings = {
  appName: "OjoLink",
  tagline: "Revisa un enlace antes de abrirlo.",
  privacy: "Todo se analiza en tu dispositivo. Lo que pegas no se envía ni se guarda.",
  fieldLabel: "Enlace o mensaje",
  fieldHint: "Pega un enlace o el mensaje completo que recibiste.",
  analyze: "Analizar",
  shortcut: "También puedes analizar con Ctrl + Enter.",
  resultsHeading: "Resultados",
  oneLink: "Se encontró 1 enlace: {levels}.",
  manyLinks: "Se encontraron {count} enlaces: {levels}.",
  linkLabel: "Enlace revisado",
  weight: "peso {weight}",
} as const;

export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}
