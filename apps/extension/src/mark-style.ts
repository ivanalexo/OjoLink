import type { Level } from "@ojolink/core";

export type MarkedLevel = Exclude<Level, "safe">;

export const MARKED_LEVELS: readonly MarkedLevel[] = ["danger", "caution", "hidden-destination"];

export function isMarked(level: Level): level is MarkedLevel {
  return level !== "safe";
}

/** A light palette of its own: a message is shown on a light background in every theme. */
export const PALETTE: Readonly<Record<MarkedLevel, { text: string; fill: string; edge: string }>> =
  {
    danger: { text: "#a61b1b", fill: "#fde8e8", edge: "#e3a3a3" },
    caution: { text: "#7a4a00", fill: "#fdf0d5", edge: "#dcbb78" },
    "hidden-destination": { text: "#3d4a5c", fill: "#e6eaf0", edge: "#aab4c3" },
  };

/** Paths of each level's icon, on a 24 by 24 grid. The same shapes the web app draws. */
export const ICONS: Readonly<Record<MarkedLevel, readonly string[]>> = {
  danger: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "m9.5 9.5 5 5m0-5-5 5"],
  caution: [
    "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
    "M12 9v4m0 4h.01",
  ],
  "hidden-destination": [
    "M17.9 17.9A10.1 10.1 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2",
    "M1 1l22 22",
  ],
};

/** On the element the page can reach. Inline and important, so no style sheet can undo it. */
export const HOST_STYLE = [
  "all: initial",
  "display: inline-block",
  "visibility: visible",
  "opacity: 1",
  "position: static",
  "float: none",
  "clip-path: none",
  "transform: none",
  "width: auto",
  "height: auto",
  "min-width: 0",
  "min-height: 0",
  "max-width: none",
  "max-height: none",
  "margin: 0 0 0 0.3em",
  "vertical-align: middle",
  "pointer-events: auto",
]
  .map((rule) => `${rule} !important`)
  .join("; ");

const levelRules = MARKED_LEVELS.map(
  (level) =>
    `.pill[data-level="${level}"] { color: ${PALETTE[level].text}; background: ${PALETTE[level].fill}; border-color: ${PALETTE[level].edge}; }`,
).join("\n");

export const MARK_CSS = `
:host { all: initial; }
.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25em;
  padding: 0.05em 0.45em;
  border: 1px solid;
  border-radius: 999px;
  font: 600 12px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  white-space: nowrap;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
}
.pill svg { width: 1.1em; height: 1.1em; flex: none; }
.pill[data-control="true"] { cursor: pointer; text-decoration: underline dotted; }
:host(:focus-visible) .pill { outline: 2px solid #1a5fd0; outline-offset: 1px; }
${levelRules}
`;

export const TOOLTIP_HOST_STYLE = [
  "all: initial",
  "position: fixed",
  "inset: auto",
  "margin: 0",
  "padding: 0",
  "border: 0",
  "background: transparent",
  "overflow: visible",
  "z-index: 2147483647",
  "pointer-events: none",
]
  .map((rule) => `${rule} !important`)
  .join("; ");

export const TOOLTIP_CSS = `
:host { all: initial; }
.tip {
  box-sizing: border-box;
  max-width: 22rem;
  padding: 0.5em 0.7em;
  border: 1px solid #aab4c3;
  border-left-width: 4px;
  border-radius: 8px;
  background: #ffffff;
  color: #17202c;
  box-shadow: 0 4px 14px rgb(0 0 0 / 22%);
  font: 400 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
  overflow-wrap: anywhere;
}
.tip strong { font-weight: 700; }
.tip[data-level="safe"] { border-left-color: #14613a; } .tip[data-level="safe"] strong { color: #14613a; }
${MARKED_LEVELS.map((level) => `.tip[data-level="${level}"] { border-left-color: ${PALETTE[level].text}; } .tip[data-level="${level}"] strong { color: ${PALETTE[level].text}; }`).join("\n")}
`;
