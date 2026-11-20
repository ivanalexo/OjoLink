import { analyze, describeResult, extractUrls, type VerdictDescription } from "@ojolink/core";
import { shortenLink } from "./shorten";
import { fill, strings } from "./strings";

export interface CheckedLink {
  readonly link: string;
  readonly display: string;
  readonly description: VerdictDescription;
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

/** Finds the links in a pasted text and describes the verdict of each, all on the device. */
export function checkText(text: string): CheckOutcome {
  const trimmed = text.trim();
  const links = extractUrls(trimmed);
  const candidates = links.length > 0 ? links : [trimmed];

  const items: CheckedLink[] = [];
  let message = "";
  for (const link of candidates) {
    const description = describeResult(analyze(link));
    if (description.analyzed) items.push({ link, display: shortenLink(link), description });
    else message = description.message;
  }

  return items.length > 0
    ? { kind: "results", items, announcement: announce(items) }
    : { kind: "message", message };
}
