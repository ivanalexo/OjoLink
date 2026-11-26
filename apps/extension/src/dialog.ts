import { ICONS, PALETTE } from "./mark-style.ts";
import { strings } from "./strings.ts";

export const DIALOG_TAG = "ojolink-warning";
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

export type Tone = "danger" | "hidden" | "caution" | "clear";

export interface DialogAction {
  readonly id: string;
  readonly label: string;
  /** The action that takes the focus. One per view. */
  readonly primary?: boolean;
  /** The dialog stays open after this action; the caller updates or closes it. */
  readonly keep?: boolean;
}

export interface DialogView {
  readonly tone: Tone;
  readonly heading: string;
  readonly title: string;
  readonly body: string;
  /** A host, shown as inert text under "Lleva a:". */
  readonly host?: string;
  readonly advice?: string;
  /** A sentence about what an action sends, with a control that opens the policy. */
  readonly notice?: { readonly text: string; readonly action: DialogAction };
  readonly busy?: boolean;
  /** In the order they are drawn. */
  readonly actions: readonly DialogAction[];
  /** The action Escape, the backdrop and close() stand for. It never opens anything. */
  readonly dismiss: string;
}

export interface Dialog {
  /** Shows the dialog. False when one is already open or the browser could not show it. */
  open(view: DialogView, onAction: (id: string) => void, returnTo?: HTMLElement | null): boolean;
  /** Replaces what an open dialog shows and moves the focus to its primary action. */
  update(view: DialogView): void;
  /** Closes the dialog as if the person had dismissed it. */
  close(): void;
  remove(): void;
  /** What the dialog shows and where the focus is, or null while it is closed. For tests. */
  readonly view: (DialogView & { readonly focused: string }) | null;
}

export interface DialogOptions {
  /** Hands the closed root to a test. Never set by the extension itself. */
  readonly expose?: (root: ShadowRoot) => void;
}

const CLEAR = { text: "#14613a", edge: "#9fd0b4" };
const CHECK = ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "m8 12 3 3 5-6"];

const TONES: Readonly<
  Record<Tone, { readonly accent: string; readonly edge: string; readonly icon: readonly string[] }>
> = {
  danger: { accent: PALETTE.danger.text, edge: PALETTE.danger.edge, icon: ICONS.danger },
  hidden: {
    accent: PALETTE["hidden-destination"].text,
    edge: PALETTE["hidden-destination"].edge,
    icon: ICONS["hidden-destination"],
  },
  caution: { accent: PALETTE.caution.text, edge: PALETTE.caution.edge, icon: ICONS.caution },
  clear: { accent: CLEAR.text, edge: CLEAR.edge, icon: CHECK },
};

export const TONE_NAMES = Object.keys(TONES) as readonly Tone[];

/** The icon of a tone, for the check that each tone has one of its own. */
export function toneIcon(tone: Tone): readonly string[] {
  return TONES[tone].icon;
}

/** Text and background pairs of the dialog, for the contrast check. */
export const DIALOG_COLORS: Readonly<Record<string, { text: string; fill: string }>> = {
  ...Object.fromEntries(
    TONE_NAMES.map((tone) => [`heading-${tone}`, { text: TONES[tone].accent, fill: "#ffffff" }]),
  ),
  body: { text: "#17202c", fill: "#ffffff" },
  host: { text: "#17202c", fill: "#eef1f5" },
  notice: { text: "#3d4a5c", fill: "#f4f6f9" },
  link: { text: "#1a4fb0", fill: "#f4f6f9" },
  primary: { text: "#ffffff", fill: "#17202c" },
  plain: { text: "#3d4a5c", fill: "#ffffff" },
};

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

const toneRules = TONE_NAMES.map(
  (tone) =>
    `dialog[data-tone="${tone}"] { border-color: ${TONES[tone].edge}; border-top-color: ${TONES[tone].accent}; } dialog[data-tone="${tone}"] h2 { color: ${TONES[tone].accent}; }`,
).join("\n");

const CSS = `
:host { all: initial; }
dialog {
  box-sizing: border-box;
  width: min(30rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  margin: auto;
  padding: 0;
  border: 1px solid;
  border-top: 6px solid;
  border-radius: 12px;
  background: ${DIALOG_COLORS.body?.fill};
  color: ${DIALOG_COLORS.body?.text};
  box-shadow: 0 18px 50px rgb(0 0 0 / 40%);
  font: 400 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  overflow: auto;
}
${toneRules}
dialog::backdrop { background: rgb(15 20 30 / 60%); }
.body { padding: 1.2rem 1.4rem 1.3rem; }
h2 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.8rem;
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
  background: ${DIALOG_COLORS.host?.fill};
  color: ${DIALOG_COLORS.host?.text};
  font: 400 14px/1.4 ui-monospace, Consolas, "Courier New", monospace;
  direction: ltr;
  unicode-bidi: bidi-override;
  text-align: left;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.notice {
  margin: 0.9rem 0 0;
  padding: 0.6em 0.8em;
  border-radius: 6px;
  background: ${DIALOG_COLORS.notice?.fill};
  color: ${DIALOG_COLORS.notice?.text};
  font-size: 0.9em;
}
.notice button {
  padding: 0;
  background: none;
  color: ${DIALOG_COLORS.link?.text};
  text-decoration: underline;
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
.primary {
  padding: 0.6em 1.5em;
  background: ${DIALOG_COLORS.primary?.fill};
  color: ${DIALOG_COLORS.primary?.text};
  font-weight: 600;
}
.plain {
  padding: 0.6em 0.3em;
  background: none;
  color: ${DIALOG_COLORS.plain?.text};
  text-decoration: underline;
}
.live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
[hidden] { display: none; }
`;

type Modal = HTMLDialogElement & { showModal?: () => void; close?: () => void };

interface Parts {
  readonly host: HTMLElement;
  readonly dialog: Modal;
  readonly heading: HTMLElement;
  readonly title: HTMLElement;
  readonly body: HTMLElement;
  readonly lead: HTMLElement;
  readonly hostLine: HTMLElement;
  readonly advice: HTMLElement;
  readonly notice: HTMLElement;
  readonly actions: HTMLElement;
  readonly live: HTMLElement;
}

/**
 * The warning for a stopped link and the steps of revealing a hidden destination, drawn
 * above the page where the page cannot reach it. Every text is set as text.
 */
export function createDialog(doc: Document, options: DialogOptions = {}): Dialog {
  const view = doc.defaultView;
  let parts: Parts | null = null;
  let current: DialogView | null = null;
  let controls: { readonly action: DialogAction; readonly button: HTMLButtonElement }[] = [];
  let focused = "";
  let report: ((id: string) => void) | null = null;
  let origin: HTMLElement | null = null;

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

  function focusOn(id: string): void {
    const control = controls.find((candidate) => candidate.action.id === id);
    if (!control) return;
    control.button.focus();
    focused = id;
  }

  function act(action: DialogAction): void {
    if (current === null) return;
    const done = report;
    if (!action.keep) finish();
    done?.(action.id);
  }

  function dismiss(): void {
    if (current === null) return;
    const done = report;
    const id = current.dismiss;
    finish();
    done?.(id);
  }

  function onKey(event: Event): void {
    if (current === null) return;
    event.stopImmediatePropagation();
    if (event.type !== "keydown") return;
    const { key, shiftKey } = event as KeyboardEvent;
    if (key === "Escape") {
      event.preventDefault();
      dismiss();
    } else if (key === "Tab" && controls.length > 0) {
      event.preventDefault();
      const at = controls.findIndex((control) => control.action.id === focused);
      const next = (at + (shiftKey ? -1 : 1) + controls.length) % controls.length;
      focusOn(controls[next]?.action.id ?? "");
    }
  }

  function button(action: DialogAction, className: string): HTMLButtonElement {
    const made = element("button", className, action.label);
    made.type = "button";
    made.dataset.action = action.id;
    made.addEventListener("click", () => act(action));
    made.addEventListener("focus", () => {
      focused = action.id;
    });
    return made;
  }

  function build(): Parts {
    const host = doc.createElement(DIALOG_TAG);
    host.setAttribute("style", HOST_STYLE);
    const root = host.attachShadow({ mode: "closed" });
    const style = doc.createElement("style");
    style.textContent = CSS;

    const dialog = doc.createElement("dialog") as Modal;
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "heading");
    dialog.setAttribute("aria-describedby", "reason");

    const heading = element("h2", "");
    heading.id = "heading";
    const reason = element("div", "");
    reason.id = "reason";
    const title = element("p", "title");
    const body = element("p", "explanation");
    reason.append(title, body);
    const lead = element("p", "leads", strings.warningLeadsTo);
    const hostLine = element("code", "host");
    const advice = element("p", "advice");
    const notice = element("p", "notice");
    const actions = element("div", "actions");
    const live = element("div", "live");
    live.setAttribute("aria-live", "polite");
    const box = element("div", "body");
    box.append(heading, reason, lead, hostLine, advice, notice, actions, live);
    dialog.append(box);

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      dismiss();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dismiss();
    });

    root.append(style, dialog);
    for (const type of POINTER_EVENTS) {
      host.addEventListener(type, (event) => event.stopPropagation());
    }
    options.expose?.(root);
    return { host, dialog, heading, title, body, lead, hostLine, advice, notice, actions, live };
  }

  function paint(next: DialogView, announce: boolean): void {
    if (!parts) return;
    const { dialog, heading, title, body, lead, hostLine, advice, notice, actions, live } = parts;
    dialog.dataset.tone = next.tone;
    if (next.busy) dialog.setAttribute("aria-busy", "true");
    else dialog.removeAttribute("aria-busy");
    heading.replaceChildren(icon(TONES[next.tone].icon), next.heading);
    title.textContent = next.title;
    body.textContent = next.body;
    lead.hidden = hostLine.hidden = next.host === undefined;
    hostLine.textContent = next.host ?? "";
    advice.hidden = !next.advice;
    advice.textContent = next.advice ?? "";

    controls = [];
    notice.hidden = next.notice === undefined;
    notice.replaceChildren();
    if (next.notice) {
      const link = button(next.notice.action, "link");
      notice.append(`${next.notice.text} `, link);
      controls.push({ action: next.notice.action, button: link });
    }
    const drawn = next.actions.map((action) => ({
      action,
      button: button(action, action.primary ? "primary" : "plain"),
    }));
    actions.replaceChildren(...drawn.map((control) => control.button));
    controls.push(...drawn);

    current = next;
    if (announce) live.textContent = `${next.heading}. ${next.title}`;
    const primary = next.actions.find((action) => action.primary) ?? next.actions.at(-1);
    focusOn(primary?.id ?? "");
  }

  function finish(): void {
    if (current === null) return;
    current = null;
    report = null;
    controls = [];
    focused = "";
    try {
      parts?.dialog.close?.();
    } catch {
      // Already closed by the browser.
    }
    parts?.host.remove();
    const back = origin;
    origin = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  }

  // Added when the page script starts, before any script of the page, so these run first.
  for (const type of KEY_EVENTS) view?.addEventListener(type, onKey, true);

  return {
    get view() {
      return current === null ? null : { ...current, focused };
    },
    open(next, onAction, returnTo = null) {
      if (current !== null) return false;
      parts ??= build();
      parts.live.textContent = "";
      doc.documentElement.append(parts.host);
      try {
        if (typeof parts.dialog.showModal !== "function") throw new Error("no modal dialogs");
        parts.dialog.showModal();
      } catch {
        parts.host.remove();
        return false;
      }
      report = onAction;
      origin = returnTo;
      paint(next, false);
      return true;
    },
    update(next) {
      if (current !== null) paint(next, true);
    },
    close: dismiss,
    remove() {
      report = null;
      finish();
      for (const type of KEY_EVENTS) view?.removeEventListener(type, onKey, true);
      parts?.host.remove();
    },
  };
}
