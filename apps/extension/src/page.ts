import { createIndicator, type Indicator } from "./indicator.ts";
import { createInterceptor } from "./interceptor.ts";
import { createMarks, type Marks } from "./marks.ts";
import { createScanner, type Scanner, type ScannerOptions } from "./scanner.ts";
import { fill, strings } from "./strings.ts";
import { createTooltip, type Tooltip } from "./tooltip.ts";
import {
  createVerdicts,
  readLink,
  type Analyze,
  type LinkInput,
  type LinkVerdict,
  type Verdicts,
} from "./verdicts.ts";
import {
  createWarningDialog,
  type WarningDialog,
  type WarningDialogOptions,
} from "./warning-dialog.ts";

/** How long the pointer rests on an unmarked link before its verdict is shown. */
export const HOVER_DELAY_MS = 350;
const LINKS = "a[href]";
const OPEN_FEATURES = "noopener,noreferrer";

export interface Page {
  readonly scanner: Scanner;
  readonly marks: Marks;
  readonly tooltip: Tooltip;
  readonly indicator: Indicator;
  readonly verdicts: Verdicts;
  readonly warning: WarningDialog;
  stop(): void;
}

export interface PageOptions extends ScannerOptions {
  readonly analyze?: Analyze;
  readonly warning?: WarningDialogOptions;
}

function linkOf(target: EventTarget | null): HTMLAnchorElement | null {
  const element = target as Element | null;
  return typeof element?.closest === "function" ? element.closest<HTMLAnchorElement>(LINKS) : null;
}

/**
 * Checks every link of a page, marks the suspicious ones, says what it found, and stops the
 * click on a dangerous one. Clicks are watched at once; the scan waits for the document.
 */
export function startPage(doc: Document, options: PageOptions = {}): Page {
  const tooltip = createTooltip(doc);
  const marks = createMarks(doc, tooltip);
  const indicator = createIndicator(doc);
  const verdicts = createVerdicts(options.analyze);
  const seen = new WeakMap<HTMLAnchorElement, string>();
  const checked = new Map<HTMLAnchorElement, LinkVerdict>();
  const warning = createWarningDialog(doc, options.warning);
  const view = doc.defaultView;

  const interceptor = view
    ? createInterceptor<LinkInput>(
        view,
        (anchor) => {
          const link = anchor.isConnected ? readLink(anchor) : null;
          return link && verdicts.of(link)?.level === "danger" ? link : null;
        },
        (anchor, link) => {
          const content = verdicts.describe(link);
          if (!content) return;
          tooltip.hide();
          warning.open(
            content,
            (choice) => {
              if (choice === "open") view.open(link.address, "_blank", OPEN_FEATURES);
            },
            anchor,
          );
        },
      )
    : null;

  const scanner = createScanner(
    doc,
    (anchor) => {
      const link = anchor.isConnected ? readLink(anchor) : null;
      const key = link ? `${link.address}\n${link.text}` : "";
      if (seen.get(anchor) === key && (link === null || checked.has(anchor))) return;
      seen.set(anchor, key);
      const verdict = link ? verdicts.of(link) : null;
      if (verdict) checked.set(anchor, verdict);
      else checked.delete(anchor);
      marks.apply(anchor, verdict);
    },
    () => {
      marks.sweep();
      for (const anchor of checked.keys()) if (!anchor.isConnected) checked.delete(anchor);
    },
    {
      ...options,
      onBatch(milliseconds, links) {
        options.onBatch?.(milliseconds, links);
        if (scanner.pending === 0) {
          indicator.update({ checked: checked.size, marked: marks.levels });
        }
      },
    },
  );

  // A marked link shows its reason at once, from marks.ts. Any other checked link shows
  // where it leads after a short rest, so every link answers when the person asks.
  let resting: ReturnType<typeof setTimeout> | undefined;
  let shownFor: HTMLAnchorElement | null = null;

  function describeUnmarked(anchor: HTMLAnchorElement): void {
    const verdict = checked.get(anchor);
    if (!verdict || marks.view(anchor) !== null || !anchor.isConnected) return;
    shownFor = anchor;
    tooltip.show(anchor, {
      level: verdict.level,
      label: verdict.label,
      reason: fill(strings.leadsTo, { host: verdict.host }),
    });
  }

  function leave(anchor: HTMLAnchorElement | null): void {
    clearTimeout(resting);
    if (anchor !== null && shownFor === anchor) {
      shownFor = null;
      tooltip.hide();
    }
  }

  const onOver = (event: Event): void => {
    const anchor = linkOf(event.target);
    if (!anchor || anchor === shownFor) return;
    clearTimeout(resting);
    resting = setTimeout(() => describeUnmarked(anchor), HOVER_DELAY_MS);
  };
  const onOut = (event: Event): void => {
    const anchor = linkOf(event.target);
    const next = (event as MouseEvent).relatedTarget as Node | null;
    if (anchor && (next === null || !anchor.contains(next))) leave(anchor);
  };
  const onFocus = (event: Event): void => {
    const anchor = linkOf(event.target);
    if (anchor) describeUnmarked(anchor);
  };
  const onBlur = (event: Event): void => leave(linkOf(event.target));

  doc.addEventListener("pointerover", onOver, true);
  doc.addEventListener("pointerout", onOut, true);
  doc.addEventListener("focusin", onFocus, true);
  doc.addEventListener("focusout", onBlur, true);

  const begin = (): void => scanner.start();
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", begin, { once: true });
  else begin();

  return {
    scanner,
    marks,
    tooltip,
    indicator,
    verdicts,
    warning,
    stop() {
      doc.removeEventListener("DOMContentLoaded", begin);
      interceptor?.stop();
      warning.remove();
      scanner.stop();
      marks.clear();
      clearTimeout(resting);
      doc.removeEventListener("pointerover", onOver, true);
      doc.removeEventListener("pointerout", onOut, true);
      doc.removeEventListener("focusin", onFocus, true);
      doc.removeEventListener("focusout", onBlur, true);
      tooltip.hide();
      indicator.remove();
    },
  };
}
