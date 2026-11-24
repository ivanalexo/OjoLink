export const strings = {
  appName: "OjoLink",
  tagline: "Revisa un enlace antes de abrirlo.",
  privacy: "Todo se analiza en tu dispositivo. Lo que pegas no se envía ni se guarda.",
  privacyWithReveal:
    "Todo se analiza en tu dispositivo. Lo que pegas no se envía ni se guarda. La única excepción son los enlaces cortos: se consultan al servicio de OjoLink para revelar su destino.",
  fieldLabel: "Enlace o mensaje",
  fieldHint: "Pega un enlace o el mensaje completo que recibiste.",
  analyze: "Analizar",
  shortcut: "También puedes analizar con Ctrl + Enter.",
  resultsHeading: "Resultados",
  oneLink: "Se encontró 1 enlace: {levels}.",
  manyLinks: "Se encontraron {count} enlaces: {levels}.",
  linkLabel: "Enlace revisado",
  weight: "peso {weight}",
  installHint:
    "Instala OjoLink desde el menú del navegador para que aparezca al compartir un enlace desde otras apps.",
  iosLink: "Cómo compartir enlaces desde iPhone o iPad",
  iosHint: "En iPhone y iPad puedes enviar enlaces a OjoLink desde el menú de compartir.",
  iosTitle: "Compartir desde iPhone o iPad",
  iosIntro:
    "Con un atajo, OjoLink aparece en el menú de compartir. El atajo abre esta página en Safari con el enlace ya analizado.",
  iosReady: "Agregar el atajo ya preparado",
  iosManual: "Crear el atajo a mano",
  iosSteps: [
    "Abre la app Atajos y toca el signo más para crear un atajo nuevo. Ponle el nombre Revisar con OjoLink.",
    "Toca el ícono de información del atajo y activa Mostrar en la hoja de compartir. En los tipos que recibe, deja solo Direcciones URL y Texto.",
    "Agrega la acción Codificar URL y elige como entrada lo que recibe el atajo.",
    "Agrega la acción URL y escribe la dirección de abajo. Al final, inserta el resultado de Codificar URL.",
    "Agrega la acción Abrir URL y guarda el atajo.",
  ],
  iosAddress: "Dirección para el paso 4",
  iosUse:
    "Para usarlo, toca Compartir en un enlace o en un mensaje y elige Revisar con OjoLink. La primera vez, iOS pide permiso para abrir la página.",
  iosBack: "Volver a revisar un enlace",
} as const;

export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}
