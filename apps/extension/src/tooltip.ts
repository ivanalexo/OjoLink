import type { Level } from "@ojolink/core";
import { TOOLTIP_CSS, TOOLTIP_HOST_STYLE } from "./mark-style.ts";

export const TOOLTIP_TAG = "ojolink-tooltip";
const GAP = 6;

export interface TooltipContent {
  readonly level: Level;
  readonly label: string;
  readonly reason: string;
}

export interface Tooltip {
  show(target: Element, content: TooltipContent): void;
  hide(): void;
  readonly visible: boolean;
  /** What the tooltip is showing, for tests: the page cannot read it. */
  readonly content: TooltipContent | null;
}

type Popover = HTMLElement & { showPopover?: () => void; hidePopover?: () => void };

/** One tooltip for every mark, drawn above the page so a message cannot clip it. */
export function createTooltip(doc: Document): Tooltip {
  const view = doc.defaultView;
  let host: Popover | null = null;
  let box: HTMLElement | null = null;
  let label: HTMLElement | null = null;
  let reason: HTMLElement | null = null;
  let current: TooltipContent | null = null;

  function build(): void {
    host = doc.createElement(TOOLTIP_TAG);
    host.setAttribute("popover", "manual");
    host.setAttribute("style", TOOLTIP_HOST_STYLE);
    const root = host.attachShadow({ mode: "closed" });
    const style = doc.createElement("style");
    style.textContent = TOOLTIP_CSS;
    box = doc.createElement("div");
    box.className = "tip";
    box.setAttribute("role", "tooltip");
    label = doc.createElement("strong");
    reason = doc.createElement("span");
    box.append(label, " ", reason);
    root.append(style, box);
  }

  function place(target: Element): void {
    if (!host || !view) return;
    const anchor = target.getBoundingClientRect();
    const size = host.getBoundingClientRect();
    const below = anchor.bottom + GAP;
    const top = below + size.height > view.innerHeight ? anchor.top - size.height - GAP : below;
    const left = Math.min(anchor.left, view.innerWidth - size.width - GAP);
    host.style.setProperty("top", `${Math.max(GAP, top)}px`, "important");
    host.style.setProperty("left", `${Math.max(GAP, left)}px`, "important");
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    event.stopImmediatePropagation();
    event.preventDefault();
    hide();
  }

  function hide(): void {
    if (current === null || !host) return;
    current = null;
    try {
      host.hidePopover?.();
    } catch {
      // Already hidden by the browser.
    }
    host.style.setProperty("display", "none", "important");
    view?.removeEventListener("keydown", onKey, true);
    view?.removeEventListener("scroll", hide, true);
  }

  return {
    get visible() {
      return current !== null;
    },
    get content() {
      return current;
    },
    hide,
    show(target, content) {
      if (!host) build();
      if (!host || !box || !label || !reason) return;
      if (!host.isConnected) doc.documentElement.append(host);
      box.dataset.level = content.level;
      label.textContent = `${content.label}:`;
      reason.textContent = content.reason;
      host.style.setProperty("display", "block", "important");
      try {
        host.showPopover?.();
      } catch {
        // Already showing.
      }
      place(target);
      if (current === null) {
        view?.addEventListener("keydown", onKey, true);
        view?.addEventListener("scroll", hide, true);
      }
      current = content;
    },
  };
}
