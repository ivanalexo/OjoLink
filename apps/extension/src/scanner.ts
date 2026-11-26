import { INDICATOR_TAG } from "./indicator.ts";
import { MARK_TAG } from "./marks.ts";
import { TOOLTIP_TAG } from "./tooltip.ts";
import { DIALOG_TAG } from "./dialog.ts";

export const SLICE_MS = 3;
const LINKS = "a[href]";
const OWN_TAGS = new Set(
  [MARK_TAG, TOOLTIP_TAG, INDICATOR_TAG, DIALOG_TAG].map((tag) => tag.toUpperCase()),
);

export interface Deadline {
  timeRemaining(): number;
}

export interface ScannerOptions {
  /** How long one batch may run before it yields to the page. */
  readonly sliceMs?: number;
  readonly now?: () => number;
  /** Runs a batch when the page is idle. */
  readonly schedule?: (batch: (deadline?: Deadline) => void) => void;
  /** Called after each batch with how long it took and how many links it handled. */
  readonly onBatch?: (milliseconds: number, links: number) => void;
}

export interface Scanner {
  start(): void;
  /** Goes over every link of the page again, in the usual batches. */
  rescan(): void;
  stop(): void;
  readonly pending: number;
}

function defaultSchedule(view: Window | null): NonNullable<ScannerOptions["schedule"]> {
  const idle = view?.requestIdleCallback?.bind(view);
  return idle
    ? (batch) => void idle((deadline) => batch(deadline), { timeout: 500 })
    : (batch) => void setTimeout(batch, 16);
}

function isOwn(node: Node): boolean {
  return OWN_TAGS.has(node.nodeName);
}

/**
 * Finds the links of a page, now and as it changes, and hands them to `process` in batches
 * short enough that the page never waits. It looks for anchors only, never for a mail
 * client's own class names or structure.
 */
export function createScanner(
  doc: Document,
  process: (anchor: HTMLAnchorElement) => void,
  sweep: () => void,
  options: ScannerOptions = {},
): Scanner {
  const sliceMs = options.sliceMs ?? SLICE_MS;
  const now = options.now ?? (() => performance.now());
  const schedule = options.schedule ?? defaultSchedule(doc.defaultView);
  const queue = new Set<HTMLAnchorElement>();
  let scheduled = false;
  let needsSweep = false;
  let running = false;

  function request(): void {
    if (scheduled || !running) return;
    scheduled = true;
    schedule(batch);
  }

  function collect(root: ParentNode): void {
    for (const anchor of root.querySelectorAll<HTMLAnchorElement>(LINKS)) queue.add(anchor);
  }

  function batch(deadline?: Deadline): void {
    scheduled = false;
    if (!running) return;
    const started = now();
    let handled = 0;
    for (const anchor of queue) {
      queue.delete(anchor);
      process(anchor);
      handled += 1;
      if (now() - started >= sliceMs) break;
      if (deadline && deadline.timeRemaining() <= 0) break;
    }
    if (queue.size === 0 && needsSweep) {
      needsSweep = false;
      sweep();
    }
    options.onBatch?.(now() - started, handled);
    if (queue.size > 0 || needsSweep) request();
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes") {
        if (record.target.nodeName === "A") queue.add(record.target as HTMLAnchorElement);
        continue;
      }
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1 || isOwn(node)) continue;
        needsSweep = true;
        const element = node as Element;
        if (element.matches(LINKS)) queue.add(element as HTMLAnchorElement);
        collect(element);
      }
      for (const node of record.removedNodes) {
        if (node.nodeType === 1 && !isOwn(node)) needsSweep = true;
      }
    }
    if (queue.size > 0 || needsSweep) request();
  });

  return {
    get pending() {
      return queue.size;
    },
    start() {
      if (running) return;
      running = true;
      collect(doc);
      observer.observe(doc.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["href"],
      });
      request();
    },
    rescan() {
      if (!running) return;
      collect(doc);
      request();
    },
    stop() {
      running = false;
      observer.disconnect();
      queue.clear();
    },
  };
}
