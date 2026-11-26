// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDialog, DIALOG_TAG } from "../src/dialog.ts";
import { INDICATOR_TAG } from "../src/indicator.ts";
import { MARK_TAG } from "../src/marks.ts";
import { mountOptions, type OptionsApi } from "../src/options.ts";
import {
  HOVER_REVEAL_MS,
  HOVER_REVEALS_PER_MINUTE,
  startPage,
  type Page,
  type PageOptions,
} from "../src/page.ts";
import type { RevealOutcome } from "../src/reveal.ts";
import { createPageReveal, REVEAL_MESSAGE } from "../src/reveal-service.ts";
import type { Deadline } from "../src/scanner.ts";
import type { Settings } from "../src/settings.ts";
import { DEFAULT_PATTERNS } from "../src/sites.ts";
import { ACTION, failedStep, hiddenStep, revealingStep } from "../src/steps.ts";
import { strings } from "../src/strings.ts";
import { TOOLTIP_TAG } from "../src/tooltip.ts";
import { createVerdicts } from "../src/verdicts.ts";

const SHORT = "https://bit.ly/3xYz";
const OTHER_SHORT = "https://t.co/abc123";
const TRACKER = "https://example.us12.list-manage.com/track/click?u=1&id=2";
const DANGER = "https://bcp.com.bo.verifica.net/";
const DANGER_HOST = "bcp.com.bo.verifica.net";
const SAFE = "https://www.lostiempos.com/nota";
const CAUTION = "https://netflix-codes.com/";
const POLICY = "https://resolver.example/privacidad";
const FEATURES = "noopener,noreferrer";
const wrapped = (carried: string) =>
  `https://nam02.safelinks.protection.outlook.com/?url=${encodeURIComponent(carried)}&data=x`;
const HIDDEN = { kind: "shortener", service: "bit.ly", link: SHORT } as const;

function link(href: string, text = "Entrar"): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.setAttribute("href", href);
  anchor.textContent = text;
  const line = document.createElement("p");
  line.append(anchor);
  document.body.append(line);
  return anchor;
}

let reached = 0;
const guard = (event: Event): void => {
  reached += 1;
  event.preventDefault();
};

function activate(
  target: Element,
  type = "click",
  init: MouseEventInit = {},
): "stopped" | "passed" {
  reached = 0;
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, ...init }),
  );
  return reached === 0 ? "stopped" : "passed";
}

function press(key: string, target: Element = document.body, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function manual() {
  const pending: ((deadline?: Deadline) => void)[] = [];
  return {
    schedule: (batch: (deadline?: Deadline) => void) => void pending.push(batch),
    drain() {
      for (let count = 0; count < 10_000; count++) {
        const batch = pending.shift();
        if (!batch) return;
        batch();
      }
    },
  };
}

/** A reveal the test answers when it wants. */
function controlled() {
  const asked: string[] = [];
  const waiting: ((outcome: RevealOutcome) => void)[] = [];
  const reveal = vi.fn((shortLink: string) => {
    asked.push(shortLink);
    return new Promise<RevealOutcome>((resolve) => waiting.push(resolve));
  });
  const answer = async (outcome: RevealOutcome) => {
    waiting.shift()?.(outcome);
    await Promise.resolve();
    await Promise.resolve();
  };
  return {
    asked,
    reveal,
    answer,
    lead: (destination: string) => answer({ kind: "revealed", destination }),
  };
}

let page: Page | null = null;
let root: ShadowRoot | null = null;
let opened: ReturnType<typeof vi.spyOn>;
let scan = manual();

function start(options: PageOptions = {}) {
  scan = manual();
  const started = startPage(document, {
    schedule: scan.schedule,
    dialog: { expose: (shadow) => (root = shadow) },
    privacyPolicy: POLICY,
    ...options,
  });
  page = started;
  scan.drain();
  return started;
}

const inDialog = <T extends Element>(selector: string) => root?.querySelector<T>(selector) ?? null;
const choose = (id: string) => inDialog<HTMLButtonElement>(`button[data-action="${id}"]`)?.click();
const shown = () =>
  [...(root?.querySelectorAll<HTMLButtonElement>(".actions button") ?? [])].map(
    (button) => button.dataset.action,
  );
const markOf = (anchor: HTMLAnchorElement) => page?.marks.view(anchor) ?? null;

const proto = HTMLDialogElement.prototype as unknown as {
  showModal?: () => void;
  close?: () => void;
};

beforeEach(() => {
  document.body.innerHTML = "";
  root = null;
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  opened = vi.spyOn(window, "open").mockReturnValue(null);
  window.addEventListener("click", guard);
  window.addEventListener("auxclick", guard);
});

afterEach(() => {
  page?.stop();
  page = null;
  window.removeEventListener("click", guard);
  window.removeEventListener("auxclick", guard);
  for (const own of document.querySelectorAll(
    `${TOOLTIP_TAG}, ${INDICATOR_TAG}, ${DIALOG_TAG}, ${MARK_TAG}`,
  )) {
    own.remove();
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("a link whose destination is hidden", () => {
  const verdicts = createVerdicts();

  it("says which service hides it and which link to ask about", () => {
    expect(verdicts.of({ address: SHORT, text: "" })?.hidden).toEqual(HIDDEN);
    expect(verdicts.of({ address: TRACKER, text: "" })?.hidden).toMatchObject({
      kind: "tracker",
      service: "list-manage.com",
    });
  });

  it("asks about the short link, not the wrapper around it", () => {
    expect(verdicts.of({ address: wrapped(SHORT), text: "" })?.hidden).toEqual(HIDDEN);
  });

  it.each([DANGER, CAUTION, SAFE])("has nothing hidden for %s", (address) => {
    expect(verdicts.of({ address, text: "" })?.hidden).toBeUndefined();
  });
});

describe("dialog with steps", () => {
  let shadow: ShadowRoot | null = null;
  const make = () => createDialog(document, { expose: (made) => (shadow = made) });
  const find = <T extends Element>(selector: string) => shadow?.querySelector<T>(selector) ?? null;
  const buttons = () =>
    [...(shadow?.querySelectorAll<HTMLButtonElement>("button") ?? [])].map((b) => b.dataset.action);

  it("draws three actions with the main one last and focused, and the notice with its control", () => {
    const dialog = make();
    dialog.open(hiddenStep(HIDDEN, true), () => undefined);
    expect(buttons()).toEqual([ACTION.policy, ACTION.cancel, ACTION.open, ACTION.reveal]);
    expect(dialog.view?.focused).toBe(ACTION.reveal);
    expect(find(".notice")?.textContent).toContain(strings.revealNotice);
    expect(find(".notice button")?.textContent).toBe(strings.privacyPolicy);
    expect(find("dialog")?.getAttribute("data-tone")).toBe("hidden");
    expect(find<HTMLElement>(".host")?.hidden).toBe(true);
    expect(shadow?.querySelectorAll("a")).toHaveLength(0);
    dialog.remove();
  });

  it("moves Tab through every control, both ways", () => {
    const dialog = make();
    dialog.open(hiddenStep(HIDDEN, true), () => undefined);
    const order: (string | undefined)[] = [];
    for (const shiftKey of [false, false, false, false, true]) {
      expect(press("Tab", document.body, { shiftKey }).defaultPrevented).toBe(true);
      order.push(dialog.view?.focused);
    }
    expect(order).toEqual([ACTION.policy, ACTION.cancel, ACTION.open, ACTION.reveal, ACTION.open]);
    dialog.remove();
  });

  it("reports a kept action without closing, and Escape as the dismissal", () => {
    const dialog = make();
    const chosen: string[] = [];
    dialog.open(hiddenStep(HIDDEN, true), (id) => void chosen.push(id));
    find<HTMLButtonElement>(`button[data-action="${ACTION.reveal}"]`)?.click();
    find<HTMLButtonElement>(`button[data-action="${ACTION.policy}"]`)?.click();
    expect(chosen).toEqual([ACTION.reveal, ACTION.policy]);
    expect(dialog.view).not.toBeNull();
    press("Escape");
    expect(chosen).toEqual([ACTION.reveal, ACTION.policy, ACTION.cancel]);
    expect(dialog.view).toBeNull();
  });

  it("dismisses on the backdrop and on the browser's cancel with the step's own dismissal", () => {
    for (const act of [
      () => find("dialog")?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      () => find("dialog")?.dispatchEvent(new Event("cancel", { cancelable: true })),
    ]) {
      const dialog = make();
      const chosen: string[] = [];
      dialog.open(hiddenStep(HIDDEN, true), (id) => void chosen.push(id));
      act();
      expect(chosen).toEqual([ACTION.cancel]);
      dialog.remove();
    }
  });

  it("replaces its content on update, moves the focus, and announces the step", () => {
    const dialog = make();
    dialog.open(hiddenStep(HIDDEN, true), () => undefined);
    expect(find(".live")?.textContent).toBe("");
    dialog.update(revealingStep(HIDDEN));
    expect(buttons()).toEqual([ACTION.cancel]);
    expect(dialog.view?.focused).toBe(ACTION.cancel);
    expect(find("dialog")?.getAttribute("aria-busy")).toBe("true");
    expect(find(".live")?.getAttribute("aria-live")).toBe("polite");
    expect(find(".live")?.textContent).toContain(strings.revealingHeading);
    expect(find<HTMLElement>(".notice")?.hidden).toBe(true);

    dialog.update(failedStep("offline"));
    expect(find("dialog")?.hasAttribute("aria-busy")).toBe(false);
    expect(find("dialog")?.getAttribute("data-tone")).toBe("caution");
    expect(find(".live")?.textContent).toContain(strings.failedHeading);
    expect(find(".title")?.textContent).toBe(strings.failures.offline);
    expect(document.querySelectorAll(DIALOG_TAG)).toHaveLength(1);
    dialog.remove();
  });

  it("ignores an update while closed", () => {
    const dialog = make();
    dialog.update(revealingStep(HIDDEN));
    expect(dialog.view).toBeNull();
    expect(document.querySelector(DIALOG_TAG)).toBeNull();
    dialog.remove();
  });
});

describe("the mark of a hidden destination", () => {
  it("is a control with a tab stop and a name that says what it does", () => {
    const anchor = link(TRACKER);
    start();
    const mark = markOf(anchor);
    expect(mark?.control).toBe(true);
    expect(mark?.host.getAttribute("role")).toBe("button");
    expect(mark?.host.getAttribute("tabindex")).toBe("0");
    expect(mark?.host.getAttribute("aria-label")).toMatch(
      /^Destino oculto: .+ Pulsa para revelar a dónde lleva\.$/,
    );
  });

  it.each([
    ["a click", (mark: HTMLElement) => activate(mark)],
    ["Enter", (mark: HTMLElement) => press("Enter", mark)],
    ["Space", (mark: HTMLElement) => press(" ", mark)],
  ])(
    "opens the reveal dialog with %s, for a tracking link too, without opening the link",
    (_name, act) => {
      const anchor = link(TRACKER);
      const started = start({ reveal: controlled().reveal });
      act(markOf(anchor)?.host as HTMLElement);
      expect(started.dialog.view).toMatchObject({ tone: "hidden", heading: strings.hiddenHeading });
      expect(started.dialog.view?.title).toContain("seguimiento");
      expect(shown()).toEqual([ACTION.cancel, ACTION.open, ACTION.reveal]);
      expect(opened).not.toHaveBeenCalled();
    },
  );

  it("does nothing on other keys", () => {
    const anchor = link(TRACKER);
    const started = start({ reveal: controlled().reveal });
    press("a", markOf(anchor)?.host as HTMLElement);
    press("Tab", markOf(anchor)?.host as HTMLElement);
    expect(started.dialog.view).toBeNull();
  });

  it("leaves the marks of other levels as notes that open nothing", () => {
    const [dangerous, careful] = [link(DANGER), link(CAUTION)];
    const started = start({ reveal: controlled().reveal });
    for (const anchor of [dangerous, careful]) {
      const mark = markOf(anchor);
      expect(mark?.control).toBe(false);
      expect(mark?.host.getAttribute("role")).toBe("note");
      expect(mark?.host.hasAttribute("tabindex")).toBe(false);
      activate(mark?.host as HTMLElement);
      press("Enter", mark?.host as HTMLElement);
    }
    expect(started.dialog.view).toBeNull();
  });
});

describe("a click on a link through a shortener", () => {
  it.each([
    ["a plain click", "click", {}],
    ["the middle button", "auxclick", { button: 1 }],
    ["Ctrl", "click", { ctrlKey: true }],
    ["Cmd", "click", { metaKey: true }],
    ["Shift", "click", { shiftKey: true }],
    ["the keyboard", "click", { detail: 0 }],
  ])("is stopped with %s, and asks first", (_name, type, init) => {
    const anchor = link(SHORT);
    const { reveal } = controlled();
    const started = start({ reveal });
    expect(activate(anchor, type, init)).toBe("stopped");
    expect(started.dialog.view).toMatchObject({ tone: "hidden", focused: ACTION.reveal });
    expect(started.dialog.view?.title).toContain("bit.ly");
    expect(shown()).toEqual([ACTION.cancel, ACTION.open, ACTION.reveal]);
    expect(inDialog(".notice")?.textContent).toContain(strings.revealNotice);
    expect(reveal).not.toHaveBeenCalled();
    expect(opened).not.toHaveBeenCalled();
  });

  it("is stopped when a script clicks it, and inside a wrapper", () => {
    const [plain, inside] = [link(SHORT), link(wrapped(OTHER_SHORT))];
    const started = start({ reveal: controlled().reveal });
    reached = 0;
    plain.click();
    expect(reached).toBe(0);
    started.dialog.close();
    expect(activate(inside)).toBe("stopped");
    expect(started.dialog.view?.title).toContain("t.co");
  });

  it("is stopped before the scan reached it", () => {
    const anchor = link(SHORT);
    scan = manual();
    page = startPage(document, { schedule: scan.schedule, reveal: controlled().reveal });
    expect(markOf(anchor)).toBeNull();
    expect(activate(anchor)).toBe("stopped");
  });

  it.each([
    ["a tracking link", TRACKER],
    ["a tracking link inside a wrapper", wrapped(TRACKER)],
    ["a caution link", CAUTION],
    ["an ordinary link", SAFE],
  ])("lets %s open as usual", (_name, href) => {
    const anchor = link(href);
    const started = start({ reveal: controlled().reveal });
    expect(activate(anchor)).toBe("passed");
    expect(activate(anchor, "auxclick", { button: 1 })).toBe("passed");
    expect(started.dialog.view).toBeNull();
  });

  it("with no resolver in this build, still asks, and says reveal is not available", () => {
    const anchor = link(SHORT);
    const started = start();
    expect(activate(anchor)).toBe("stopped");
    expect(shown()).toEqual([ACTION.cancel, ACTION.open]);
    expect(started.dialog.view?.body).toContain(strings.revealUnavailable);
    expect(inDialog<HTMLElement>(".notice")?.hidden).toBe(true);
  });
});

describe("the reveal flow", () => {
  it("cancels with the button and with Escape: nothing opens, nothing is sent, focus returns", () => {
    const anchor = link(SHORT);
    const focus = vi.spyOn(anchor, "focus");
    const { reveal } = controlled();
    const started = start({ reveal });
    activate(anchor);
    choose(ACTION.cancel);
    expect(started.dialog.view).toBeNull();
    activate(anchor);
    press("Escape");
    expect(started.dialog.view).toBeNull();
    expect(focus).toHaveBeenCalledTimes(2);
    expect(reveal).not.toHaveBeenCalled();
    expect(opened).not.toHaveBeenCalled();
  });

  it("opens without revealing: the link as written, isolated, and nothing sent", () => {
    const anchor = link(wrapped(SHORT));
    const { reveal } = controlled();
    start({ reveal });
    activate(anchor);
    choose(ACTION.open);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledWith(wrapped(SHORT), "_blank", FEATURES);
    expect(reveal).not.toHaveBeenCalled();
  });

  it("opens the privacy policy from the notice and stays open", () => {
    const anchor = link(SHORT);
    const started = start({ reveal: controlled().reveal });
    activate(anchor);
    choose(ACTION.policy);
    expect(opened).toHaveBeenCalledWith(POLICY, "_blank", FEATURES);
    expect(started.dialog.view?.heading).toBe(strings.hiddenHeading);
  });

  it("reveals a dangerous destination: waiting, then the danger warning with Volver focused", async () => {
    const anchor = link(SHORT);
    const { asked, lead } = controlled();
    const started = start({ reveal: controlled().reveal });
    started.stop();
    const flow = controlled();
    const again = start({ reveal: flow.reveal });
    activate(anchor);
    choose(ACTION.reveal);
    expect(flow.asked).toEqual([SHORT]);
    expect(again.dialog.view).toMatchObject({ busy: true, heading: strings.revealingHeading });
    expect(shown()).toEqual([ACTION.cancel]);
    expect(again.dialog.view?.title).not.toMatch(/sin señales/i);

    await flow.lead(DANGER);
    expect(again.dialog.view).toMatchObject({
      tone: "danger",
      heading: strings.warningHeading,
      host: DANGER_HOST,
      focused: ACTION.back,
    });
    expect(shown()).toEqual([ACTION.open, ACTION.back]);
    expect(inDialog(".live")?.textContent).toContain(strings.warningHeading);
    choose(ACTION.back);
    expect(opened).not.toHaveBeenCalled();
    expect(asked).toEqual([]);
    void lead;
  });

  it("reveals an ordinary destination: says so without calling it safe, and offers to open", async () => {
    const anchor = link(SHORT);
    const flow = controlled();
    const started = start({ reveal: flow.reveal });
    activate(anchor);
    choose(ACTION.reveal);
    await flow.lead(SAFE);
    expect(started.dialog.view).toMatchObject({
      tone: "clear",
      heading: strings.revealedHeading,
      title: "Sin señales de alerta",
      host: "www.lostiempos.com",
      focused: ACTION.open,
    });
    expect(shown()).toEqual([ACTION.cancel, ACTION.open]);
    choose(ACTION.open);
    expect(opened).toHaveBeenCalledWith(SHORT, "_blank", FEATURES);
  });

  it("reveals a destination at caution with its reason", async () => {
    const anchor = link(SHORT);
    const flow = controlled();
    const started = start({ reveal: flow.reveal });
    activate(anchor);
    choose(ACTION.reveal);
    await flow.lead(CAUTION);
    expect(started.dialog.view).toMatchObject({ tone: "caution", host: "netflix-codes.com" });
    expect(shown()).toEqual([ACTION.cancel, ACTION.open]);
  });

  it("never opens the revealed destination itself", async () => {
    const anchor = link(SHORT);
    const flow = controlled();
    start({ reveal: flow.reveal });
    activate(anchor);
    choose(ACTION.reveal);
    await flow.lead(DANGER);
    choose(ACTION.open);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledWith(SHORT, "_blank", FEATURES);
  });

  it("opens the link judged when the dialog opened, not one swapped in meanwhile", async () => {
    const anchor = link(SHORT);
    const flow = controlled();
    start({ reveal: flow.reveal });
    activate(anchor);
    anchor.setAttribute("href", DANGER);
    choose(ACTION.open);
    expect(opened).toHaveBeenCalledWith(SHORT, "_blank", FEATURES);
  });

  it("says the destination is still hidden when it is another short link", async () => {
    const anchor = link(SHORT);
    const flow = controlled();
    const started = start({ reveal: flow.reveal });
    activate(anchor);
    choose(ACTION.reveal);
    await flow.lead(OTHER_SHORT);
    expect(started.dialog.view).toMatchObject({
      tone: "hidden",
      heading: strings.stillHiddenHeading,
      host: "t.co",
    });
    expect(shown()).toEqual([ACTION.cancel, ACTION.open]);
    expect(markOf(anchor)?.level).toBe("hidden-destination");
  });

  it.each([
    ["unresolved", false],
    ["offline", true],
    ["limited", true],
    ["error", true],
    ["unavailable", false],
  ] as const)("when the reveal fails (%s), shows caution and never safe", async (reason, retry) => {
    const anchor = link(SHORT);
    const flow = controlled();
    const started = start({ reveal: flow.reveal });
    activate(anchor);
    choose(ACTION.reveal);
    await flow.answer({ kind: "failed", reason });
    expect(started.dialog.view).toMatchObject({
      tone: "caution",
      heading: strings.failedHeading,
      title: strings.failures[reason],
    });
    expect(shown().includes(ACTION.reveal)).toBe(retry);
    expect(JSON.stringify(started.dialog.view)).not.toMatch(/sin señales/i);
    expect(markOf(anchor)?.level).toBe("hidden-destination");
  });

  it("tries again with a new request", async () => {
    const anchor = link(SHORT);
    const flow = controlled();
    const started = start({ reveal: flow.reveal });
    activate(anchor);
    choose(ACTION.reveal);
    await flow.answer({ kind: "failed", reason: "limited" });
    choose(ACTION.reveal);
    expect(started.dialog.view?.busy).toBe(true);
    await flow.lead(SAFE);
    expect(flow.asked).toEqual([SHORT, SHORT]);
    expect(started.dialog.view?.tone).toBe("clear");
  });

  it("can be cancelled while waiting, and a late answer opens nothing but still counts", async () => {
    const anchor = link(SHORT);
    const flow = controlled();
    const started = start({ reveal: flow.reveal });
    activate(anchor);
    choose(ACTION.reveal);
    choose(ACTION.cancel);
    expect(started.dialog.view).toBeNull();
    await flow.lead(DANGER);
    expect(started.dialog.view).toBeNull();
    expect(opened).not.toHaveBeenCalled();
    expect(markOf(anchor)?.level).toBe("danger");
  });

  it("does not let a late answer change a dialog opened for another link", async () => {
    const [first, second] = [link(SHORT), link(OTHER_SHORT)];
    const flow = controlled();
    const started = start({ reveal: flow.reveal });
    activate(first);
    choose(ACTION.reveal);
    choose(ACTION.cancel);
    activate(second);
    await flow.lead(DANGER);
    expect(started.dialog.view).toMatchObject({ tone: "hidden", heading: strings.hiddenHeading });
    expect(started.dialog.view?.title).toContain("t.co");
  });

  it("treats a destination the engine cannot analyze as not revealed", async () => {
    const anchor = link(SHORT);
    const flow = controlled();
    const started = start({ reveal: flow.reveal });
    activate(anchor);
    choose(ACTION.reveal);
    await flow.answer({ kind: "revealed", destination: "https:///" } as RevealOutcome);
    expect(started.dialog.view?.heading).toBe(strings.failedHeading);
    expect(markOf(anchor)?.level).toBe("hidden-destination");
  });
});

describe("after a reveal, the page follows", () => {
  async function revealTo(
    anchor: HTMLAnchorElement,
    destination: string,
    started: Page,
    flow: ReturnType<typeof controlled>,
  ) {
    activate(anchor);
    choose(ACTION.reveal);
    await flow.lead(destination);
    started.dialog.close();
  }

  it("marks a dangerous destination as danger and stops the next click with its warning", async () => {
    const anchor = link(SHORT);
    const flow = controlled();
    const started = start({ reveal: flow.reveal });
    await revealTo(anchor, DANGER, started, flow);
    const mark = markOf(anchor);
    expect(mark).toMatchObject({ level: "danger", label: "Peligro", control: false });
    expect(mark?.reason).toMatch(/^Destino revelado\. /);
    expect(mark?.host.getAttribute("role")).toBe("note");
    expect(mark?.host.hasAttribute("tabindex")).toBe(false);

    expect(activate(anchor)).toBe("stopped");
    expect(started.dialog.view).toMatchObject({ tone: "danger", host: DANGER_HOST });
    expect(flow.asked).toEqual([SHORT]);
  });

  it("removes the mark of an ordinary destination, lets the next click through, and says it was revealed", async () => {
    vi.useFakeTimers();
    const anchor = link(SHORT);
    const flow = controlled();
    const started = start({ reveal: flow.reveal });
    await revealTo(anchor, SAFE, started, flow);
    expect(markOf(anchor)).toBeNull();
    expect(activate(anchor)).toBe("passed");
    expect(started.dialog.view).toBeNull();

    anchor.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    vi.advanceTimersByTime(400);
    expect(started.tooltip.content).toEqual({
      level: "safe",
      label: "Sin señales de alerta",
      reason: "Destino revelado: lleva a www.lostiempos.com.",
    });
  });

  it("changes every link through the same short link with one request, and the indicator follows", async () => {
    const [first, second, other] = [link(SHORT), link(SHORT, "otro texto"), link(OTHER_SHORT)];
    const flow = controlled();
    const started = start({ reveal: flow.reveal });
    expect(started.indicator.view?.text).toBe("OjoLink · 3 enlaces revisados, 3 con avisos");
    expect(started.indicator.view?.tone).toBe("hidden-destination");
    await revealTo(first, DANGER, started, flow);
    expect(markOf(first)?.level).toBe("danger");
    expect(markOf(second)?.level).toBe("danger");
    expect(markOf(other)?.level).toBe("hidden-destination");
    expect(flow.asked).toEqual([SHORT]);
    expect(started.indicator.view?.tone).toBe("danger");
  });

  it("drops the count of marked links when a destination has no warning signs", async () => {
    const anchor = link(SHORT);
    link(SAFE);
    const flow = controlled();
    const started = start({ reveal: flow.reveal });
    expect(started.indicator.view?.text).toBe("OjoLink · 2 enlaces revisados, 1 con aviso");
    await revealTo(anchor, SAFE, started, flow);
    expect(started.indicator.view?.text).toBe(
      "OjoLink · 2 enlaces revisados, sin señales de alerta",
    );
  });

  it("marks a link added later with what is already known for its short link", async () => {
    const anchor = link(SHORT);
    const flow = controlled();
    const started = start({ reveal: flow.reveal });
    await revealTo(anchor, DANGER, started, flow);
    const later = link(SHORT, "el mismo, más abajo");
    await Promise.resolve();
    scan.drain();
    expect(markOf(later)?.level).toBe("danger");
    expect(flow.asked).toEqual([SHORT]);
  });

  it("judges the destination with the link's own text: a short link that shows a protected domain", async () => {
    const anchor = link(SHORT, "https://Outlook.com/verificar-identidad");
    const flow = controlled();
    const started = start({ reveal: flow.reveal });
    expect(markOf(anchor)?.level).toBe("hidden-destination");
    activate(anchor);
    choose(ACTION.reveal);
    await flow.lead("https://centro-de-ayuda.org/cuenta");
    expect(started.dialog.view).toMatchObject({
      tone: "danger",
      title: "Este enlace no va a donde dice",
    });
    expect(markOf(anchor)?.level).toBe("danger");
  });

  it("forgets everything with stop()", async () => {
    const anchor = link(SHORT);
    const flow = controlled();
    const started = start({ reveal: flow.reveal });
    await revealTo(anchor, DANGER, started, flow);
    started.stop();
    expect(document.querySelector(`${MARK_TAG}, ${DIALOG_TAG}`)).toBeNull();
    expect(activate(anchor)).toBe("passed");
  });
});

describe("nothing is sent without an action", () => {
  it("reads, hovers, clicks, cancels and opens a page full of short and tracking links", () => {
    vi.useFakeTimers();
    const anchors = [SHORT, OTHER_SHORT, TRACKER, wrapped(SHORT), SAFE, DANGER, CAUTION].map(
      (href, index) => link(href, `enlace ${index}`),
    );
    const { reveal } = controlled();
    const started = start({ reveal });
    for (const anchor of anchors) {
      anchor.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
      vi.advanceTimersByTime(2000);
      anchor.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      anchor.dispatchEvent(new MouseEvent("pointerout", { bubbles: true }));
      activate(anchor);
      if (started.dialog.view) choose(ACTION.cancel);
      activate(anchor, "auxclick", { button: 1 });
      if (started.dialog.view) choose(shown().includes(ACTION.open) ? ACTION.open : ACTION.back);
    }
    activate(markOf(anchors[2] as HTMLAnchorElement)?.host as HTMLElement);
    press("Escape");
    expect(reveal).not.toHaveBeenCalled();
  });

  it("cannot reach the reveal for a link that is not at hidden destination", () => {
    const anchors = [link(DANGER), link(CAUTION), link(SAFE)];
    const { reveal } = controlled();
    const started = start({ reveal });
    for (const anchor of anchors) {
      activate(anchor);
      expect(shown()).not.toContain(ACTION.reveal);
      started.dialog.close();
      const mark = markOf(anchor)?.host;
      if (mark) {
        activate(mark);
        press("Enter", mark);
      }
      expect(shown()).not.toContain(ACTION.reveal);
    }
    expect(reveal).not.toHaveBeenCalled();
  });

  it("asks the background with a message, and ignores what the page posts to the window", async () => {
    const send = vi.fn(async () => ({ kind: "revealed", destination: DANGER }));
    const anchor = link(SHORT);
    const started = start({ reveal: createPageReveal(send) });
    activate(anchor);
    window.postMessage({ type: REVEAL_MESSAGE, kind: "revealed", destination: SAFE }, "*");
    window.dispatchEvent(
      new MessageEvent("message", { data: { kind: "revealed", destination: SAFE } }),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(started.dialog.view?.heading).toBe(strings.hiddenHeading);
    expect(markOf(anchor)?.level).toBe("hidden-destination");

    choose(ACTION.reveal);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ type: REVEAL_MESSAGE, link: SHORT });
    expect(started.dialog.view).toMatchObject({ tone: "danger", host: DANGER_HOST });
  });

  it("shows not revealed when the background does not answer", async () => {
    const anchor = link(SHORT);
    const started = start({
      reveal: createPageReveal(() => Promise.reject(new Error("no background"))),
    });
    activate(anchor);
    choose(ACTION.reveal);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(started.dialog.view?.heading).toBe(strings.failedHeading);
  });
});

describe("reveal on hover", () => {
  const rest = (anchor: Element, ms = HOVER_REVEAL_MS) => {
    anchor.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    anchor.dispatchEvent(new MouseEvent("pointerenter"));
    vi.advanceTimersByTime(ms);
  };
  const away = (anchor: Element) => {
    anchor.dispatchEvent(new MouseEvent("pointerout", { bubbles: true }));
    anchor.dispatchEvent(new MouseEvent("pointerleave"));
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("sends nothing when the setting is off, which is the default", () => {
    const anchor = link(SHORT);
    const { reveal } = controlled();
    const started = start({ reveal });
    rest(anchor, 5000);
    expect(reveal).not.toHaveBeenCalled();
    expect(started.tooltip.content?.label).toBe("Destino oculto");

    const off = controlled();
    started.stop();
    const again = start({ reveal: off.reveal, revealOnHover: () => false });
    rest(anchor, 5000);
    expect(off.reveal).not.toHaveBeenCalled();
    void again;
  });

  it("with the setting on, asks once after 400 ms and shows the verdict and host", async () => {
    const anchor = link(SHORT);
    const flow = controlled();
    const started = start({ reveal: flow.reveal, revealOnHover: () => true });
    rest(anchor, HOVER_REVEAL_MS - 1);
    expect(flow.reveal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(flow.asked).toEqual([SHORT]);
    expect(started.tooltip.content).toMatchObject({
      label: "Destino oculto",
      reason: strings.hoverRevealing,
    });
    await flow.lead(SAFE);
    expect(started.tooltip.content).toEqual({
      level: "safe",
      label: "Sin señales de alerta",
      reason: "Destino revelado: lleva a www.lostiempos.com.",
    });
    expect(markOf(anchor)).toBeNull();
  });

  it("shows a dangerous destination in the note and on the mark", async () => {
    const anchor = link(TRACKER);
    const flow = controlled();
    const started = start({ reveal: flow.reveal, revealOnHover: () => true });
    rest(anchor);
    await flow.lead(DANGER);
    expect(started.tooltip.content?.level).toBe("danger");
    expect(started.tooltip.content?.reason).toMatch(/^Destino revelado\. /);
    expect(markOf(anchor)?.level).toBe("danger");
  });

  it("asks nothing for a pointer that only passes by", () => {
    const anchors = [link(SHORT), link(OTHER_SHORT), link(TRACKER)];
    const { reveal } = controlled();
    start({ reveal, revealOnHover: () => true });
    for (const anchor of anchors) {
      rest(anchor, 200);
      away(anchor);
    }
    vi.advanceTimersByTime(5000);
    expect(reveal).not.toHaveBeenCalled();
  });

  it("asks nothing for links that hide nothing", () => {
    const anchors = [link(SAFE), link(DANGER), link(CAUTION)];
    const { reveal } = controlled();
    start({ reveal, revealOnHover: () => true });
    for (const anchor of anchors) {
      rest(anchor, 2000);
      away(anchor);
    }
    expect(reveal).not.toHaveBeenCalled();
  });

  it("follows the setting when it changes, without a reload", () => {
    const anchor = link(SHORT);
    const { reveal } = controlled();
    let on = false;
    start({ reveal, revealOnHover: () => on });
    rest(anchor, 2000);
    away(anchor);
    expect(reveal).not.toHaveBeenCalled();
    on = true;
    rest(anchor);
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it("says so when the reveal fails", async () => {
    const anchor = link(SHORT);
    const flow = controlled();
    const started = start({ reveal: flow.reveal, revealOnHover: () => true });
    rest(anchor);
    await flow.answer({ kind: "failed", reason: "offline" });
    expect(started.tooltip.content?.reason).toBe(strings.hoverFailed);
    expect(markOf(anchor)?.level).toBe("hidden-destination");
  });

  it("stops at 10 reveals a minute and points to the mark", async () => {
    const anchors = Array.from({ length: HOVER_REVEALS_PER_MINUTE + 2 }, (_, index) =>
      link(`https://bit.ly/caso${index}`),
    );
    const flow = controlled();
    const started = start({ reveal: flow.reveal, revealOnHover: () => true });
    const reasons: (string | undefined)[] = [];
    for (const anchor of anchors) {
      rest(anchor);
      reasons.push(started.tooltip.content?.reason);
      away(anchor);
    }
    expect(flow.reveal).toHaveBeenCalledTimes(HOVER_REVEALS_PER_MINUTE);
    expect(reasons.slice(-2)).toEqual([strings.hoverLimit, strings.hoverLimit]);

    vi.advanceTimersByTime(60_000);
    rest(anchors.at(-1) as Element);
    expect(flow.reveal).toHaveBeenCalledTimes(HOVER_REVEALS_PER_MINUTE + 1);
  });
});

describe("options: what leaves the device", () => {
  function api(hover = false, fail = false) {
    const state = { hover, saved: [] as boolean[] };
    const fake: OptionsApi = {
      grantedOrigins: async () => [...DEFAULT_PATTERNS],
      request: async () => true,
      remove: async () => true,
      revealOnHover: async () => state.hover,
      setRevealOnHover: async (on) => {
        if (fail) throw new Error("no storage");
        state.hover = on;
        state.saved.push(on);
      },
    };
    return { state, fake };
  }
  const WITH = { resolver: "https://resolver.example", privacyPolicy: POLICY, donate: null };
  const WITHOUT = { resolver: null, privacyPolicy: null, donate: null };
  const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
  const box = () => document.querySelector<HTMLInputElement>("#hover");

  async function mount(fake: OptionsApi, settings: Settings = WITH) {
    document.body.innerHTML = '<main id="app"></main>';
    await mountOptions(document.getElementById("app") as HTMLElement, fake, settings).refresh();
  }

  it("says when a link is sent, to whom, and links to the privacy policy", async () => {
    await mount(api().fake);
    const text = document.querySelector(".privacy");
    expect(text?.textContent).toContain(strings.privacyReveal);
    expect(text?.textContent).toMatch(/Solo cuando pulsas «Revelar destino»/);
    const policy = text?.querySelector("a");
    expect(policy?.getAttribute("href")).toBe(POLICY);
    expect(policy?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(policy?.getAttribute("target")).toBe("_blank");
  });

  it("offers reveal on hover off by default, with a sentence that says what it sends", async () => {
    await mount(api().fake);
    expect(box()?.checked).toBe(false);
    expect(box()?.labels?.[0]?.textContent).toBe(strings.hoverLabel);
    const hint = document.getElementById(box()?.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toMatch(/Apagado por defecto/);
    expect(hint?.textContent).toMatch(/cada enlace corto sobre el que dejes el mouse se envía/);
  });

  it("saves the setting when toggled, and shows it on when it was on", async () => {
    const { state, fake } = api();
    await mount(fake);
    const input = box() as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event("change"));
    await settled();
    expect(state.saved).toEqual([true]);
    expect(document.querySelector('[role="status"]')?.textContent).toBe(strings.hoverSaved);
    await mount(fake);
    expect(box()?.checked).toBe(true);
  });

  it("puts the box back when saving fails", async () => {
    await mount(api(false, true).fake);
    const input = box() as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event("change"));
    await settled();
    expect(input.checked).toBe(false);
    expect(document.querySelector('[role="status"]')?.textContent).toBe(strings.failed);
  });

  it("in a package with no resolver, says nothing is sent and offers no setting", async () => {
    await mount(api().fake, WITHOUT);
    expect(document.querySelector(".privacy")?.textContent).toBe(strings.privacyNoResolver);
    expect(box()).toBeNull();
    expect(document.querySelector(".privacy a")).toBeNull();
  });
});
