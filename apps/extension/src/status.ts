import type { PageCounts } from "./indicator.ts";
import { MARKED_LEVELS } from "./mark-style.ts";

export const STATUS_MESSAGE = "ojolink:status";

/** What the panel can say about the tab in front of the person. */
export type PanelStatus =
  | { readonly kind: "checked"; readonly counts: PageCounts }
  /** OjoLink works on this site, but this page was opened before its script was there. */
  | { readonly kind: "reload" }
  | { readonly kind: "not-here" };

/** The browser calls the status needs, so tests can stand in for them. */
export interface TabsApi {
  /** The active tab. Its address is present only where the extension already has access. */
  active(): Promise<
    { readonly id?: number | undefined; readonly url?: string | undefined } | undefined
  >;
  send(tabId: number, message: { readonly type: typeof STATUS_MESSAGE }): Promise<unknown>;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Reads counts that crossed a message channel, or null when they are not what was asked for. */
export function readCounts(value: unknown): PageCounts | null {
  if (typeof value !== "object" || value === null) return null;
  const { checked, marked } = value as Record<string, unknown>;
  if (!isCount(checked) || typeof marked !== "object" || marked === null) return null;
  const levels = marked as Record<string, unknown>;
  const [danger, caution, hidden] = MARKED_LEVELS.map((level) => levels[level]);
  if (!isCount(danger) || !isCount(caution) || !isCount(hidden)) return null;
  return { checked, marked: { danger, caution, "hidden-destination": hidden } };
}

/**
 * Answers the panel's question in a tab: the page script's own counts, for a message that
 * comes from this extension and nothing else.
 */
export function createStatusResponder(ownId: string, counts: () => PageCounts) {
  return (message: unknown, senderId: string | undefined): PageCounts | null => {
    if (typeof message !== "object" || message === null) return null;
    if ((message as { type?: unknown }).type !== STATUS_MESSAGE || senderId !== ownId) return null;
    return counts();
  };
}

/**
 * Asks the active tab's page script what it found. The tab's address is used only as
 * "present or not", to tell a page that needs a reload from a site where OjoLink does not work.
 */
export function createPageStatus(tabs: TabsApi): () => Promise<PanelStatus> {
  return async () => {
    let hasAccess = false;
    try {
      const tab = await tabs.active();
      if (tab?.id === undefined) return { kind: "not-here" };
      hasAccess = typeof tab.url === "string" && /^https?:/.test(tab.url);
      const counts = readCounts(await tabs.send(tab.id, { type: STATUS_MESSAGE }));
      if (counts) return { kind: "checked", counts };
    } catch {
      // No page script in that tab.
    }
    return { kind: hasAccess ? "reload" : "not-here" };
  };
}
