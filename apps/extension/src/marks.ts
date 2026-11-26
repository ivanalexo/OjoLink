import { HOST_STYLE, ICONS, isMarked, MARK_CSS, type MarkedLevel } from "./mark-style.ts";
import { strings } from "./strings.ts";
import type { Tooltip } from "./tooltip.ts";
import type { LinkVerdict } from "./verdicts.ts";

export const MARK_TAG = "ojolink-mark";
const SVG = "http://www.w3.org/2000/svg";
const DESCRIPTION = "aria-description";

export interface MarkView {
  readonly host: HTMLElement;
  readonly level: MarkedLevel;
  readonly label: string;
  readonly reason: string;
  /** True when activating the mark offers to reveal the destination. */
  readonly control: boolean;
  /** The content the page cannot reach, for tests. */
  readonly root: ShadowRoot;
}

interface Entry {
  host: HTMLElement;
  root: ShadowRoot;
  pill: HTMLElement;
  word: HTMLElement;
  control: boolean;
  level: MarkedLevel;
  label: string;
  reason: string;
  previousDescription: string | null;
  release(): void;
}

export interface Marks {
  /** Shows, updates, or removes the mark of a link according to its verdict. */
  apply(anchor: HTMLAnchorElement, verdict: LinkVerdict | null): void;
  /** Removes marks whose link is gone and puts back marks that were moved or dropped. */
  sweep(): void;
  /** Removes every mark and gives each link back what it had. */
  clear(): void;
  view(anchor: HTMLAnchorElement): MarkView | null;
  readonly count: number;
  /** How many links carry a mark, by level. */
  readonly levels: Readonly<Record<MarkedLevel, number>>;
}

function drawIcon(doc: Document, level: MarkedLevel): SVGElement {
  const svg = doc.createElementNS(SVG, "svg");
  for (const [name, value] of Object.entries({
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
    "data-icon": level,
  })) {
    svg.setAttribute(name, value);
  }
  for (const d of ICONS[level]) {
    const path = doc.createElementNS(SVG, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

/**
 * Creates the marks shown next to suspicious links. Every text is set as text, never as markup.
 * The mark of a hidden destination is a control: activating it calls `onActivate`.
 */
export function createMarks(
  doc: Document,
  tooltip: Tooltip,
  onActivate: (anchor: HTMLAnchorElement) => void = () => undefined,
): Marks {
  const entries = new Map<HTMLAnchorElement, Entry>();

  function describe(anchor: HTMLAnchorElement, entry: Entry): void {
    const sentence = `${entry.label}: ${entry.reason}`;
    entry.host.setAttribute(
      "aria-label",
      entry.control ? `${sentence} ${strings.markReveals}` : sentence,
    );
    anchor.setAttribute(DESCRIPTION, sentence);
  }

  function setControl(entry: Entry, control: boolean): void {
    entry.control = control;
    entry.host.setAttribute("role", control ? "button" : "note");
    if (control) entry.host.setAttribute("tabindex", "0");
    else entry.host.removeAttribute("tabindex");
    entry.pill.dataset.control = String(control);
  }

  function paint(entry: Entry, level: MarkedLevel, label: string): void {
    entry.pill.dataset.level = level;
    entry.pill.replaceChildren(drawIcon(doc, level), entry.word);
    entry.word.textContent = label;
  }

  function create(anchor: HTMLAnchorElement, level: MarkedLevel, verdict: LinkVerdict): Entry {
    const host = doc.createElement(MARK_TAG);
    host.setAttribute("style", HOST_STYLE);
    host.setAttribute("contenteditable", "false");
    host.setAttribute("role", "note");
    const root = host.attachShadow({ mode: "closed" });
    const style = doc.createElement("style");
    style.textContent = MARK_CSS;
    const pill = doc.createElement("span");
    pill.className = "pill";
    const word = doc.createElement("span");
    root.append(style, pill);

    const show = (): void => {
      const current = entries.get(anchor);
      if (current) tooltip.show(current.host, current);
    };
    const hide = (): void => tooltip.hide();
    const targets: readonly HTMLElement[] = [anchor, host];
    for (const target of targets) {
      target.addEventListener("pointerenter", show);
      target.addEventListener("pointerleave", hide);
    }
    anchor.addEventListener("focusin", show);
    anchor.addEventListener("focusout", hide);
    const activate = (event: Event): void => {
      if (!entries.get(anchor)?.control) return;
      const key = (event as KeyboardEvent).key;
      if (event.type === "keydown" && key !== "Enter" && key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      tooltip.hide();
      onActivate(anchor);
    };
    host.addEventListener("click", activate);
    host.addEventListener("keydown", activate);
    host.addEventListener("focus", show);
    host.addEventListener("blur", hide);

    const entry: Entry = {
      host,
      root,
      pill,
      word,
      control: false,
      level,
      label: verdict.label,
      reason: verdict.reason,
      previousDescription: anchor.getAttribute(DESCRIPTION),
      release() {
        for (const target of targets) {
          target.removeEventListener("pointerenter", show);
          target.removeEventListener("pointerleave", hide);
        }
        anchor.removeEventListener("focusin", show);
        anchor.removeEventListener("focusout", hide);
        host.removeEventListener("click", activate);
        host.removeEventListener("keydown", activate);
        host.removeEventListener("focus", show);
        host.removeEventListener("blur", hide);
      },
    };
    paint(entry, level, verdict.label);
    return entry;
  }

  function remove(anchor: HTMLAnchorElement): void {
    const entry = entries.get(anchor);
    if (!entry) return;
    entries.delete(anchor);
    entry.release();
    entry.host.remove();
    tooltip.hide();
    if (entry.previousDescription === null) anchor.removeAttribute(DESCRIPTION);
    else anchor.setAttribute(DESCRIPTION, entry.previousDescription);
  }

  function place(anchor: HTMLAnchorElement, entry: Entry): void {
    if (anchor.nextSibling !== entry.host) anchor.after(entry.host);
  }

  return {
    get count() {
      return entries.size;
    },
    get levels() {
      const levels = { danger: 0, caution: 0, "hidden-destination": 0 };
      for (const entry of entries.values()) levels[entry.level] += 1;
      return levels;
    },
    view(anchor) {
      const entry = entries.get(anchor);
      return entry ? { ...entry } : null;
    },
    apply(anchor, verdict) {
      if (verdict === null || !isMarked(verdict.level) || !anchor.isConnected) {
        remove(anchor);
        return;
      }
      let entry = entries.get(anchor);
      if (!entry) {
        entry = create(anchor, verdict.level, verdict);
        entries.set(anchor, entry);
      } else if (entry.level !== verdict.level || entry.label !== verdict.label) {
        paint(entry, verdict.level, verdict.label);
      }
      entry.level = verdict.level;
      entry.label = verdict.label;
      entry.reason = verdict.reason;
      setControl(entry, verdict.level === "hidden-destination" && verdict.hidden !== undefined);
      describe(anchor, entry);
      place(anchor, entry);
    },
    clear() {
      for (const anchor of [...entries.keys()]) remove(anchor);
    },
    sweep() {
      const known = new Set<Element>();
      for (const [anchor, entry] of [...entries]) {
        if (!anchor.isConnected) {
          remove(anchor);
          continue;
        }
        place(anchor, entry);
        known.add(entry.host);
      }
      for (const stray of doc.querySelectorAll(MARK_TAG)) {
        if (!known.has(stray)) stray.remove();
      }
    },
  };
}
