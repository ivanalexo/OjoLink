import { PALETTE, type MarkedLevel } from "./mark-style.ts";
import { fill, strings } from "./strings.ts";

export const INDICATOR_TAG = "ojolink-status";
export const COMPACT_AFTER_MS = 6000;
const SVG = "http://www.w3.org/2000/svg";

export interface PageCounts {
  /** Links of the page the engine gave a verdict for. */
  readonly checked: number;
  /** Links with a mark, by level. */
  readonly marked: Readonly<Record<MarkedLevel, number>>;
}

export type IndicatorTone = "clear" | MarkedLevel;

export interface IndicatorView {
  readonly tone: IndicatorTone;
  readonly text: string;
  readonly short: string;
  readonly compact: boolean;
}

export interface Indicator {
  update(counts: PageCounts): void;
  remove(): void;
  /** What the indicator shows, or null while it is hidden. For tests: the page cannot read it. */
  readonly view: IndicatorView | null;
}

const CLEAR = { text: "#14613a", fill: "#dff3e7", edge: "#9fd0b4" };
const CHECK = ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "m8 12 3 3 5-6"];
const ALERT = [
  "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  "M12 9v4m0 4h.01",
];

const HOST_STYLE = [
  "all: initial",
  "position: fixed",
  "left: 50%",
  "bottom: 14px",
  "top: auto",
  "right: auto",
  "z-index: 2147483646",
  "display: block",
  "visibility: visible",
  "opacity: 1",
  "transform: translateX(-50%)",
  "pointer-events: none",
]
  .map((rule) => `${rule} !important`)
  .join("; ");

const tones = (["danger", "caution", "hidden-destination"] as const)
  .map(
    (level) =>
      `.chip[data-tone="${level}"] { color: ${PALETTE[level].text}; background: ${PALETTE[level].fill}; border-color: ${PALETTE[level].edge}; }`,
  )
  .join("\n");

const CSS = `
:host { all: initial; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  max-width: 22rem;
  padding: 0.35em 0.7em;
  border: 1px solid ${CLEAR.edge};
  border-radius: 999px;
  background: ${CLEAR.fill};
  color: ${CLEAR.text};
  box-shadow: 0 3px 12px rgb(0 0 0 / 28%);
  font: 600 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  pointer-events: auto;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
}
${tones}
.chip svg { width: 1.2em; height: 1.2em; flex: none; }
.short { display: none; }
.chip[data-compact="true"]:not(:hover) .full { display: none; }
.chip[data-compact="true"]:not(:hover) .short { display: inline; }
`;

/** The paths of the icon for each tone, and for a plain note. */
export const STATE_ICONS: Readonly<Record<string, readonly string[]>> = {
  clear: CHECK,
  danger: ALERT,
  caution: ALERT,
  "hidden-destination": ALERT,
  note: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 16v-4m0-4h.01"],
};

/** The sentence and tone for what was found on a page. The indicator and the panel share it. */
export function describeCounts(counts: PageCounts): Omit<IndicatorView, "compact"> {
  const { danger, caution } = counts.marked;
  const hidden = counts.marked["hidden-destination"];
  const flagged = danger + caution + hidden;
  const checked = fill(counts.checked === 1 ? strings.checkedOne : strings.checkedMany, {
    count: String(counts.checked),
  });
  if (flagged === 0) {
    return {
      tone: "clear",
      text: `${strings.name} · ${checked}, ${strings.noSigns}`,
      short: `${strings.name} · ${counts.checked}`,
    };
  }
  const tone: MarkedLevel = danger > 0 ? "danger" : caution > 0 ? "caution" : "hidden-destination";
  const warned = fill(flagged === 1 ? strings.flaggedOne : strings.flaggedMany, {
    count: String(flagged),
  });
  return {
    tone,
    text: `${strings.name} · ${checked}, ${warned}`,
    short: `${strings.name} · ${flagged}`,
  };
}

/**
 * A small note at the bottom of the page saying how many links were checked and how many got
 * a mark, so a page with nothing suspicious still shows that the extension looked at it.
 */
export function createIndicator(doc: Document): Indicator {
  let host: HTMLElement | null = null;
  let chip: HTMLElement | null = null;
  let full: HTMLElement | null = null;
  let short: HTMLElement | null = null;
  let view: IndicatorView | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function icon(paths: readonly string[]): SVGElement {
    const svg = doc.createElementNS(SVG, "svg");
    for (const [name, value] of Object.entries({
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    })) {
      svg.setAttribute(name, value);
    }
    for (const d of paths) {
      const path = doc.createElementNS(SVG, "path");
      path.setAttribute("d", d);
      svg.append(path);
    }
    return svg;
  }

  function build(): void {
    host = doc.createElement(INDICATOR_TAG);
    host.setAttribute("style", HOST_STYLE);
    host.setAttribute("role", "status");
    const root = host.attachShadow({ mode: "closed" });
    const style = doc.createElement("style");
    style.textContent = CSS;
    chip = doc.createElement("span");
    chip.className = "chip";
    full = doc.createElement("span");
    full.className = "full";
    short = doc.createElement("span");
    short.className = "short";
    root.append(style, chip);
  }

  function remove(): void {
    clearTimeout(timer);
    host?.remove();
    view = null;
  }

  return {
    get view() {
      return view;
    },
    remove,
    update(counts) {
      if (counts.checked === 0) {
        remove();
        return;
      }
      const next = describeCounts(counts);
      if (view && view.text === next.text && view.tone === next.tone && host?.isConnected) return;
      if (!host) build();
      if (!host || !chip || !full || !short) return;

      full.textContent = next.text;
      short.textContent = next.short;
      chip.dataset.tone = next.tone;
      chip.dataset.compact = "false";
      chip.replaceChildren(icon(next.tone === "clear" ? CHECK : ALERT), full, short);
      host.setAttribute("aria-label", next.text);
      if (!host.isConnected) doc.documentElement.append(host);
      view = { ...next, compact: false };

      clearTimeout(timer);
      timer = setTimeout(() => {
        if (chip) chip.dataset.compact = "true";
        if (view) view = { ...view, compact: true };
      }, COMPACT_AFTER_MS);
    },
  };
}
