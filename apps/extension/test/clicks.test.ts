// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INDICATOR_TAG } from "../src/indicator.ts";
import { createInterceptor } from "../src/interceptor.ts";
import { MARK_TAG } from "../src/marks.ts";
import { startPage, type Page } from "../src/page.ts";
import type { Deadline } from "../src/scanner.ts";
import { strings } from "../src/strings.ts";
import { TOOLTIP_TAG } from "../src/tooltip.ts";
import { createVerdicts, readLink, type LinkWarning } from "../src/verdicts.ts";
import { createDialog, DIALOG_COLORS, DIALOG_TAG } from "../src/dialog.ts";
import { dangerStep } from "../src/steps.ts";

const DANGER = "https://bcp.com.bo.verifica.net/";
const DANGER_HOST = "bcp.com.bo.verifica.net";
const OTHER_DANGER = "https://bnb.com.bo.cuenta-segura.net/";
const SHORT = "https://bit.ly/3xYz";
const SAFE = "https://www.lostiempos.com/";
const TRACKER = "https://example.us12.list-manage.com/track/click?u=1&id=2";
const CAUTION = "https://netflix-codes.com/";
const WRAPPED = `https://nam02.safelinks.protection.outlook.com/?url=${encodeURIComponent(DANGER)}&data=x`;

const CONTENT: LinkWarning = {
  title: "Imita a un banco",
  explanation: "El nombre del banco está al principio, pero el sitio real es otro.",
  advice: "No escribas tus datos.",
  host: DANGER_HOST,
};

const DANGER_VIEW = dangerStep(CONTENT);

function link(href: string, text = "Entrar"): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.setAttribute("href", href);
  anchor.textContent = text;
  document.body.append(anchor);
  return anchor;
}

/** Stands for the browser's default action and for the last listener of the page. */
let reached: { prevented: boolean }[] = [];
const guard = (event: Event): void => {
  reached.push({ prevented: event.defaultPrevented });
  event.preventDefault();
};

type Outcome = "stopped" | "passed";

function activate(target: Element, type = "click", init: MouseEventInit = {}): Outcome {
  reached = [];
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, ...init });
  target.dispatchEvent(event);
  const [seen] = reached;
  if (!seen) {
    expect(event.defaultPrevented).toBe(true);
    return "stopped";
  }
  expect(seen.prevented).toBe(false);
  return "passed";
}

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
}

function manual() {
  const pending: ((deadline?: Deadline) => void)[] = [];
  return {
    schedule: (batch: (deadline?: Deadline) => void) => void pending.push(batch),
    drain() {
      for (let guardCount = 0; guardCount < 10_000; guardCount++) {
        const batch = pending.shift();
        if (!batch) return;
        batch();
      }
    },
  };
}

let page: Page | null = null;
let root: ShadowRoot | null = null;
let opened: ReturnType<typeof vi.spyOn>;

function start(scan = true) {
  const control = manual();
  const started = startPage(document, {
    schedule: control.schedule,
    dialog: { expose: (shadow) => (root = shadow) },
  });
  page = started;
  if (scan) control.drain();
  return { control, page: started };
}

const inDialog = <T extends Element>(selector: string) => root?.querySelector<T>(selector) ?? null;
const button = (id: string) => inDialog<HTMLButtonElement>(`button[data-action="${id}"]`);

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
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("what to warn about", () => {
  const verdicts = createVerdicts();

  it("gives the engine's words and the host for a dangerous link", () => {
    const warning = verdicts.describe({ address: DANGER, text: "Entrar" });
    expect(warning?.host).toBe(DANGER_HOST);
    expect(warning?.title.length).toBeGreaterThan(5);
    expect(warning?.explanation.length).toBeGreaterThan(20);
    expect(warning?.advice.length).toBeGreaterThan(10);
    expect(warning?.explanation).toBe(
      verdicts.describe({ address: DANGER, text: "otro" })?.explanation,
    );
  });

  it("names the carried host of a wrapped link", () => {
    expect(verdicts.describe({ address: WRAPPED, text: "" })?.host).toBe(DANGER_HOST);
  });

  it("shows look-alike letters in ASCII form", () => {
    const host = verdicts.describe({ address: "https://аррӏе.com/", text: "" })?.host ?? "";
    expect(host).toMatch(/^xn--/);
  });

  it("has nothing to say about an address the engine does not analyze", () => {
    expect(verdicts.describe({ address: "mailto:a@example.org", text: "" })).toBeNull();
  });

  it("uses words of its own that never call a link safe", () => {
    const own = [strings.warningHeading, strings.warningLeadsTo, strings.back, strings.openAnyway];
    for (const text of own) expect(text).not.toMatch(/segur|confiable|verificad/i);
    expect(strings.back).not.toBe(strings.openAnyway);
  });
});

describe("interceptor", () => {
  const stops: HTMLAnchorElement[] = [];
  let interceptor: ReturnType<typeof createInterceptor<string>> | null = null;
  const watch = () => {
    interceptor = createInterceptor<string>(
      window,
      (anchor) => (anchor.href === DANGER ? "stop" : null),
      (anchor) => void stops.push(anchor),
    );
  };

  beforeEach(() => {
    stops.length = 0;
  });
  afterEach(() => {
    interceptor?.stop();
    interceptor = null;
  });

  it("cancels a click on a link it is told to stop, and hands it over once", () => {
    watch();
    const anchor = link(DANGER);
    expect(activate(anchor)).toBe("stopped");
    expect(stops).toEqual([anchor]);
  });

  it("counts a click on something inside the link", () => {
    watch();
    const anchor = link(DANGER, "");
    anchor.innerHTML = "<span><img alt='foto'></span>";
    expect(activate(anchor.querySelector("img") as Element)).toBe("stopped");
    expect(stops).toEqual([anchor]);
  });

  it.each([
    ["the middle button", "auxclick", { button: 1 }, "stopped"],
    ["the right button", "auxclick", { button: 2 }, "passed"],
    ["Ctrl", "click", { ctrlKey: true }, "stopped"],
    ["Cmd", "click", { metaKey: true }, "stopped"],
    ["Shift", "click", { shiftKey: true }, "stopped"],
  ])("with %s the activation is %s%s%s", (_name, type, init, outcome) => {
    watch();
    expect(activate(link(DANGER), type, init)).toBe(outcome);
  });

  it("stops a click made by a script", () => {
    watch();
    const anchor = link(DANGER);
    reached = [];
    anchor.click();
    expect(reached).toEqual([]);
    expect(stops).toEqual([anchor]);
  });

  it("keeps the page's handlers from seeing a stopped click, and only that one", () => {
    watch();
    const [dangerous, ordinary] = [link(DANGER), link(SAFE)];
    const seen: string[] = [];
    const note = (name: string) => () => void seen.push(name);
    const listeners: [EventTarget, string, boolean][] = [
      [window, "window capture", true],
      [document, "document capture", true],
      [document, "document bubble", false],
      [dangerous, "link", false],
      [ordinary, "link", false],
    ];
    const added = listeners.map(([target, name, capture]) => {
      const listener = note(name);
      target.addEventListener("click", listener, capture);
      return () => target.removeEventListener("click", listener, capture);
    });
    activate(dangerous);
    expect(seen).toEqual([]);
    activate(ordinary);
    expect(seen).toEqual(["window capture", "document capture", "link", "document bubble"]);
    for (const remove of added) remove();
  });

  it("leaves a click that is not on a link alone", () => {
    watch();
    document.body.innerHTML = "<button id='b'>Archivar</button><p id='p'>texto</p>";
    expect(activate(document.querySelector("#b") as Element)).toBe("passed");
    expect(activate(document.querySelector("#p") as Element)).toBe("passed");
    expect(stops).toEqual([]);
  });

  it("stops nothing after stop()", () => {
    watch();
    interceptor?.stop();
    expect(activate(link(DANGER))).toBe("passed");
  });
});

describe("warning dialog", () => {
  let shadow: ShadowRoot | null = null;
  const make = () => createDialog(document, { expose: (made) => (shadow = made) });
  const find = <T extends Element>(selector: string) => shadow?.querySelector<T>(selector) ?? null;

  it("is one element the page cannot read, announced as an alert dialog", () => {
    const dialog = make();
    expect(dialog.open(DANGER_VIEW, () => undefined)).toBe(true);
    const hosts = document.querySelectorAll<HTMLElement>(DIALOG_TAG);
    expect(hosts).toHaveLength(1);
    const [host] = hosts;
    expect(host?.parentElement).toBe(document.documentElement);
    expect(host?.shadowRoot).toBeNull();
    expect(host?.textContent).toBe("");
    expect(host?.getAttribute("style")).toMatch(/all: initial !important/);

    const modal = find<HTMLDialogElement>("dialog");
    expect(modal?.getAttribute("role")).toBe("alertdialog");
    expect(modal?.hasAttribute("open")).toBe(true);
    const labelled = shadow?.getElementById(modal?.getAttribute("aria-labelledby") ?? "");
    const described = shadow?.getElementById(modal?.getAttribute("aria-describedby") ?? "");
    expect(labelled?.textContent).toBe(strings.warningHeading);
    expect(labelled?.querySelector("svg")).not.toBeNull();
    expect(described?.textContent).toContain(CONTENT.title);
    expect(described?.textContent).toContain(CONTENT.explanation);
    dialog.remove();
  });

  it("shows the reason, the host, the advice, and exactly two choices", () => {
    const dialog = make();
    dialog.open(DANGER_VIEW, () => undefined);
    expect(find(".host")?.textContent).toBe(DANGER_HOST);
    expect(find(".advice")?.textContent).toBe(CONTENT.advice);
    expect([...(shadow?.querySelectorAll("button") ?? [])].map((b) => b.textContent)).toEqual([
      "Abrir de todos modos",
      "Volver",
    ]);
    expect(dialog.view).toMatchObject({ title: CONTENT.title, host: CONTENT.host });
    dialog.remove();
  });

  it("builds everything from text, whatever the input holds", () => {
    const hostile: LinkWarning = {
      title: "<img src=x onerror=alert(1)>",
      explanation: "<script>alert(2)</script>",
      advice: "<a href='https://evil.test/'>aquí</a>",
      host: "evil.test‮moc.elgoog<b>x</b>",
    };
    const dialog = make();
    dialog.open(dangerStep(hostile), () => undefined);
    expect(shadow?.querySelectorAll("img, script, a, b")).toHaveLength(0);
    expect(find(".title")?.textContent).toBe(hostile.title);
    expect(find(".host")?.textContent).toBe(hostile.host);
    expect(find("style")?.textContent).toMatch(/\.host \{[^}]*unicode-bidi: bidi-override/);
    dialog.remove();
  });

  it("meets AA contrast in every part", () => {
    const luminance = (hex: string) => {
      const [r = 0, g = 0, b = 0] = [1, 3, 5].map((at) => {
        const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const [part, { text, fill }] of Object.entries(DIALOG_COLORS)) {
      const [high = 0, low = 0] = [luminance(text), luminance(fill)].sort((x, y) => y - x);
      expect((high + 0.05) / (low + 0.05), part).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("starts on Volver", () => {
    const dialog = make();
    dialog.open(DANGER_VIEW, () => undefined);
    expect(dialog.view?.focused).toBe("back");
    dialog.remove();
  });

  it.each([
    ["Volver", () => find<HTMLButtonElement>('button[data-action="back"]')?.click(), "back"],
    [
      "Abrir de todos modos",
      () => find<HTMLButtonElement>('button[data-action="open"]')?.click(),
      "open",
    ],
    ["Escape", () => void press("Escape"), "back"],
    [
      "the browser's cancel",
      () => void find("dialog")?.dispatchEvent(new Event("cancel", { cancelable: true })),
      "back",
    ],
    [
      "a click on the backdrop",
      () => void find("dialog")?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      "back",
    ],
    ["close()", (dialog: ReturnType<typeof make>) => dialog.close(), "back"],
  ])("closes on %s, reporting once", (_name, act, expected) => {
    const dialog = make();
    const anchor = link(DANGER);
    const focus = vi.spyOn(anchor, "focus");
    const choices: string[] = [];
    dialog.open(DANGER_VIEW, (choice) => void choices.push(choice), anchor);
    act(dialog);
    act(dialog);
    expect(choices).toEqual([expected]);
    expect(dialog.view).toBeNull();
    expect(document.querySelector(DIALOG_TAG)).toBeNull();
    expect(focus).toHaveBeenCalledTimes(1);
    dialog.remove();
  });

  it("does not close on a click inside the warning", () => {
    const dialog = make();
    dialog.open(DANGER_VIEW, () => undefined);
    find(".body")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(dialog.view).not.toBeNull();
    dialog.remove();
  });

  it("keeps what happens inside the warning from the page's handlers", () => {
    const dialog = make();
    dialog.open(DANGER_VIEW, () => undefined);
    const heard: string[] = [];
    const listen = (event: Event) => void heard.push(event.type);
    for (const type of ["click", "mousedown", "pointerdown"])
      document.addEventListener(type, listen);
    for (const type of ["pointerdown", "mousedown", "click"]) {
      find(".body")?.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true }));
    }
    expect(heard).toEqual([]);
    for (const type of ["click", "mousedown", "pointerdown"]) {
      document.removeEventListener(type, listen);
    }
    dialog.remove();
  });

  it("does not focus a link that left the page", () => {
    const dialog = make();
    const anchor = link(DANGER);
    const focus = vi.spyOn(anchor, "focus");
    dialog.open(DANGER_VIEW, () => undefined, anchor);
    anchor.remove();
    dialog.close();
    expect(focus).not.toHaveBeenCalled();
  });

  it("keeps every key from the page while open, and gives them back after", () => {
    const dialog = make();
    const heard: string[] = [];
    const listen = (event: Event) =>
      void heard.push(`${event.type}:${(event as KeyboardEvent).key}`);
    for (const type of ["keydown", "keyup", "keypress"]) {
      window.addEventListener(type, listen, true);
      document.addEventListener(type, listen);
    }
    dialog.open(DANGER_VIEW, () => undefined);
    for (const type of ["keydown", "keypress", "keyup"]) {
      document.body.dispatchEvent(new KeyboardEvent(type, { key: "e", bubbles: true }));
    }
    const escape = press("Escape");
    expect(heard).toEqual([]);
    expect(escape.defaultPrevented).toBe(true);
    expect(dialog.view).toBeNull();

    press("e");
    expect(heard).toEqual(["keydown:e", "keydown:e"]);
    for (const type of ["keydown", "keyup", "keypress"]) {
      window.removeEventListener(type, listen, true);
      document.removeEventListener(type, listen);
    }
  });

  it("moves Tab between the two choices, both ways", () => {
    const dialog = make();
    dialog.open(DANGER_VIEW, () => undefined);
    const order: (string | undefined)[] = [];
    for (const shiftKey of [false, false, true, true]) {
      expect(press("Tab", { shiftKey }).defaultPrevented).toBe(true);
      order.push(dialog.view?.focused);
    }
    expect(order).toEqual(["open", "back", "open", "back"]);
    dialog.remove();
  });

  it("keeps the first warning when asked to open another", () => {
    const dialog = make();
    dialog.open(DANGER_VIEW, () => undefined);
    expect(dialog.open(dangerStep({ ...CONTENT, host: "otro.example" }), () => undefined)).toBe(
      false,
    );
    expect(document.querySelectorAll(DIALOG_TAG)).toHaveLength(1);
    expect(find(".host")?.textContent).toBe(DANGER_HOST);
    dialog.remove();
  });

  it("leaves nothing behind when the browser cannot show it", () => {
    proto.showModal = () => {
      throw new Error("not allowed");
    };
    const dialog = make();
    expect(dialog.open(DANGER_VIEW, () => undefined)).toBe(false);
    expect(dialog.view).toBeNull();
    expect(document.querySelector(DIALOG_TAG)).toBeNull();
    const heard: string[] = [];
    const listen = (event: Event) => void heard.push((event as KeyboardEvent).key);
    document.addEventListener("keydown", listen);
    press("e");
    expect(heard).toEqual(["e"]);
    document.removeEventListener("keydown", listen);
  });
});

describe("clicks on a page", () => {
  it("stops a dangerous link and shows why and where it leads", () => {
    const anchor = link(DANGER);
    const { page: started } = start();
    expect(activate(anchor)).toBe("stopped");
    expect(started.dialog.view?.host).toBe(DANGER_HOST);
    expect(inDialog(".title")?.textContent).toBe(
      started.verdicts.describe({ address: DANGER, text: "Entrar" })?.title,
    );
    expect(opened).not.toHaveBeenCalled();
  });

  it.each([
    ["an ordinary link", SAFE],
    ["a caution link", CAUTION],
    ["a newsletter's tracking link", TRACKER],
    ["a mail link", "mailto:a@example.org"],
    ["a link inside the same page", "#arriba"],
  ])("lets %s open as usual", (_name, href) => {
    const anchor = link(href);
    const { page: started } = start();
    expect(activate(anchor)).toBe("passed");
    expect(activate(anchor, "auxclick", { button: 1 })).toBe("passed");
    expect(started.dialog.view).toBeNull();
  });

  it("lets a link in a message being written alone, and the mail client's controls", () => {
    document.body.innerHTML = `<div contenteditable="true"><a id="draft" href="${DANGER}">x</a></div><button id="b">Enviar</button>`;
    const { page: started } = start();
    expect(activate(document.querySelector("#draft") as Element)).toBe("passed");
    expect(activate(document.querySelector("#b") as Element)).toBe("passed");
    expect(started.dialog.view).toBeNull();
  });

  it("lets a click on a mark through", () => {
    link(DANGER);
    start();
    const mark = document.querySelector(MARK_TAG) as Element;
    expect(mark).not.toBeNull();
    expect(activate(mark)).toBe("passed");
  });

  it("stops a link the scan has not reached yet", () => {
    const anchor = link(DANGER);
    const { page: started } = start(false);
    expect(document.querySelector(MARK_TAG)).toBeNull();
    expect(activate(anchor)).toBe("stopped");
    expect(started.dialog.view?.host).toBe(DANGER_HOST);
  });

  it("judges the address the link has at the moment of the click", () => {
    const anchor = link(SAFE);
    const { page: started } = start();
    expect(activate(anchor)).toBe("passed");
    anchor.setAttribute("href", DANGER);
    expect(activate(anchor)).toBe("stopped");
    started.dialog.close();
    anchor.setAttribute("href", SAFE);
    expect(activate(anchor)).toBe("passed");
  });

  it("names the carried host of a wrapped link", () => {
    const anchor = link(WRAPPED);
    const { page: started } = start();
    expect(activate(anchor)).toBe("stopped");
    expect(started.dialog.view?.host).toBe(DANGER_HOST);
  });

  it("stops the keyboard and the middle button too", () => {
    const anchor = link(DANGER);
    const { page: started } = start();
    expect(activate(anchor, "auxclick", { button: 1 })).toBe("stopped");
    started.dialog.close();
    expect(activate(anchor, "click", { detail: 0 })).toBe("stopped");
  });

  it("keeps one warning when another dangerous link is activated", () => {
    const [first, second] = [link(DANGER), link(OTHER_DANGER)];
    const { page: started } = start();
    activate(first);
    expect(activate(second)).toBe("stopped");
    expect(document.querySelectorAll(DIALOG_TAG)).toHaveLength(1);
    expect(started.dialog.view?.host).toBe(DANGER_HOST);
  });

  it("goes back with Enter right away: nothing opens and focus returns to the link", () => {
    const anchor = link(DANGER);
    const focus = vi.spyOn(anchor, "focus");
    const { page: started } = start();
    activate(anchor);
    expect(started.dialog.view?.focused).toBe("back");
    button("back")?.click();
    expect(started.dialog.view).toBeNull();
    expect(opened).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("opens anyway in a new tab with no opener and no referrer", () => {
    const anchor = link(DANGER);
    const { page: started } = start();
    activate(anchor);
    button("open")?.click();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledWith(DANGER, "_blank", "noopener,noreferrer");
    expect(started.dialog.view).toBeNull();
  });

  it("opens the address that was judged, not one swapped in meanwhile", () => {
    const anchor = link(DANGER);
    start();
    activate(anchor);
    anchor.setAttribute("href", OTHER_DANGER);
    button("open")?.click();
    expect(opened).toHaveBeenCalledWith(DANGER, "_blank", "noopener,noreferrer");
  });

  it("asks again on the next click, and keeps the mark", () => {
    const anchor = link(DANGER);
    const { page: started } = start();
    activate(anchor);
    button("open")?.click();
    expect(document.querySelectorAll(MARK_TAG)).toHaveLength(1);
    expect(activate(anchor)).toBe("stopped");
    expect(started.dialog.view).not.toBeNull();
  });

  it("works for a message that arrives later", async () => {
    start();
    const anchor = link(DANGER);
    await Promise.resolve();
    expect(activate(anchor)).toBe("stopped");
  });

  it("goes back to an untouched page after stop()", () => {
    const anchor = link(DANGER);
    const { page: started } = start();
    activate(anchor);
    started.stop();
    expect(document.querySelector(DIALOG_TAG)).toBeNull();
    expect(document.querySelector(MARK_TAG)).toBeNull();
    expect(activate(anchor)).toBe("passed");
    const heard: string[] = [];
    const listen = (event: Event) => void heard.push((event as KeyboardEvent).key);
    document.addEventListener("keydown", listen);
    press("e");
    expect(heard).toEqual(["e"]);
    document.removeEventListener("keydown", listen);
  });
});

describe("a link whose text shows another site", () => {
  const REAL = "https://proteccion-de-usuario.jimdosite.com/";
  const SHOWN = "https://Outlook.com/verificar-identidad";

  it("is marked as danger, says where it really leads, and its click is stopped", () => {
    const anchor = link(REAL, SHOWN);
    const { page: started } = start();
    expect(started.marks.view(anchor)).toMatchObject({
      level: "danger",
      label: "Peligro",
      reason: "Dice outlook.com, pero lleva a jimdosite.com.",
    });
    expect(activate(anchor)).toBe("stopped");
    expect(inDialog(".title")?.textContent).toBe("Este enlace no va a donde dice");
    expect(inDialog(".host")?.textContent).toBe("proteccion-de-usuario.jimdosite.com");
  });

  it("is judged by its text: the same address behind a plain label is not stopped", () => {
    const anchor = link(REAL, "Ver mi cuenta");
    const { page: started } = start();
    expect(started.marks.view(anchor)?.level).toBe("caution");
    expect(activate(anchor)).toBe("passed");
  });
});

describe("starting before the document is ready", () => {
  it("stops clicks at once and scans when the document is ready", () => {
    const state = vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    const anchor = link(DANGER);
    const { control, page: started } = start();
    expect(document.querySelector(MARK_TAG)).toBeNull();
    expect(activate(anchor)).toBe("stopped");
    started.dialog.close();

    state.mockReturnValue("interactive");
    document.dispatchEvent(new Event("DOMContentLoaded"));
    control.drain();
    expect(document.querySelectorAll(MARK_TAG)).toHaveLength(1);
  });

  it("never scans when stopped before the document is ready", () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    link(DANGER);
    const { control, page: started } = start();
    started.stop();
    document.dispatchEvent(new Event("DOMContentLoaded"));
    control.drain();
    expect(document.querySelector(MARK_TAG)).toBeNull();
  });
});

describe("cost and privacy of a click", () => {
  it("usually decides in under 5 ms on a page of 5,000 links", () => {
    const targets = [SAFE, "https://www.bcp.com.bo/", CAUTION, SHORT];
    document.body.innerHTML = Array.from(
      { length: 5000 },
      (_, index) =>
        `<p>Linea ${index} <a href="${targets[index % targets.length]}p${index}">enlace ${index}</a></p>`,
    ).join("");
    const { page: started } = start(false);
    const anchors = [...document.querySelectorAll("a")];
    const timed = (run: () => void) => {
      const from = performance.now();
      run();
      return performance.now() - from;
    };
    const decide = (anchor: HTMLAnchorElement) => {
      const input = readLink(anchor);
      return input ? started.verdicts.of(input)?.level : null;
    };
    for (const anchor of anchors.slice(0, 200)) activate(anchor);
    for (let index = 0; index < 50; index++) decide(link(`${DANGER}previo${index}`));

    const ordinary = anchors.slice(200, 500).map((anchor) => timed(() => activate(anchor)));
    const dangerous = Array.from({ length: 100 }, (_, index) => {
      const anchor = link(`${DANGER}nuevo${index}`, `caso ${index}`);
      return timed(() => expect(decide(anchor)).toBe("danger"));
    });

    // The usual case, so the check does not depend on the speed of the machine running it.
    const usual = (times: readonly number[]) =>
      [...times].sort((x, y) => x - y)[Math.floor(times.length / 2)] ?? 0;
    expect(usual(ordinary), "ordinary click").toBeLessThan(5);
    expect(usual(dangerous), "dangerous link not in the cache").toBeLessThan(5);
  }, 60_000);

  it("sends and stores nothing", () => {
    const fetched = vi.fn();
    vi.stubGlobal("fetch", fetched);
    const beacon = vi.fn();
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    const request = vi.spyOn(XMLHttpRequest.prototype, "open");
    const stored = vi.spyOn(Storage.prototype, "setItem");
    const area = { get: vi.fn(), set: vi.fn(), remove: vi.fn() };
    const messaging = { sendMessage: vi.fn(), connect: vi.fn() };
    const api = { storage: { local: area, sync: area, session: area }, runtime: messaging };
    vi.stubGlobal("chrome", api);
    vi.stubGlobal("browser", api);

    const anchor = link(DANGER);
    start();
    activate(anchor);
    button("back")?.click();
    activate(anchor);
    button("open")?.click();

    for (const spy of [fetched, beacon, request, stored, ...Object.values(area)]) {
      expect(spy).not.toHaveBeenCalled();
    }
    for (const spy of Object.values(messaging)) expect(spy).not.toHaveBeenCalled();
    expect(opened).toHaveBeenCalledTimes(1);
  });
});
