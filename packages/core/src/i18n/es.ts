import type { Level } from "../score.js";

export interface LevelMessage {
  readonly label: string;
  readonly description: string;
}

export interface SignalMessage {
  readonly simple: string;
  readonly technical: string;
}

export interface Messages {
  readonly levels: Readonly<Record<Level, LevelMessage>>;
  readonly signals: Readonly<Record<string, SignalMessage>>;
}

export const es: Messages = {
  levels: {
    safe: {
      label: "Sin señales de alerta",
      description:
        "No encontramos señales de alerta en este enlace. Eso no garantiza que el sitio sea legítimo.",
    },
    caution: {
      label: "Precaución",
      description: "Este enlace tiene algo inusual. Revísalo antes de abrirlo.",
    },
    danger: {
      label: "Peligro",
      description: "Este enlace tiene señales claras de suplantación. Te recomendamos no abrirlo.",
    },
    "hidden-destination": {
      label: "Destino oculto",
      description: "No se sabe a dónde lleva este enlace.",
    },
  },
  signals: {},
};
