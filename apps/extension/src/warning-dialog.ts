import { ICONS, PALETTE } from "./mark-style.ts";
import { strings } from "./strings.ts";

export const WARNING_TAG = "ojolink-warning";
const SVG = "http://www.w3.org/2000/svg";
const KEY_EVENTS = ["keydown", "keyup", "keypress"] as const;
const POINTER_EVENTS = [
  "click",
  "auxclick",
  "dblclick",
  "contextmenu",
  "mousedown",
  "mouseup",
  "pointerdown",
  "pointerup",
] as const;

export interface WarningContent {
  readonly title: string;
  readonly explanation: string;
  readonly advice: string;
  /** The host the link leads to, in ASCII form. */
  readonly host: string;
}

export type WarningChoice = "back" | "open";

export interface WarningView {
  readonly content: WarningContent;
  readonly focused: WarningChoice;
}

export interface WarningDialog {
  /** Shows the warning. False when one is already open or the browser could not show it. */
  open(
    content: WarningContent,
    onChoice: (choice: WarningChoice) => void,
    returnTo?: HTMLElement | null,
  ): boolean;
  /** Closes the warning as if the person had gone back. */
  close(): void;
  remove(): void;
  /** What the warning shows, or null while it is closed. For tests: the page cannot read it. */
  readonly view: WarningView | null;
}

export interface WarningDialogOptions {
  /** Hands the closed root to a test. Never set by the extension itself. */
  readonly expose?: (root: ShadowRoot) => void;
}

/** Text and background pairs of the warning, for the contrast check. */
export const WARNING_COLORS = {
  heading: { text: PALETTE.danger.text, fill: "#ffffff" },
  body: { text: "#17202c", fill: "#ffffff" },
  host: { text: "#17202c", fill: "#eef1f5" },
  back: { text: "#ffffff", fill: "#17202c" },
  open: { text: "#3d4a5c", fill: "#ffffff" },
} as const;

const HOST_STYLE = [
  "all: initial",
  "position: fixed",
  "top: 0",
  "left: 0",
  "width: 0",
  "height: 0",
  "z-index: 2147483647",
  "display: block",
  "visibility: visible",
  "opacity: 1",
  "transform: none",
  "pointer-events: auto",
]
  .map((rule) => `${rule} !important`)
  .join("; ");

const CSS = `
:host { all: initial; }
dialog {
  box-sizing: border-box;
  width: min(30rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  margin: auto;
  padding: 0;
  border: 1px solid ${PALETTE.danger.edge};
  border-top: 6px solid ${PALETTE.danger.text};
  border-radius: 12px;
  background: ${WARNING_COLORS.body.fill};
  color: ${WARNING_COLORS.body.text};
  box-shadow: 0 18px 50px rgb(0 0 0 / 40%);
  font: 400 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  overflow: auto;
}
dialog::backdrop { background: rgb(15 20 30 / 60%); }
.body { padding: 1.2rem 1.4rem 1.3rem; }
h2 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.8rem;
  color: ${WARNING_COLORS.heading.text};
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.3;
}
h2 svg { width: 1.5em; height: 1.5em; flex: none; }
p { margin: 0 0 0.7rem; overflow-wrap: anywhere; }
.title { font-weight: 700; }
.advice { margin-top: 0.8rem; }
.leads { margin-bottom: 0.25rem; font-weight: 600; }
.host {
  display: block;
  padding: 0.5em 0.7em;
  border-radius: 6px;
  background: ${WARNING_COLORS.host.fill};
  color: ${WARNING_COLORS.host.text};
  font: 400 14px/1.4 ui-monospace, Consolas, "Courier New", monospace;
  direction: ltr;
  unicode-bidi: bidi-override;
  text-align: left;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem 1.2rem;
  margin-top: 1.2rem;
}
button { font: inherit; cursor: pointer; border: 0; border-radius: 8px; }
button:focus-visible { outline: 3px solid #1a5fd0; outline-offset: 2px; }
.back {
  padding: 0.6em 1.5em;
  background: ${WARNING_COLORS.back.fill};
  color: ${WARNING_COLORS.back.text};
  font-weight: 600;
}
.open {
  padding: 0.6em 0.3em;
  background: none;
  color: ${WARNING_COLORS.open.text};
  text-decoration: underline;
}
`;

type Modal = HTMLDialogElement & { showModal?: () => void; close?: () => void };

/** The warning for a stopped link, drawn above the page where the page cannot reach it. */
export function createWarningDialog(
  doc: Document,
  options: WarningDialogOptions = {},
): WarningDialog {
  const view = doc.defaultView;
  let host: HTMLElement | null = null;
  let dialog: Modal | null = null;
  let title: HTMLElement | null = null;
  let explanation: HTMLElement | null = null;
  let hostLine: HTMLElement | null = null;
  let advice: HTMLElement | null = null;
  let buttons: Record<WarningChoice, HTMLButtonElement> | null = null;
  let current: WarningView | null = null;
  let report: ((choice: WarningChoice) => void) | null = null;
  let origin: HTMLElement | null = null;

  function icon(): SVGElement {
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
    for (const d of ICONS.danger) {
      const path = doc.createElementNS(SVG, "path");
      path.setAttribute("d", d);
      svg.append(path);
    }
    return svg;
  }

  function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text = "",
  ): HTMLElementTagNameMap[K] {
    const made = doc.createElement(tag);
    if (className) made.className = className;
    if (text) made.textContent = text;
    return made;
  }

  function focusOn(choice: WarningChoice): void {
    buttons?.[choice].focus();
    if (current) current = { ...current, focused: choice };
  }

  function choose(choice: WarningChoice): void {
    if (current === null) return;
    const done = report;
    finish();
    done?.(choice);
  }

  function onKey(event: Event): void {
    if (current === null) return;
    event.stopImmediatePropagation();
    if (event.type !== "keydown") return;
    const { key } = event as KeyboardEvent;
    if (key === "Escape") {
      event.preventDefault();
      choose("back");
    } else if (key === "Tab") {
      event.preventDefault();
      focusOn(current?.focused === "back" ? "open" : "back");
    }
  }

  function build(): void {
    host = doc.createElement(WARNING_TAG);
    host.setAttribute("style", HOST_STYLE);
    const root = host.attachShadow({ mode: "closed" });
    const style = doc.createElement("style");
    style.textContent = CSS;

    dialog = doc.createElement("dialog") as Modal;
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "heading");
    dialog.setAttribute("aria-describedby", "reason");

    const heading = element("h2", "");
    heading.id = "heading";
    heading.append(icon(), strings.warningHeading);
    const reason = element("div", "");
    reason.id = "reason";
    title = element("p", "title");
    explanation = element("p", "");
    reason.append(title, explanation);
    hostLine = element("code", "host");
    advice = element("p", "advice");
    const back = element("button", "back", strings.back);
    const open = element("button", "open", strings.openAnyway);
    back.type = "button";
    open.type = "button";
    buttons = { back, open };
    const actions = element("div", "actions");
    actions.append(open, back);
    const lead = element("p", "leads", strings.warningLeadsTo);
    const body = element("div", "body");
    body.append(heading, reason, lead, hostLine, advice, actions);
    dialog.append(body);

    back.addEventListener("click", () => choose("back"));
    open.addEventListener("click", () => choose("open"));
    back.addEventListener("focus", () => {
      if (current) current = { ...current, focused: "back" };
    });
    open.addEventListener("focus", () => {
      if (current) current = { ...current, focused: "open" };
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      choose("back");
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) choose("back");
    });

    root.append(style, dialog);
    for (const type of POINTER_EVENTS) {
      host.addEventListener(type, (event) => event.stopPropagation());
    }
    options.expose?.(root);
  }

  function finish(): void {
    if (current === null) return;
    current = null;
    report = null;
    try {
      dialog?.close?.();
    } catch {
      // Already closed by the browser.
    }
    host?.remove();
    const back = origin;
    origin = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  }

  // Added when the page script starts, before any script of the page, so these run first.
  for (const type of KEY_EVENTS) view?.addEventListener(type, onKey, true);

  return {
    get view() {
      return current;
    },
    open(content, onChoice, returnTo = null) {
      if (current !== null) return false;
      if (!host) build();
      if (!host || !dialog || !title || !explanation || !hostLine || !advice) return false;

      title.textContent = content.title;
      explanation.textContent = content.explanation;
      hostLine.textContent = content.host;
      advice.textContent = content.advice;
      doc.documentElement.append(host);
      try {
        if (typeof dialog.showModal !== "function") throw new Error("no modal dialogs");
        dialog.showModal();
      } catch {
        host.remove();
        return false;
      }
      current = { content, focused: "back" };
      report = onChoice;
      origin = returnTo;
      focusOn("back");
      return true;
    },
    close() {
      choose("back");
    },
    remove() {
      report = null;
      finish();
      for (const type of KEY_EVENTS) view?.removeEventListener(type, onKey, true);
      host?.remove();
    },
  };
}
