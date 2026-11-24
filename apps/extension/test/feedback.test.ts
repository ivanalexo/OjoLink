// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMPACT_AFTER_MS, createIndicator, INDICATOR_TAG } from "../src/indicator.ts";
import { MARK_TAG } from "../src/marks.ts";
import { HOVER_DELAY_MS, startPage, type Page } from "../src/page.ts";
import type { Deadline } from "../src/scanner.ts";
import { TOOLTIP_TAG } from "../src/tooltip.ts";

const DANGER = "https://bcp.com.bo.verifica.net/";
const SHORT = "https://bit.ly/3xYz";
const SAFE = "https://www.lostiempos.com/";
const CAUTION = "https://netflix-codes.com/";
const NONE = { danger: 0, caution: 0, "hidden-destination": 0 };

function link(href: string, text = "Entrar"): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.setAttribute("href", href);
  anchor.textContent = text;
  return anchor;
}

function message(...anchors: HTMLAnchorElement[]): HTMLElement {
  const box = document.createElement("div");
  for (const anchor of anchors) {
    const line = document.createElement("p");
    line.append("Mira: ", anchor);
    box.append(line);
  }
  document.body.append(box);
  return box;
}

function manual() {
  const pending: ((deadline?: Deadline) => void)[] = [];
  return {
    schedule: (batch: (deadline?: Deadline) => void) => void pending.push(batch),
    drain() {
      for (let guard = 0; guard < 10_000; guard++) {
        const batch = pending.shift();
        if (!batch) return;
        batch();
      }
    },
  };
}

let page: Page | null = null;
function start() {
  const control = manual();
  const started = startPage(document, { schedule: control.schedule });
  page = started;
  control.drain();
  return { control, page: started };
}

const observed = async () => {
  await vi.advanceTimersByTimeAsync(0);
};

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
});

afterEach(() => {
  page?.stop();
  page = null;
  for (const own of document.querySelectorAll(`${TOOLTIP_TAG}, ${INDICATOR_TAG}`)) own.remove();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("page indicator", () => {
  it("says how many links were checked when none shows a warning sign", () => {
    const indicator = createIndicator(document);
    indicator.update({ checked: 12, marked: NONE });
    expect(indicator.view).toMatchObject({
      tone: "clear",
      text: "OjoLink · 12 enlaces revisados, sin señales de alerta",
      short: "OjoLink · 12",
    });
    indicator.update({ checked: 1, marked: NONE });
    expect(indicator.view?.text).toBe("OjoLink · 1 enlace revisado, sin señales de alerta");
    indicator.remove();
  });

  it("never calls a link safe", () => {
    const indicator = createIndicator(document);
    indicator.update({ checked: 5, marked: NONE });
    expect(indicator.view?.text).not.toMatch(/segur|confiable|verificad/i);
    indicator.remove();
  });

  it.each([
    [{ ...NONE, danger: 1 }, "danger", "OjoLink · 9 enlaces revisados, 1 con aviso", "OjoLink · 1"],
    [
      { danger: 2, caution: 1, "hidden-destination": 3 },
      "danger",
      "OjoLink · 9 enlaces revisados, 6 con avisos",
      "OjoLink · 6",
    ],
    [
      { ...NONE, caution: 2 },
      "caution",
      "OjoLink · 9 enlaces revisados, 2 con avisos",
      "OjoLink · 2",
    ],
    [
      { ...NONE, "hidden-destination": 3 },
      "hidden-destination",
      "OjoLink · 9 enlaces revisados, 3 con avisos",
      "OjoLink · 3",
    ],
  ])("counts the marked links and takes the tone of the worst: %j", (marked, tone, text, short) => {
    const indicator = createIndicator(document);
    indicator.update({ checked: 9, marked });
    expect(indicator.view).toMatchObject({ tone, text, short });
    indicator.remove();
  });

  it("is one element at the bottom, outside the message, that the page cannot read", () => {
    const indicator = createIndicator(document);
    indicator.update({ checked: 3, marked: NONE });
    indicator.update({ checked: 4, marked: NONE });
    const hosts = document.querySelectorAll<HTMLElement>(INDICATOR_TAG);
    expect(hosts).toHaveLength(1);
    const [host] = hosts;
    expect(host?.parentElement).toBe(document.documentElement);
    expect(host?.shadowRoot).toBeNull();
    expect(host?.textContent).toBe("");
    expect(host?.getAttribute("role")).toBe("status");
    expect(host?.getAttribute("aria-label")).toBe(indicator.view?.text);
    expect(getComputedStyle(host as Element).position).toBe("fixed");
    indicator.remove();
    expect(document.querySelector(INDICATOR_TAG)).toBeNull();
  });

  it("shrinks after a few seconds and opens again when the count changes", () => {
    const indicator = createIndicator(document);
    indicator.update({ checked: 3, marked: NONE });
    expect(indicator.view?.compact).toBe(false);
    vi.advanceTimersByTime(COMPACT_AFTER_MS);
    expect(indicator.view?.compact).toBe(true);
    indicator.update({ checked: 3, marked: NONE });
    expect(indicator.view?.compact).toBe(true);
    indicator.update({ checked: 4, marked: { ...NONE, danger: 1 } });
    expect(indicator.view?.compact).toBe(false);
    indicator.remove();
  });

  it("hides when the page has no link to check", () => {
    const indicator = createIndicator(document);
    indicator.update({ checked: 2, marked: NONE });
    indicator.update({ checked: 0, marked: NONE });
    expect(indicator.view).toBeNull();
    expect(document.querySelector(INDICATOR_TAG)).toBeNull();
  });
});

describe("indicator on a page", () => {
  it("shows that a message with nothing suspicious was checked", () => {
    message(link(SAFE), link("https://www.bcp.com.bo/"), link("mailto:a@example.org"));
    const { page: started } = start();
    expect(document.querySelectorAll(MARK_TAG)).toHaveLength(0);
    expect(started.indicator.view).toMatchObject({
      tone: "clear",
      text: "OjoLink · 2 enlaces revisados, sin señales de alerta",
    });
  });

  it("counts the marked links of a message", () => {
    message(link(SAFE), link(DANGER), link(SHORT), link(CAUTION));
    const { page: started } = start();
    expect(started.indicator.view).toMatchObject({
      tone: "danger",
      text: "OjoLink · 4 enlaces revisados, 3 con avisos",
    });
  });

  it("follows the page as messages come and go", async () => {
    const first = message(link(SAFE));
    const { control, page: started } = start();
    expect(started.indicator.view?.text).toContain("1 enlace revisado");

    const second = message(link(DANGER), link(SAFE, "otro"));
    await observed();
    control.drain();
    expect(started.indicator.view?.text).toBe("OjoLink · 3 enlaces revisados, 1 con aviso");

    second.remove();
    first.remove();
    await observed();
    control.drain();
    expect(started.indicator.view).toBeNull();
  });

  it("shows nothing on a page with no links", () => {
    document.body.innerHTML = "<p>Sin enlaces</p>";
    const { page: started } = start();
    expect(started.indicator.view).toBeNull();
  });

  it("does not make the scanner look at the page again", async () => {
    message(link(SAFE));
    const { page: started } = start();
    await observed();
    expect(started.scanner.pending).toBe(0);
  });
});

describe("hovering any link", () => {
  const over = (target: Element, from: Element | null = null) =>
    target.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, relatedTarget: from }));
  const out = (target: Element, to: Element | null = null) =>
    target.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: to }));

  it("says where an unmarked link leads, after a short rest", () => {
    const anchor = link(SAFE, "Leer la nota");
    message(anchor);
    const { page: started } = start();
    over(anchor);
    vi.advanceTimersByTime(HOVER_DELAY_MS - 1);
    expect(started.tooltip.visible).toBe(false);
    vi.advanceTimersByTime(1);
    expect(started.tooltip.content).toEqual({
      level: "safe",
      label: "Sin señales de alerta",
      reason: "Lleva a www.lostiempos.com.",
    });
  });

  it("works on a button-like link and on a link around an image", () => {
    document.body.innerHTML = `
      <a id="boton" href="https://console.example.org/" style="display:block"><span><b>Abrir consola</b></span></a>
      <a id="imagen" href="${SAFE}"><img alt="foto"></a>`;
    const { page: started } = start();
    const inner = document.querySelector("#boton b") as Element;
    over(inner);
    vi.advanceTimersByTime(HOVER_DELAY_MS);
    expect(started.tooltip.content?.reason).toBe("Lleva a console.example.org.");
    out(inner);
    over(document.querySelector("#imagen img") as Element);
    vi.advanceTimersByTime(HOVER_DELAY_MS);
    expect(started.tooltip.content?.reason).toBe("Lleva a www.lostiempos.com.");
  });

  it("names the real host of a wrapped link", () => {
    const wrapped = `https://nam02.safelinks.protection.outlook.com/?url=${encodeURIComponent(SAFE)}&data=x`;
    const anchor = link(wrapped);
    message(anchor);
    const { page: started } = start();
    over(anchor);
    vi.advanceTimersByTime(HOVER_DELAY_MS);
    expect(started.tooltip.content?.reason).toBe("Lleva a www.lostiempos.com.");
  });

  it("shows nothing when the pointer only passes over the link", () => {
    const anchor = link(SAFE);
    message(anchor);
    const { page: started } = start();
    over(anchor);
    vi.advanceTimersByTime(100);
    out(anchor);
    vi.advanceTimersByTime(HOVER_DELAY_MS);
    expect(started.tooltip.visible).toBe(false);
  });

  it("stays while the pointer moves inside the link and goes when it leaves", () => {
    document.body.innerHTML = `<a id="a" href="${SAFE}"><span id="x">uno</span> <span id="y">dos</span></a>`;
    const { page: started } = start();
    const [x, y] = [
      document.querySelector("#x") as Element,
      document.querySelector("#y") as Element,
    ];
    over(x);
    vi.advanceTimersByTime(HOVER_DELAY_MS);
    out(x, y);
    over(y, x);
    expect(started.tooltip.visible).toBe(true);
    out(y, document.body);
    expect(started.tooltip.visible).toBe(false);
  });

  it("shows it at once on keyboard focus and hides it on blur", () => {
    const anchor = link(SAFE);
    message(anchor);
    const { page: started } = start();
    anchor.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(started.tooltip.content?.level).toBe("safe");
    anchor.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(started.tooltip.visible).toBe(false);
  });

  it("leaves a marked link to its own reason", () => {
    const anchor = link(DANGER);
    message(anchor);
    const { page: started } = start();
    anchor.dispatchEvent(new Event("pointerenter"));
    const reason = started.tooltip.content?.reason;
    over(anchor);
    vi.advanceTimersByTime(HOVER_DELAY_MS);
    expect(started.tooltip.content).toMatchObject({ level: "danger", reason });
    expect(reason).not.toContain("Lleva a");
  });

  it("says nothing for a link that is not checked", () => {
    const [mail, same] = [link("mailto:a@example.org"), link("#arriba")];
    message(mail, same);
    const { page: started } = start();
    for (const anchor of [mail, same]) {
      over(anchor);
      vi.advanceTimersByTime(HOVER_DELAY_MS);
      expect(started.tooltip.visible).toBe(false);
    }
  });

  it("stops answering once the page script stops", () => {
    const anchor = link(SAFE);
    message(anchor);
    const { page: started } = start();
    started.stop();
    over(anchor);
    vi.advanceTimersByTime(HOVER_DELAY_MS);
    expect(started.tooltip.visible).toBe(false);
  });
});
