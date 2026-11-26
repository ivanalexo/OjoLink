import type { DialogAction, DialogView } from "./dialog.ts";
import type { FailureReason } from "./reveal.ts";
import { fill, strings } from "./strings.ts";
import type { HiddenLink, LinkVerdict, LinkWarning } from "./verdicts.ts";

export const ACTION = {
  back: "back",
  cancel: "cancel",
  open: "open",
  reveal: "reveal",
  policy: "policy",
} as const;

export const RETRYABLE: readonly FailureReason[] = ["offline", "limited", "error"];

const cancel = (primary = false): DialogAction => ({
  id: ACTION.cancel,
  label: strings.cancel,
  primary,
});
const openAnyway = (primary = false): DialogAction => ({
  id: ACTION.open,
  label: strings.openAnyway,
  primary,
});

function passesThrough({ kind, service }: HiddenLink): string {
  return fill(kind === "shortener" ? strings.hiddenShortener : strings.hiddenTracker, { service });
}

/** The warning for a link at the danger level. */
export function dangerStep(content: LinkWarning): DialogView {
  return {
    tone: "danger",
    heading: strings.warningHeading,
    title: content.title,
    body: content.explanation,
    host: content.host,
    advice: content.advice,
    actions: [openAnyway(), { id: ACTION.back, label: strings.back, primary: true }],
    dismiss: ACTION.back,
  };
}

/** What a link with a hidden destination offers before anything is sent. */
export function hiddenStep(hidden: HiddenLink, canReveal: boolean): DialogView {
  if (!canReveal) {
    return {
      tone: "hidden",
      heading: strings.hiddenHeading,
      title: passesThrough(hidden),
      body: `${strings.hiddenBody} ${strings.revealUnavailable}`,
      actions: [cancel(), openAnyway(true)],
      dismiss: ACTION.cancel,
    };
  }
  return {
    tone: "hidden",
    heading: strings.hiddenHeading,
    title: passesThrough(hidden),
    body: strings.hiddenBody,
    notice: {
      text: strings.revealNotice,
      action: { id: ACTION.policy, label: strings.privacyPolicy, keep: true },
    },
    actions: [
      cancel(),
      openAnyway(),
      { id: ACTION.reveal, label: strings.reveal, primary: true, keep: true },
    ],
    dismiss: ACTION.cancel,
  };
}

export function revealingStep(hidden: HiddenLink): DialogView {
  return {
    tone: "hidden",
    heading: strings.revealingHeading,
    title: fill(strings.revealingTitle, { service: hidden.service }),
    body: strings.revealingBody,
    busy: true,
    actions: [cancel(true)],
    dismiss: ACTION.cancel,
  };
}

/** What to show once the destination is known, according to the engine's verdict for it. */
export function revealedStep(verdict: LinkVerdict, content: LinkWarning | null): DialogView {
  if (verdict.level === "danger" && content) return dangerStep(content);
  const open: DialogAction = { id: ACTION.open, label: strings.open, primary: true };
  if (verdict.level === "caution" && content) {
    return {
      tone: "caution",
      heading: strings.revealedHeading,
      title: content.title,
      body: content.explanation,
      host: content.host,
      advice: content.advice,
      actions: [cancel(), open],
      dismiss: ACTION.cancel,
    };
  }
  return {
    tone: "clear",
    heading: strings.revealedHeading,
    title: verdict.label,
    body: strings.revealedClearBody,
    host: verdict.host,
    actions: [cancel(), open],
    dismiss: ACTION.cancel,
  };
}

/** The destination is another link that hides where it leads. */
export function stillHiddenStep(host: string): DialogView {
  return {
    tone: "hidden",
    heading: strings.stillHiddenHeading,
    title: strings.stillHiddenTitle,
    body: strings.stillHiddenBody,
    host,
    actions: [cancel(), openAnyway(true)],
    dismiss: ACTION.cancel,
  };
}

export function failedStep(reason: FailureReason): DialogView {
  const retry = RETRYABLE.includes(reason);
  return {
    tone: "caution",
    heading: strings.failedHeading,
    title: strings.failures[reason],
    body: strings.failedBody,
    actions: retry
      ? [
          cancel(),
          openAnyway(),
          { id: ACTION.reveal, label: strings.retry, primary: true, keep: true },
        ]
      : [openAnyway(), cancel(true)],
    dismiss: ACTION.cancel,
  };
}
