import { analyze, describeResult, extractUrls, type VerdictDescription } from "@ojolink/core";
import { shortenLink } from "./shorten";
import { fill, strings } from "./strings";

export interface CheckedLink {
  readonly link: string;
  readonly display: string;
  readonly description: VerdictDescription;
  /** The short link whose destination is hidden, as the engine read it. Null for other links. */
  readonly shortLink: string | null;
}

export type CheckOutcome =
  | {
      readonly kind: "results";
      readonly items: readonly CheckedLink[];
      readonly announcement: string;
    }
  | { readonly kind: "message"; readonly message: string };

function announce(items: readonly CheckedLink[]): string {
  const levels = items.map((item) => item.description.levelLabel).join(", ");
  return items.length === 1
    ? fill(strings.oneLink, { levels })
    : fill(strings.manyLinks, { count: items.length, levels });
}

function hiddenShortLink(result: ReturnType<typeof analyze>): string | null {
  if (!result.analyzed || result.level !== "hidden-destination") return null;
  const signal = result.signals.find((item) => item.id === "hidden-destination");
  const link = (signal?.details as { link?: unknown } | undefined)?.link;
  return typeof link === "string" ? link : null;
}

/** Finds the links in a pasted text and describes the verdict of each, all on the device. */
export function checkText(text: string): CheckOutcome {
  const trimmed = text.trim();
  const links = [...new Set(extractUrls(trimmed))];
  const candidates = links.length > 0 ? links : [trimmed];

  const items: CheckedLink[] = [];
  let message = "";
  for (const link of candidates) {
    const result = analyze(link);
    const description = describeResult(result);
    if (description.analyzed) {
      items.push({
        link,
        display: shortenLink(link),
        description,
        shortLink: hiddenShortLink(result),
      });
    } else message = description.message;
  }

  return items.length > 0
    ? { kind: "results", items, announcement: announce(items) }
    : { kind: "message", message };
}
