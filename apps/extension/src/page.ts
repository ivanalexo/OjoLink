import { createDialog, type Dialog, type DialogOptions, type DialogView } from "./dialog.ts";
import { createDefaultEngine } from "@ojolink/core";
import { createIndicator, type Indicator, type PageCounts } from "./indicator.ts";
import { createInterceptor } from "./interceptor.ts";
import { createMarks, type Marks } from "./marks.ts";
import { failed, type FailureReason, type RevealLink } from "./reveal.ts";
import { createScanner, type Scanner, type ScannerOptions } from "./scanner.ts";
import {
  ACTION,
  dangerStep,
  failedStep,
  hiddenStep,
  revealedStep,
  revealingStep,
  stillHiddenStep,
} from "./steps.ts";
import { fill, strings } from "./strings.ts";
import { createTooltip, type Tooltip } from "./tooltip.ts";
import {
  createVerdicts,
  readLink,
  type Analyze,
  type HiddenLink,
  type LinkInput,
  type LinkVerdict,
  type Verdicts,
} from "./verdicts.ts";

/** How long the pointer rests on an unmarked link before its verdict is shown. */
export const HOVER_DELAY_MS = 350;
/** How long the pointer rests on a hidden destination before it is revealed, when that is on. */
export const HOVER_REVEAL_MS = 400;
export const HOVER_REVEALS_PER_MINUTE = 10;
const MINUTE_MS = 60_000;
const LINKS = "a[href]";
const OPEN_FEATURES = "noopener,noreferrer";

export interface Page {
  readonly scanner: Scanner;
  readonly marks: Marks;
  readonly tooltip: Tooltip;
  readonly indicator: Indicator;
  readonly verdicts: Verdicts;
  readonly dialog: Dialog;
  /** What the indicator shows, as numbers, for the panel on the extension's icon. */
  status(): PageCounts;
  stop(): void;
}

export interface PageOptions extends ScannerOptions {
  readonly analyze?: Analyze;
  readonly dialog?: DialogOptions;
  /** Asks the background where a short link leads. Without it, reveal is not available. */
  readonly reveal?: RevealLink;
  /** Where the privacy policy is, for the notice in the reveal dialog. */
  readonly privacyPolicy?: string | null;
  /** True while the person has turned on revealing by resting the pointer on a link. */
  readonly revealOnHover?: () => boolean;
  /**
   * Gives the person's protected domains, now and each time they change. Until the first
   * list arrives, links are judged with the embedded lists.
   */
  readonly userDomains?: (onChange: (domains: readonly string[]) => void) => void;
}

type Stop =
  | { readonly kind: "danger"; readonly link: LinkInput }
  | { readonly kind: "hidden"; readonly link: LinkInput; readonly hidden: HiddenLink };

type Revealed =
  | { readonly kind: "revealed"; readonly verdict: LinkVerdict; readonly destination: string }
  | { readonly kind: "still-hidden"; readonly host: string }
  | { readonly kind: "failed"; readonly reason: FailureReason };

function linkOf(target: EventTarget | null): HTMLAnchorElement | null {
  const element = target as Element | null;
  return typeof element?.closest === "function" ? element.closest<HTMLAnchorElement>(LINKS) : null;
}

/**
 * Checks every link of a page, marks the suspicious ones, says what it found, stops the click
 * on a dangerous one, and offers to reveal where a short link leads. Clicks are watched at
 * once; the scan waits for the document. Nothing is sent unless the person asks to reveal.
 */
export function startPage(doc: Document, options: PageOptions = {}): Page {
  const view = doc.defaultView;
  const tooltip = createTooltip(doc);
  const indicator = createIndicator(doc);
  let verdicts = createVerdicts(options.analyze);
  const dialog = createDialog(doc, options.dialog);
  let seen = new WeakMap<HTMLAnchorElement, string>();
  const checked = new Map<HTMLAnchorElement, LinkVerdict>();
  const destinations = new Map<string, string>();
  const canReveal = options.reveal !== undefined;
  const reveal: RevealLink = options.reveal ?? (() => Promise.resolve(failed("unavailable")));
  let flow = 0;

  /** The verdict to act on: the destination's once it was revealed, the link's own otherwise. */
  function effective(link: LinkInput): LinkVerdict | null {
    const own = verdicts.of(link);
    const destination = own?.hidden ? destinations.get(own.hidden.link) : undefined;
    if (destination === undefined) return own;
    const revealed = verdicts.of({ address: destination, text: link.text });
    if (!revealed) return own;
    return { ...revealed, reason: fill(strings.revealedReason, { reason: revealed.reason }) };
  }

  function describeEffective(link: LinkInput) {
    const own = verdicts.of(link);
    const destination = own?.hidden ? destinations.get(own.hidden.link) : undefined;
    return verdicts.describe(destination === undefined ? link : { ...link, address: destination });
  }

  function process(anchor: HTMLAnchorElement): void {
    const link = anchor.isConnected ? readLink(anchor) : null;
    const own = link ? verdicts.of(link) : null;
    const destination = own?.hidden ? (destinations.get(own.hidden.link) ?? "") : "";
    const key = link ? `${link.address}\n${link.text}\n${destination}` : "";
    if (seen.get(anchor) === key && (link === null || checked.has(anchor))) return;
    seen.set(anchor, key);
    const verdict = link ? effective(link) : null;
    if (verdict) checked.set(anchor, verdict);
    else checked.delete(anchor);
    marks.apply(anchor, verdict);
  }

  function status(): PageCounts {
    return { checked: checked.size, marked: marks.levels };
  }

  function count(): void {
    indicator.update(status());
  }

  /** Stores a revealed destination and repaints every link that leads through the same one. */
  function accept(link: LinkInput, hidden: HiddenLink, destination: string): Revealed {
    const verdict = verdicts.of({ address: destination, text: link.text });
    if (!verdict) return { kind: "failed", reason: "error" };
    if (verdict.level === "hidden-destination") return { kind: "still-hidden", host: verdict.host };
    destinations.set(hidden.link, destination);
    for (const anchor of [...checked.keys()]) process(anchor);
    if (scanner.pending === 0) count();
    return { kind: "revealed", verdict: effective(link) ?? verdict, destination };
  }

  async function ask(link: LinkInput, hidden: HiddenLink): Promise<Revealed> {
    const outcome = await reveal(hidden.link);
    return outcome.kind === "revealed" ? accept(link, hidden, outcome.destination) : outcome;
  }

  function stepFor(link: LinkInput, result: Revealed): DialogView {
    if (result.kind === "failed") return failedStep(result.reason);
    if (result.kind === "still-hidden") return stillHiddenStep(result.host);
    return revealedStep(result.verdict, describeEffective(link));
  }

  function show(anchor: HTMLAnchorElement | null, stop: Stop): void {
    if (!view) return;
    const { link } = stop;
    let first: DialogView;
    if (stop.kind === "danger") {
      const content = describeEffective(link);
      if (!content) return;
      first = dangerStep(content);
    } else {
      first = hiddenStep(stop.hidden, canReveal);
    }
    tooltip.hide();
    const mine = ++flow;
    dialog.open(
      first,
      (id) => {
        if (id === ACTION.open) view.open(link.address, "_blank", OPEN_FEATURES);
        if (id === ACTION.policy && options.privacyPolicy) {
          view.open(options.privacyPolicy, "_blank", OPEN_FEATURES);
        }
        if (id === ACTION.reveal && stop.kind === "hidden") {
          dialog.update(revealingStep(stop.hidden));
          void ask(link, stop.hidden).then((result) => {
            if (mine === flow && dialog.view !== null) dialog.update(stepFor(link, result));
          });
        }
        if (dialog.view === null) flow += 1;
      },
      anchor,
    );
  }

  function decide(anchor: HTMLAnchorElement): Stop | null {
    const link = anchor.isConnected ? readLink(anchor) : null;
    const verdict = link ? effective(link) : null;
    if (!link || !verdict) return null;
    if (verdict.level === "danger") return { kind: "danger", link };
    if (verdict.level === "hidden-destination" && verdict.hidden?.kind === "shortener") {
      return { kind: "hidden", link, hidden: verdict.hidden };
    }
    return null;
  }

  const marks = createMarks(doc, tooltip, (anchor) => {
    const link = anchor.isConnected ? readLink(anchor) : null;
    const verdict = link ? effective(link) : null;
    if (link && verdict?.hidden) show(anchor, { kind: "hidden", link, hidden: verdict.hidden });
  });

  const interceptor = view ? createInterceptor<Stop>(view, decide, show) : null;

  const scanner = createScanner(
    doc,
    process,
    () => {
      marks.sweep();
      for (const anchor of checked.keys()) if (!anchor.isConnected) checked.delete(anchor);
    },
    {
      ...options,
      onBatch(milliseconds, links) {
        options.onBatch?.(milliseconds, links);
        if (scanner.pending === 0) count();
      },
    },
  );

  // A marked link shows its reason at once, from marks.ts. Any other checked link shows
  // where it leads after a short rest, so every link answers when the person asks.
  let resting: ReturnType<typeof setTimeout> | undefined;
  let revealing: ReturnType<typeof setTimeout> | undefined;
  let shownFor: HTMLAnchorElement | null = null;
  let hovered: HTMLAnchorElement | null = null;
  const hoverReveals: number[] = [];

  function describeUnmarked(anchor: HTMLAnchorElement): void {
    const verdict = checked.get(anchor);
    if (!verdict || marks.view(anchor) !== null || !anchor.isConnected) return;
    const link = readLink(anchor);
    const own = link ? verdicts.of(link) : null;
    const wasRevealed = own?.hidden !== undefined && destinations.has(own.hidden.link);
    shownFor = anchor;
    tooltip.show(anchor, {
      level: verdict.level,
      label: verdict.label,
      reason: fill(wasRevealed ? strings.revealedLeadsTo : strings.leadsTo, {
        host: verdict.host,
      }),
    });
  }

  function say(anchor: HTMLAnchorElement, verdict: LinkVerdict, reason: string): void {
    if (hovered !== anchor || dialog.view !== null) return;
    tooltip.show(marks.view(anchor)?.host ?? anchor, {
      level: verdict.level,
      label: verdict.label,
      reason,
    });
  }

  function revealOnRest(anchor: HTMLAnchorElement): void {
    const link = anchor.isConnected ? readLink(anchor) : null;
    const verdict = link ? effective(link) : null;
    if (!link || !verdict?.hidden || hovered !== anchor) return;
    const { hidden } = verdict;
    const now = Date.now();
    while (hoverReveals.length > 0 && now - (hoverReveals[0] ?? 0) >= MINUTE_MS) {
      hoverReveals.shift();
    }
    if (hoverReveals.length >= HOVER_REVEALS_PER_MINUTE) {
      say(anchor, verdict, strings.hoverLimit);
      return;
    }
    hoverReveals.push(now);
    say(anchor, verdict, strings.hoverRevealing);
    void ask(link, hidden).then((result) => {
      if (result.kind !== "revealed") {
        const reason =
          result.kind === "still-hidden" ? strings.hoverStillHidden : strings.hoverFailed;
        say(anchor, verdict, reason);
      } else if (marks.view(anchor) !== null) {
        say(anchor, result.verdict, result.verdict.reason);
      } else if (hovered === anchor && dialog.view === null) {
        describeUnmarked(anchor);
      }
    });
  }

  function leave(anchor: HTMLAnchorElement | null): void {
    clearTimeout(resting);
    clearTimeout(revealing);
    if (anchor !== null && hovered === anchor) hovered = null;
    if (anchor !== null && shownFor === anchor) {
      shownFor = null;
      tooltip.hide();
    }
  }

  const onOver = (event: Event): void => {
    const anchor = linkOf(event.target);
    if (!anchor || anchor === hovered) return;
    hovered = anchor;
    clearTimeout(resting);
    clearTimeout(revealing);
    if (anchor !== shownFor) resting = setTimeout(() => describeUnmarked(anchor), HOVER_DELAY_MS);
    if (canReveal && options.revealOnHover?.() === true && checked.get(anchor)?.hidden) {
      revealing = setTimeout(() => revealOnRest(anchor), HOVER_REVEAL_MS);
    }
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

  let protectedDomains = "";
  let stopped = false;
  options.userDomains?.((domains) => {
    const key = domains.join("\n");
    if (stopped || key === protectedDomains) return;
    protectedDomains = key;
    verdicts = createVerdicts(
      options.analyze ?? createDefaultEngine({ userDomains: domains }).analyze,
    );
    seen = new WeakMap();
    scanner.rescan();
  });

  const begin = (): void => scanner.start();
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", begin, { once: true });
  else begin();

  return {
    scanner,
    marks,
    tooltip,
    indicator,
    get verdicts() {
      return verdicts;
    },
    dialog,
    status,
    stop() {
      stopped = true;
      flow += 1;
      doc.removeEventListener("DOMContentLoaded", begin);
      interceptor?.stop();
      dialog.remove();
      scanner.stop();
      marks.clear();
      clearTimeout(resting);
      clearTimeout(revealing);
      doc.removeEventListener("pointerover", onOver, true);
      doc.removeEventListener("pointerout", onOut, true);
      doc.removeEventListener("focusin", onFocus, true);
      doc.removeEventListener("focusout", onBlur, true);
      tooltip.hide();
      indicator.remove();
    },
  };
}
