// @vitest-environment jsdom
import { analyze } from "@ojolink/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ICONS, MARKED_LEVELS, PALETTE } from "../src/mark-style.ts";
import { createMarks, MARK_TAG } from "../src/marks.ts";
import { createTooltip, TOOLTIP_TAG } from "../src/tooltip.ts";
import { CACHE_SIZE, createVerdicts, readLink, TEXT_LIMIT } from "../src/verdicts.ts";

const DANGER = "https://bcp.com.bo.verifica.net/";
const SHORT = "https://bit.ly/3xYz";
const SAFE = "https://www.lostiempos.com/";
const CAUTION = "https://netflix-codes.com/";
const WRAPPED = `https://nam02.safelinks.protection.outlook.com/?url=${encodeURIComponent(DANGER)}&data=x`;

function link(href: string | null, text = "Entrar"): HTMLAnchorElement {
  const anchor = document.createElement("a");
  if (href !== null) anchor.setAttribute("href", href);
  anchor.textContent = text;
  return anchor;
}

function message(...anchors: HTMLAnchorElement[]): HTMLElement {
  const box = document.createElement("div");
  for (const anchor of anchors) {
    const line = document.createElement("p");
    line.append("Hola, entra aquí: ", anchor, " y avisa.");
    box.append(line);
  }
  document.body.append(box);
  return box;
}

const marksIn = (root: ParentNode = document) => [...root.querySelectorAll(MARK_TAG)];

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  for (const tip of document.querySelectorAll(TOOLTIP_TAG)) tip.remove();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("which links get a verdict", () => {
  const verdicts = createVerdicts();
  const judge = (anchor: HTMLAnchorElement) => {
    document.body.append(anchor);
    const input = readLink(anchor);
    return input ? verdicts.of(input) : null;
  };

  it.each([
    ["a dangerous link", DANGER, "danger", "Peligro"],
    ["a short link", SHORT, "hidden-destination", "Destino oculto"],
    ["a brand name beside a neutral word", CAUTION, "caution", "Precaución"],
    ["an ordinary link", SAFE, "safe", "Sin señales de alerta"],
    ["a wrapped link", WRAPPED, "danger", "Peligro"],
  ])("judges %s as the web app does", (_name, href, level, label) => {
    const verdict = judge(link(href));
    const expected = analyze(href);
    expect(verdict).toMatchObject({ level, label });
    expect(expected.analyzed && expected.level).toBe(level);
    expect(verdict?.reason.length).toBeGreaterThan(10);
  });

  it.each([
    ["a Mailchimp tracking link", "https://click.list-manage.com/track/click?u=abc&id=def"],
    ["a SendGrid tracking link", "https://u123.ct.sendgrid.net/ls/click?upn=abc"],
  ])("judges %s as a hidden destination, which is marked", (_name, href) => {
    expect(judge(link(href))).toMatchObject({ level: "hidden-destination" });
  });

  it("gives the host the link really leads to", () => {
    expect(judge(link(SAFE))?.host).toBe("www.lostiempos.com");
    expect(judge(link(WRAPPED))?.host).toBe("bcp.com.bo.verifica.net");
  });

  it("gives the engine's short text for the main signal as the reason", () => {
    const expected = analyze(DANGER);
    expect(judge(link(DANGER))?.reason).toBe(expected.analyzed && expected.signals[0]?.tooltip);
  });

  it.each([
    ["mailto", "mailto:alguien@example.org"],
    ["a phone number", "tel:+59170000000"],
    ["a script address", "javascript:void(0)"],
    ["a place in the same page", "#seccion"],
    ["the page itself", "about:blank"],
    ["no address", null],
  ])("skips %s", (_name, href) => {
    const anchor = link(href);
    document.body.append(anchor);
    expect(readLink(anchor)).toBeNull();
  });

  it("skips a link inside a text the person is writing", () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const anchor = link(DANGER);
    editor.append(anchor);
    document.body.append(editor);
    expect(readLink(anchor)).toBeNull();

    editor.setAttribute("contenteditable", "false");
    expect(readLink(anchor)).not.toBeNull();
  });

  it("passes the link's visible text, cut at the limit and with invisible characters kept", () => {
    const calls: [string, string][] = [];
    const spy = createVerdicts((address, options) => {
      calls.push([address, options.context.visibleText]);
      return analyze(address, options);
    });
    const hidden = `fact${String.fromCodePoint(0x202e)}fdp.exe`;
    for (const text of [`  ${hidden}\n `, "x".repeat(TEXT_LIMIT + 50)]) {
      const anchor = link(SAFE, text);
      document.body.append(anchor);
      const input = readLink(anchor);
      if (input) spy.of(input);
    }
    expect(calls[0]).toEqual([SAFE, hidden]);
    expect(calls[1]?.[1]).toHaveLength(TEXT_LIMIT);
  });
});

describe("bounded cache of verdicts", () => {
  function counting(limit?: number) {
    const calls: string[] = [];
    const verdicts = createVerdicts((address, options) => {
      calls.push(`${address} | ${options.context.visibleText}`);
      return analyze(address, options);
    }, limit);
    return { calls, verdicts };
  }

  it("analyzes a repeated link once", () => {
    const { calls, verdicts } = counting();
    const first = verdicts.of({ address: DANGER, text: "Entrar" });
    expect(verdicts.of({ address: DANGER, text: "Entrar" })).toBe(first);
    expect(calls).toHaveLength(1);
  });

  it("analyzes the same address again when its text differs", () => {
    const { calls, verdicts } = counting();
    verdicts.of({ address: DANGER, text: "Entrar" });
    verdicts.of({ address: DANGER, text: "Ver factura" });
    expect(calls).toHaveLength(2);
  });

  it("remembers that a link is not analyzable", () => {
    const { calls, verdicts } = counting();
    expect(verdicts.of({ address: "https://", text: "" })).toBeNull();
    expect(verdicts.of({ address: "https://", text: "" })).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("drops the least recently used entry past its bound", () => {
    const { calls, verdicts } = counting(3);
    const of = (name: string) => verdicts.of({ address: `https://${name}.example.org/`, text: "" });
    of("a");
    of("b");
    of("c");
    of("a");
    of("d");
    expect(verdicts.size).toBe(3);
    of("a");
    expect(calls).toHaveLength(4);
    of("b");
    expect(calls).toHaveLength(5);
    expect(CACHE_SIZE).toBe(1000);
  });
});

describe("mark style", () => {
  function luminance(hex: string): number {
    const channels = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
    const [r = 0, g = 0, b = 0] = channels.map((value) =>
      value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const contrast = (a: string, b: string) => {
    const [high = 0, low = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  };

  it.each(MARKED_LEVELS)("the %s pill meets AA contrast", (level) => {
    expect(contrast(PALETTE[level].text, PALETTE[level].fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE[level].text, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("gives each level a different icon, word, and color", () => {
    const samples = { danger: DANGER, caution: CAUTION, "hidden-destination": SHORT };
    const words = MARKED_LEVELS.map(
      (level) => createVerdicts().of({ address: samples[level], text: "" })?.label,
    );
    expect(new Set(words).size).toBe(3);
    expect(new Set(MARKED_LEVELS.map((level) => ICONS[level].join())).size).toBe(3);
    expect(new Set(MARKED_LEVELS.map((level) => PALETTE[level].text)).size).toBe(3);
  });
});

describe("marks", () => {
  const setup = () => {
    const tooltip = createTooltip(document);
    return { tooltip, marks: createMarks(document, tooltip) };
  };
  const verdictOf = (href: string) => createVerdicts().of({ address: href, text: "Entrar" });

  it("puts one mark right after a dangerous link, with the level word and an icon", () => {
    const { marks } = setup();
    const anchor = link(DANGER);
    message(anchor);
    marks.apply(anchor, verdictOf(DANGER));
    expect(marksIn()).toHaveLength(1);
    expect(anchor.nextSibling).toBe(marksIn()[0]);
    const view = marks.view(anchor);
    expect(view?.root.querySelector(".pill")?.textContent).toBe("Peligro");
    expect(view?.root.querySelector("svg")?.getAttribute("data-icon")).toBe("danger");
    expect(view?.root.querySelector(".pill")?.getAttribute("data-level")).toBe("danger");
  });

  it.each([
    [SHORT, "Destino oculto", "hidden-destination"],
    [CAUTION, "Precaución", "caution"],
  ])("marks %s as %s", (href, word, level) => {
    const { marks } = setup();
    const anchor = link(href);
    message(anchor);
    marks.apply(anchor, verdictOf(href));
    expect(marks.view(anchor)).toMatchObject({ level, label: word });
  });

  it("puts no mark after a safe link or one with no verdict", () => {
    const { marks } = setup();
    const [safe, none] = [link(SAFE), link("mailto:a@example.org")];
    message(safe, none);
    marks.apply(safe, verdictOf(SAFE));
    marks.apply(none, null);
    expect(marksIn()).toHaveLength(0);
    expect(marks.count).toBe(0);
  });

  it("keeps one mark when the same link is marked again", () => {
    const { marks } = setup();
    const anchor = link(DANGER);
    message(anchor);
    for (let times = 0; times < 3; times++) marks.apply(anchor, verdictOf(DANGER));
    expect(marksIn()).toHaveLength(1);
  });

  it("hides its content from the page and cannot be selected or edited", () => {
    const { marks } = setup();
    const anchor = link(DANGER);
    const box = message(anchor);
    marks.apply(anchor, verdictOf(DANGER));
    const host = marksIn()[0] as HTMLElement;
    expect(host.shadowRoot).toBeNull();
    expect(host.textContent).toBe("");
    expect(host.childNodes).toHaveLength(0);
    expect(host.getAttribute("contenteditable")).toBe("false");
    expect(box.textContent).toBe("Hola, entra aquí: Entrar y avisa.");
    expect(marks.view(anchor)?.root.querySelector("style")?.textContent).toContain(
      "user-select: none",
    );
  });

  it("leaves the link's address, text, and children as they were", () => {
    const { marks } = setup();
    const anchor = link(DANGER, "Entrar a mi banco");
    message(anchor);
    const before = { href: anchor.getAttribute("href"), html: anchor.innerHTML };
    marks.apply(anchor, verdictOf(DANGER));
    expect({ href: anchor.getAttribute("href"), html: anchor.innerHTML }).toEqual(before);
    expect(anchor.contains(marksIn()[0] as Node)).toBe(false);
  });

  it("tells a screen reader the level and the reason, on the mark and on the link", () => {
    const { marks } = setup();
    const anchor = link(DANGER);
    message(anchor);
    const verdict = verdictOf(DANGER);
    marks.apply(anchor, verdict);
    const sentence = `Peligro: ${verdict?.reason}`;
    const host = marksIn()[0] as HTMLElement;
    expect(host.getAttribute("role")).toBe("note");
    expect(host.getAttribute("aria-label")).toBe(sentence);
    expect(anchor.getAttribute("aria-description")).toBe(sentence);
    expect(host.hasAttribute("tabindex")).toBe(false);
  });

  it("restores the link's own description when the mark goes", () => {
    const { marks } = setup();
    const [plain, described] = [link(DANGER), link(DANGER)];
    described.setAttribute("aria-description", "Texto del remitente");
    message(plain, described);
    marks.apply(plain, verdictOf(DANGER));
    marks.apply(described, verdictOf(DANGER));
    marks.apply(plain, null);
    marks.apply(described, verdictOf(SAFE));
    expect(plain.hasAttribute("aria-description")).toBe(false);
    expect(described.getAttribute("aria-description")).toBe("Texto del remitente");
    expect(marksIn()).toHaveLength(0);
  });

  it("shows markup in a reason as text and creates nothing from it", () => {
    const { marks } = setup();
    const anchor = link(DANGER);
    message(anchor);
    const hostile = '<img src=x onerror="window.pwned=1"><script>window.pwned=1</script>';
    marks.apply(anchor, {
      level: "danger",
      label: `<b>${hostile}</b>`,
      reason: hostile,
      host: "example.org",
    });
    const view = marks.view(anchor);
    expect(view?.root.querySelector("img, script, b")).toBeNull();
    expect(view?.root.querySelector(".pill")?.textContent).toBe(`<b>${hostile}</b>`);
    expect(view?.host.getAttribute("aria-label")).toContain("<img");
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
  });

  it("changes the mark when the verdict changes and removes it when the link becomes safe", () => {
    const { marks } = setup();
    const anchor = link(DANGER);
    message(anchor);
    marks.apply(anchor, verdictOf(DANGER));
    const host = marksIn()[0];
    marks.apply(anchor, verdictOf(SHORT));
    expect(marksIn()).toEqual([host]);
    expect(marks.view(anchor)).toMatchObject({
      level: "hidden-destination",
      label: "Destino oculto",
    });
    expect(marks.view(anchor)?.root.querySelectorAll("svg")).toHaveLength(1);
    marks.apply(anchor, verdictOf(SAFE));
    expect(marksIn()).toHaveLength(0);
  });

  it("sweeps away the mark of a link that left the page", () => {
    const { marks } = setup();
    const [gone, kept] = [link(DANGER), link(SHORT)];
    const box = message(gone);
    message(kept);
    marks.apply(gone, verdictOf(DANGER));
    marks.apply(kept, verdictOf(SHORT));
    gone.remove();
    expect(marksIn(box)).toHaveLength(1);
    marks.sweep();
    expect(marksIn()).toHaveLength(1);
    expect(marks.count).toBe(1);
    expect(kept.nextSibling).toBe(marksIn()[0]);
  });

  it("puts a mark back when it was moved or removed, and clears strays", () => {
    const { marks } = setup();
    const anchor = link(DANGER);
    const box = message(anchor);
    marks.apply(anchor, verdictOf(DANGER));
    const host = marksIn()[0] as HTMLElement;
    host.remove();
    box.append(document.createElement(MARK_TAG));
    marks.sweep();
    expect(marksIn()).toEqual([host]);
    expect(anchor.nextSibling).toBe(host);
  });
});

describe("tooltip", () => {
  const content = { level: "danger" as const, label: "Peligro", reason: "Imita a bcp.com.bo." };

  it("is one element for the whole page, drawn outside the message", () => {
    const tooltip = createTooltip(document);
    const [first, second] = [link(DANGER), link(SHORT)];
    message(first, second);
    expect(document.querySelector(TOOLTIP_TAG)).toBeNull();
    tooltip.show(first, content);
    tooltip.show(second, { ...content, reason: "Otro motivo." });
    const hosts = document.querySelectorAll(TOOLTIP_TAG);
    expect(hosts).toHaveLength(1);
    expect(hosts[0]?.parentElement).toBe(document.documentElement);
    expect(hosts[0]?.getAttribute("popover")).toBe("manual");
    expect((hosts[0] as HTMLElement).shadowRoot).toBeNull();
    expect(tooltip.content?.reason).toBe("Otro motivo.");
    tooltip.hide();
  });

  it("goes away on Escape and consumes the key only while it shows", () => {
    const tooltip = createTooltip(document);
    const anchor = link(DANGER);
    message(anchor);
    const reached: string[] = [];
    const listen = (event: KeyboardEvent) => reached.push(event.key);
    document.addEventListener("keydown", listen);
    const escape = () =>
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );

    tooltip.show(anchor, content);
    escape();
    expect(tooltip.visible).toBe(false);
    expect(reached).toEqual([]);

    escape();
    expect(reached).toEqual(["Escape"]);
    document.removeEventListener("keydown", listen);
  });

  it("lets other keys through while it shows", () => {
    const tooltip = createTooltip(document);
    const anchor = link(DANGER);
    message(anchor);
    const reached: string[] = [];
    const listen = (event: KeyboardEvent) => reached.push(event.key);
    document.addEventListener("keydown", listen);
    tooltip.show(anchor, content);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    expect(reached).toEqual(["j"]);
    expect(tooltip.visible).toBe(true);
    tooltip.hide();
    document.removeEventListener("keydown", listen);
  });

  it("goes away when the page scrolls", () => {
    const tooltip = createTooltip(document);
    const anchor = link(DANGER);
    message(anchor);
    tooltip.show(anchor, content);
    document.body.dispatchEvent(new Event("scroll"));
    expect(tooltip.visible).toBe(false);
  });
});
