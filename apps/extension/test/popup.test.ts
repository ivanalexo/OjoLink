// @vitest-environment jsdom
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { USER_DOMAIN_LIMIT } from "@ojolink/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DIALOG_TAG } from "../src/dialog.ts";
import { INDICATOR_TAG, type PageCounts } from "../src/indicator.ts";
import { MARK_TAG } from "../src/marks.ts";
import { startPage, type Page } from "../src/page.ts";
import { describeStatus, mountPopup, type PopupApi } from "../src/popup.ts";
import { donateAddress, parseDonate } from "../src/resolver-config.ts";
import type { Deadline } from "../src/scanner.ts";
import { readSettings, type Settings } from "../src/settings.ts";
import { DEFAULT_PATTERNS, DEFAULT_SITES, toPattern } from "../src/sites.ts";
import {
  createPageStatus,
  createStatusResponder,
  readCounts,
  STATUS_MESSAGE,
  type PanelStatus,
} from "../src/status.ts";
import { strings } from "../src/strings.ts";
import { TOOLTIP_TAG } from "../src/tooltip.ts";
import { addUserDomain, readUserDomains, removeUserDomain } from "../src/user-domains.ts";

const NONE = { danger: 0, caution: 0, "hidden-destination": 0 };
const root = process.cwd();

describe("the person's domains", () => {
  it.each([
    ["nothing stored", undefined],
    ["a value that is not a list", { 0: "miempresa.com.bo" }],
    ["text", "miempresa.com.bo"],
    ["a number", 7],
    ["null", null],
  ])("reads %s as an empty list", (_name, stored) => {
    expect(readUserDomains(stored)).toEqual([]);
  });

  it("keeps only text entries the engine accepts, reduced to their domain", () => {
    expect(
      readUserDomains([
        "https://www.MiEmpresa.com.bo/login",
        7,
        null,
        { domain: "x.com" },
        "no es un dominio",
        "juan@correo.com.bo",
        "miempresa.com.bo",
        "micooperativa.bo",
        "bcp.com.bo",
      ]),
    ).toEqual(["miempresa.com.bo", "micooperativa.bo"]);
  });

  it("uses at most 100", () => {
    const many = Array.from({ length: 150 }, (_, index) => `empresa-numero-${index}.com.bo`);
    expect(readUserDomains(many)).toHaveLength(USER_DOMAIN_LIMIT);
  });

  it("adds a pasted address as its domain", () => {
    expect(addUserDomain(["micooperativa.bo"], "https://www.MiEmpresa.com.bo/login")).toEqual({
      ok: true,
      domain: "miempresa.com.bo",
      domains: ["micooperativa.bo", "miempresa.com.bo"],
    });
  });

  it.each([
    ["empty", "   "],
    ["not-a-domain", "mi banco"],
    ["email-address", "juan@miempresa.com.bo"],
    ["ip-address", "192.168.1.10"],
    ["public-suffix", "com.bo"],
    ["already-protected", "bcp.com.bo"],
    ["repeated", "www.miempresa.com.bo"],
  ])("rejects an entry as %s", (reason, entry) => {
    expect(addUserDomain(["miempresa.com.bo"], entry)).toEqual({ ok: false, reason });
  });

  it("rejects an entry past the limit", () => {
    const full = Array.from({ length: USER_DOMAIN_LIMIT }, (_, i) => `empresa-numero-${i}.com.bo`);
    expect(addUserDomain(full, "una-mas.com.bo")).toEqual({ ok: false, reason: "limit-reached" });
  });

  it("removes a domain and leaves the rest", () => {
    expect(removeUserDomain(["miempresa.com.bo", "micooperativa.bo"], "miempresa.com.bo")).toEqual([
      "micooperativa.bo",
    ]);
    expect(removeUserDomain(["miempresa.com.bo"], "otro.bo")).toEqual(["miempresa.com.bo"]);
  });

  it("has a sentence of its own for every reason", () => {
    const sentences = Object.values(strings.domainRejections);
    expect(sentences).toHaveLength(8);
    expect(new Set(sentences).size).toBe(8);
    for (const sentence of sentences) expect(sentence.length).toBeGreaterThan(15);
  });
});

describe("status of a page", () => {
  const counts: PageCounts = { checked: 12, marked: { ...NONE, danger: 1, caution: 2 } };

  it("reads counts of the right shape and nothing else", () => {
    expect(readCounts(counts)).toEqual(counts);
    for (const bad of [
      null,
      "12",
      {},
      { checked: 12 },
      { checked: -1, marked: NONE },
      { checked: 1.5, marked: NONE },
      { checked: 3, marked: { danger: 1 } },
      { checked: 3, marked: { ...NONE, danger: "1" } },
    ]) {
      expect(readCounts(bad)).toBeNull();
    }
  });

  it("answers only the status message, only from this extension", () => {
    const respond = createStatusResponder("own", () => counts);
    expect(respond({ type: STATUS_MESSAGE }, "own")).toEqual(counts);
    expect(respond({ type: STATUS_MESSAGE }, "other")).toBeNull();
    expect(respond({ type: STATUS_MESSAGE }, undefined)).toBeNull();
    expect(respond({ type: "ojolink:reveal" }, "own")).toBeNull();
    expect(respond(null, "own")).toBeNull();
  });

  it("gives the counts when the page script answers", async () => {
    const send = vi.fn(async () => counts);
    const status = createPageStatus({
      active: async () => ({ id: 7, url: "https://mail.google.com/mail/u/0/" }),
      send,
    });
    expect(await status()).toEqual({ kind: "checked", counts });
    expect(send).toHaveBeenCalledWith(7, { type: STATUS_MESSAGE });
  });

  it.each([
    ["nobody answers", () => Promise.reject(new Error("Receiving end does not exist"))],
    ["the answer is malformed", async () => ({ checked: "many" })],
    ["there is no answer", async () => undefined],
  ])("asks to reload when %s on a site the extension has access to", async (_name, send) => {
    const status = createPageStatus({
      active: async () => ({ id: 7, url: "https://mail.google.com/mail/u/0/" }),
      send,
    });
    expect(await status()).toEqual({ kind: "reload" });
  });

  it.each([
    ["a site with no access", { id: 7 }],
    ["a browser page", { id: 7, url: "chrome://extensions/" }],
    ["a tab with no id", { url: "https://mail.google.com/" }],
    ["no active tab", undefined],
  ])("says it does not work here for %s", async (_name, tab) => {
    const status = createPageStatus({
      active: async () => tab,
      send: () => Promise.reject(new Error("no receiver")),
    });
    expect(await status()).toEqual({ kind: "not-here" });
  });

  it("says it does not work here when the tab cannot be found at all", async () => {
    const status = createPageStatus({
      active: () => Promise.reject(new Error("no window")),
      send: async () => counts,
    });
    expect(await status()).toEqual({ kind: "not-here" });
  });

  it("neither keeps nor passes on the tab's address", async () => {
    const sent: unknown[] = [];
    const status = createPageStatus({
      active: async () => ({ id: 7, url: "https://mail.google.com/mail/u/0/#inbox/secreto" }),
      send: async (...args) => {
        sent.push(args);
        return counts;
      },
    });
    const answer = await status();
    expect(JSON.stringify([answer, sent])).not.toContain("secreto");
    expect(JSON.stringify([answer, sent])).not.toContain("mail.google.com");
  });

  it("puts the same words in the panel as in the page indicator", () => {
    expect(describeStatus({ kind: "checked", counts })).toEqual({
      tone: "danger",
      text: "OjoLink · 12 enlaces revisados, 3 con avisos",
    });
    expect(describeStatus({ kind: "checked", counts: { checked: 5, marked: NONE } })).toEqual({
      tone: "clear",
      text: "OjoLink · 5 enlaces revisados, sin señales de alerta",
    });
    expect(describeStatus({ kind: "checked", counts: { checked: 0, marked: NONE } }).text).toBe(
      strings.popupNoLinks,
    );
    expect(describeStatus({ kind: "reload" }).text).toBe(strings.popupReload);
    expect(describeStatus({ kind: "not-here" }).text).toBe(strings.popupNotHere);
  });
});

function fakeApi(options: { status?: PanelStatus; stored?: unknown; fail?: boolean } = {}) {
  const state = {
    stored: options.stored as unknown,
    granted: [...DEFAULT_PATTERNS] as string[],
    saves: [] as (readonly string[])[],
    optionsOpened: 0,
  };
  const api: PopupApi = {
    pageStatus: async () =>
      options.status ?? { kind: "checked", counts: { checked: 4, marked: NONE } },
    userDomains: async () => state.stored,
    saveUserDomains: async (domains) => {
      if (options.fail) throw new Error("no storage");
      state.stored = [...domains];
      state.saves.push(domains);
    },
    grantedOrigins: async () => state.granted,
    openOptions: async () => {
      state.optionsOpened += 1;
    },
  };
  return { state, api };
}

const PLAIN: Settings = { resolver: null, privacyPolicy: null, donate: null };
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
const field = () => document.querySelector<HTMLInputElement>("#domain") as HTMLInputElement;
const said = () => document.querySelector(".message")?.textContent ?? "";
const listed = () =>
  [...document.querySelectorAll(".domains code")].map((code) => code.textContent);
const pageLine = () => document.querySelector<HTMLElement>(".page");

async function mount(api: PopupApi, settings: Settings = PLAIN) {
  document.body.innerHTML = '<main id="app"></main>';
  await mountPopup(document.getElementById("app") as HTMLElement, api, settings).refresh();
}

async function add(value: string) {
  field().value = value;
  document.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true }));
  await settled();
}

describe("the panel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("has its parts in order, in Spanish, with headings", async () => {
    await mount(fakeApi().api);
    expect(document.querySelector("h1")?.textContent).toBe("OjoLink");
    expect([...document.querySelectorAll("h2")].map((h) => h.textContent)).toEqual([
      strings.popupStateHeading,
      strings.domainsHeading,
      strings.popupSitesHeading,
    ]);
    for (const section of document.querySelectorAll("section[aria-labelledby]")) {
      expect(document.getElementById(section.getAttribute("aria-labelledby") ?? "")).not.toBeNull();
    }
  });

  it.each([
    [
      "a page with warnings",
      { kind: "checked", counts: { checked: 12, marked: { ...NONE, danger: 1, caution: 2 } } },
      "danger",
      "OjoLink · 12 enlaces revisados, 3 con avisos",
    ],
    [
      "a page with nothing suspicious",
      { kind: "checked", counts: { checked: 12, marked: NONE } },
      "clear",
      "OjoLink · 12 enlaces revisados, sin señales de alerta",
    ],
    [
      "a page with no links",
      { kind: "checked", counts: { checked: 0, marked: NONE } },
      "note",
      strings.popupNoLinks,
    ],
    ["a page that needs a reload", { kind: "reload" }, "note", strings.popupReload],
    ["a site where it does not work", { kind: "not-here" }, "note", strings.popupNotHere],
  ] as const)(
    "shows the status of %s with an icon and words",
    async (_name, status, tone, text) => {
      await mount(fakeApi({ status }).api);
      expect(pageLine()?.dataset.tone).toBe(tone);
      expect(pageLine()?.textContent).toBe(text);
      expect(pageLine()?.querySelector("svg")).not.toBeNull();
      expect(document.body.textContent).not.toMatch(/es segur|página segura|confiable|verificad/i);
    },
  );

  it("offers the way to add a site only where it does not work", async () => {
    const button = () =>
      [...document.querySelectorAll("button")].find((b) => b.textContent === strings.popupAddSite);
    const there = fakeApi({ status: { kind: "not-here" } });
    await mount(there.api);
    expect(button()?.hidden).toBe(false);
    button()?.click();
    await settled();
    expect(there.state.optionsOpened).toBe(1);

    await mount(fakeApi().api);
    expect(button()?.hidden).toBe(true);
    await mount(fakeApi({ status: { kind: "reload" } }).api);
    expect(button()?.hidden).toBe(true);
  });

  it("falls back to 'not here' when the status cannot be asked", async () => {
    const { api } = fakeApi();
    await mount({ ...api, pageStatus: () => Promise.reject(new Error("no tabs")) });
    expect(pageLine()?.textContent).toBe(strings.popupNotHere);
  });

  it("says the list is empty and what adding a domain does", async () => {
    await mount(fakeApi().api);
    expect(listed()).toEqual([]);
    expect(document.body.textContent).toContain(strings.domainsEmpty);
    expect(document.body.textContent).toContain(strings.domainsIntro);
    expect(field().labels?.[0]?.textContent).toBe(strings.domainLabel);
    const hint = document.getElementById(field().getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toMatch(/solo en este equipo/);
    expect(document.activeElement).toBe(field());
  });

  it("reads the stored list on open, validating it", async () => {
    await mount(fakeApi({ stored: ["miempresa.com.bo", 7, "mi banco", "MICOOPERATIVA.BO"] }).api);
    expect(listed()).toEqual(["miempresa.com.bo", "micooperativa.bo"]);
    expect(document.querySelector<HTMLElement>(".domains + form, .muted[hidden]")).not.toBeNull();
  });

  it("adds a pasted address as its domain, saves it, clears the field, and says so", async () => {
    const { state, api } = fakeApi();
    await mount(api);
    await add("https://www.MiEmpresa.com.bo/login");
    expect(listed()).toEqual(["miempresa.com.bo"]);
    expect(state.saves).toEqual([["miempresa.com.bo"]]);
    expect(field().value).toBe("");
    expect(said()).toBe("OjoLink ahora protege miempresa.com.bo.");
    expect(document.querySelector(".message")?.getAttribute("aria-live")).toBe("polite");
  });

  it.each([
    ["", strings.domainRejections.empty],
    ["mi banco", strings.domainRejections["not-a-domain"]],
    ["juan@miempresa.com.bo", strings.domainRejections["email-address"]],
    ["192.168.1.10", strings.domainRejections["ip-address"]],
    ["com.bo", strings.domainRejections["public-suffix"]],
    ["bcp.com.bo", strings.domainRejections["already-protected"]],
    ["www.miempresa.com.bo", strings.domainRejections.repeated],
  ])("explains why %j is not added, and keeps what was typed", async (entry, sentence) => {
    const { state, api } = fakeApi({ stored: ["miempresa.com.bo"] });
    await mount(api);
    await add(entry);
    expect(said()).toBe(sentence);
    expect(listed()).toEqual(["miempresa.com.bo"]);
    expect(state.saves).toEqual([]);
    expect(field().value).toBe(entry);
  });

  it("says the limit was reached at 100 domains", async () => {
    const full = Array.from({ length: USER_DOMAIN_LIMIT }, (_, i) => `empresa-numero-${i}.com.bo`);
    const { state, api } = fakeApi({ stored: full });
    await mount(api);
    await add("una-mas.com.bo");
    expect(said()).toBe(strings.domainRejections["limit-reached"]);
    expect(state.saves).toEqual([]);
  });

  it("removes a domain with a button named after it", async () => {
    const { state, api } = fakeApi({ stored: ["miempresa.com.bo", "micooperativa.bo"] });
    await mount(api);
    const remove = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Quitar miempresa.com.bo"]',
    );
    expect(remove?.textContent).toBe(strings.removeButton);
    remove?.click();
    await settled();
    expect(listed()).toEqual(["micooperativa.bo"]);
    expect(state.saves).toEqual([["micooperativa.bo"]]);
    expect(said()).toBe("OjoLink dejó de proteger miempresa.com.bo.");
  });

  it("changes nothing on screen when saving fails", async () => {
    await mount(fakeApi({ stored: ["miempresa.com.bo"], fail: true }).api);
    await add("micooperativa.bo");
    expect(listed()).toEqual(["miempresa.com.bo"]);
    expect(said()).toBe(strings.failed);
    expect(field().value).toBe("micooperativa.bo");
  });

  it("lists the default sites and the added ones, and opens the options page", async () => {
    const { state, api } = fakeApi();
    state.granted.push(toPattern("mail.proton.me"), "https://*/*");
    await mount(api);
    expect([...document.querySelectorAll(".sites code")].map((c) => c.textContent)).toEqual([
      ...DEFAULT_SITES,
      "mail.proton.me",
    ]);
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent === strings.popupManageSites)
      ?.click();
    await settled();
    expect(state.optionsOpened).toBe(1);
  });

  it("can be used with the keyboard: every control is a field, a button or a link", async () => {
    await mount(fakeApi({ stored: ["miempresa.com.bo"] }).api, {
      ...PLAIN,
      donate: "https://donar.example/ojolink",
    });
    const controls = [...document.querySelectorAll("input, button:not([hidden]), a")];
    expect(controls.map((control) => control.nodeName)).toEqual([
      "BUTTON",
      "INPUT",
      "BUTTON",
      "BUTTON",
      "A",
    ]);
    expect(document.querySelectorAll("[tabindex], [onclick]")).toHaveLength(0);
    for (const control of controls) {
      const name = control.getAttribute("aria-label") ?? control.textContent ?? "";
      const labelled =
        control.nodeName === "INPUT" ? (control as HTMLInputElement).labels?.length : 1;
      expect(name.length > 0 || labelled).toBeTruthy();
    }
  });
});

describe("donation link", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is last in the panel, isolated, when the build has an address", async () => {
    await mount(fakeApi().api, { ...PLAIN, donate: "https://donar.example/ojolink" });
    const link = document.querySelector<HTMLAnchorElement>(".donate a");
    expect(link?.getAttribute("href")).toBe("https://donar.example/ojolink");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(document.querySelector(".donate")?.textContent).toContain(strings.donateText);
    const sections = [...document.querySelectorAll("section")];
    expect(sections.at(-1)?.classList.contains("donate")).toBe(true);
  });

  it("is absent, with no empty space, when the build has none", async () => {
    await mount(fakeApi().api);
    expect(document.querySelector(".donate")).toBeNull();
    expect(document.querySelectorAll("a")).toHaveLength(0);
  });

  it.each([
    ["an https address", "https://donar.example/ojolink", "https://donar.example/ojolink"],
    ["spaces around it", "  https://donar.example  ", "https://donar.example/"],
  ])("accepts %s", (_name, value, address) => {
    expect(donateAddress(value)).toBe(address);
    expect(readSettings({ WXT_DONATE_URL: value }).donate).toBe(address);
  });

  it.each([undefined, "", "  "])("means none for %j", (value) => {
    expect(donateAddress(value)).toBeNull();
    expect(readSettings({ WXT_DONATE_URL: value }).donate).toBeNull();
  });

  it.each([
    ["plain http", "http://donar.example"],
    ["localhost", "http://localhost:3000"],
    ["credentials", "https://user:secret@donar.example"],
    ["text that is not an address", "donar"],
    ["a script address", "javascript:alert(1)"],
  ])("fails the build on %s", (_name, value) => {
    expect(() => donateAddress(value)).toThrow(/WXT_DONATE_URL/);
    expect(parseDonate(value)).toBeNull();
  });
});

function sources(): string[] {
  const found: string[] = [];
  for (const folder of ["src", "entrypoints"]) {
    for (const entry of readdirSync(join(root, folder), { withFileTypes: true, recursive: true })) {
      if (entry.isFile()) found.push(join(entry.parentPath, entry.name));
    }
  }
  return found;
}

describe("what the sources may not do", () => {
  it("never names synced storage", () => {
    expect(sources().length).toBeGreaterThan(25);
    for (const file of sources()) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/storage\s*\.\s*sync|\bsync\b\s*:/);
    }
  });

  it("mentions donating only in the panel and its settings", () => {
    const allowed = new Set(
      [
        "strings.ts",
        "popup.ts",
        "settings.ts",
        "resolver-config.ts",
        "env.d.ts",
        "release-rules.ts",
      ].map((name) => join(root, "src", name)),
    );
    const mentioning = sources().filter((file) =>
      /donat|donar|donaci/i.test(readFileSync(file, "utf8")),
    );
    expect(mentioning.filter((file) => !allowed.has(file))).toEqual([]);
    expect(mentioning.length).toBeGreaterThan(0);
  });

  it("makes no request from the panel", () => {
    for (const name of ["popup.ts", "status.ts", "user-domains.ts"]) {
      expect(readFileSync(join(root, "src", name), "utf8")).not.toMatch(
        /\bfetch\s*\(|XMLHttpRequest/,
      );
    }
  });
});

describe("the panel's colors", () => {
  const css = readFileSync(join(root, "entrypoints", "popup", "style.css"), "utf8");
  const dark = css.slice(css.indexOf("prefers-color-scheme: dark"), css.indexOf("body {"));
  const light = css.slice(0, css.indexOf("@media"));
  const read = (block: string) =>
    Object.fromEntries(
      [...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]),
    );
  const luminance = (hex: string) => {
    const [r = 0, g = 0, b = 0] = [1, 3, 5].map((at) => {
      const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a = "", b = "") => {
    const [high = 0, low = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  };

  it.each([
    ["light", light],
    ["dark", dark],
  ])("meet AA contrast in the %s theme", (_theme, block) => {
    const color = read(block);
    expect(Object.keys(color)).toHaveLength(13);
    const pairs: [string, string][] = [
      ["ink", "bg"],
      ["ink", "surface"],
      ["muted", "bg"],
      ["accent", "bg"],
      ["accent", "surface"],
      ["button-ink", "button-bg"],
      ...["clear", "danger", "caution", "hidden-destination", "note"].map(
        (tone): [string, string] => [`tone-${tone}`, "surface"],
      ),
    ];
    for (const [text, fill] of pairs) {
      expect(contrast(color[text], color[fill]), `${text} on ${fill}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("is a file of the package, with no outside address", () => {
    expect(existsSync(join(root, "entrypoints", "popup", "index.html"))).toBe(true);
    expect(css).not.toMatch(/https?:|url\(/);
  });
});

describe("the page follows the person's domains", () => {
  const IMITATION = "https://miempresa.com.bo.acceso-seguro.net/";
  const DANGER = "https://bcp.com.bo.verifica.net/";
  const SHORT = "https://bit.ly/3xYz";
  let page: Page | null = null;
  let scan: { schedule: (batch: (deadline?: Deadline) => void) => void; drain(): void };
  let give: (domains: readonly string[]) => void = () => undefined;
  let shadow: ShadowRoot | null = null;
  let reached = 0;
  const guard = (event: Event): void => {
    reached += 1;
    event.preventDefault();
  };

  function link(href: string, text = "Entrar"): HTMLAnchorElement {
    const anchor = document.createElement("a");
    anchor.setAttribute("href", href);
    anchor.textContent = text;
    const line = document.createElement("p");
    line.append(anchor);
    document.body.append(line);
    return anchor;
  }

  function clicked(anchor: Element): "stopped" | "passed" {
    reached = 0;
    anchor.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, composed: true }),
    );
    return reached === 0 ? "stopped" : "passed";
  }

  function start(extra: Parameters<typeof startPage>[1] = {}) {
    const pending: ((deadline?: Deadline) => void)[] = [];
    scan = {
      schedule: (batch) => void pending.push(batch),
      drain() {
        for (let count = 0; count < 10_000; count++) {
          const batch = pending.shift();
          if (!batch) return;
          batch();
        }
      },
    };
    const started = startPage(document, {
      schedule: scan.schedule,
      userDomains: (onChange) => {
        give = onChange;
      },
      dialog: { expose: (root) => (shadow = root) },
      ...extra,
    });
    page = started;
    scan.drain();
    return started;
  }

  const proto = HTMLDialogElement.prototype as unknown as {
    showModal?: () => void;
    close?: () => void;
  };

  beforeEach(() => {
    document.body.innerHTML = "";
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    proto.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
    window.addEventListener("click", guard);
  });

  afterEach(() => {
    page?.stop();
    page = null;
    window.removeEventListener("click", guard);
    for (const own of document.querySelectorAll(
      `${TOOLTIP_TAG}, ${INDICATOR_TAG}, ${DIALOG_TAG}, ${MARK_TAG}`,
    )) {
      own.remove();
    }
    document.body.innerHTML = "";
  });

  it("marks an imitation of a domain the person protects, and stops its click", () => {
    const anchor = link(IMITATION);
    const started = start();
    expect(started.marks.view(anchor)).toBeNull();
    give(["miempresa.com.bo"]);
    scan.drain();
    expect(started.marks.view(anchor)).toMatchObject({ level: "danger", label: "Peligro" });
    expect(clicked(anchor)).toBe("stopped");
    expect(started.dialog.view?.tone).toBe("danger");
  });

  it("marks a link whose text shows the person's domain and leads elsewhere", () => {
    const anchor = link("https://pagos-seguros.net/", "miempresa.com.bo/pagos");
    const started = start();
    expect(started.marks.view(anchor)?.level).toBe("caution");
    give(["miempresa.com.bo"]);
    scan.drain();
    expect(started.marks.view(anchor)?.level).toBe("danger");
  });

  it("leaves the person's own site alone", () => {
    const anchor = link("https://www.miempresa.com.bo/portal");
    const started = start();
    give(["miempresa.com.bo"]);
    scan.drain();
    expect(started.marks.view(anchor)).toBeNull();
    expect(clicked(anchor)).toBe("passed");
  });

  it("follows the list as it changes, and the indicator and the status follow", () => {
    const anchor = link(IMITATION);
    link("https://www.lostiempos.com/");
    const started = start();
    expect(started.indicator.view?.text).toBe(
      "OjoLink · 2 enlaces revisados, sin señales de alerta",
    );
    expect(started.status()).toEqual({ checked: 2, marked: NONE });

    give(["miempresa.com.bo"]);
    scan.drain();
    expect(started.indicator.view?.text).toBe("OjoLink · 2 enlaces revisados, 1 con aviso");
    expect(started.status()).toEqual({ checked: 2, marked: { ...NONE, danger: 1 } });

    give([]);
    scan.drain();
    expect(started.marks.view(anchor)).toBeNull();
    expect(started.indicator.view?.text).toBe(
      "OjoLink · 2 enlaces revisados, sin señales de alerta",
    );
  });

  it("does not scan again when the same list arrives", () => {
    link(IMITATION);
    const processed: number[] = [];
    start({ onBatch: (_ms, links) => void processed.push(links) });
    const before = processed.length;
    give([]);
    scan.drain();
    expect(processed.length).toBe(before);
    give(["miempresa.com.bo"]);
    scan.drain();
    const after = processed.length;
    expect(after).toBeGreaterThan(before);
    give(["miempresa.com.bo"]);
    scan.drain();
    expect(processed.length).toBe(after);
  });

  it("stops a dangerous link before any list arrived", () => {
    const anchor = link(DANGER);
    start();
    expect(clicked(anchor)).toBe("stopped");
  });

  it("uses a new list in the click decision before the rescan has run", () => {
    const anchor = link(IMITATION);
    const started = start();
    give(["miempresa.com.bo"]);
    expect(started.marks.view(anchor)).toBeNull();
    expect(clicked(anchor)).toBe("stopped");
  });

  it("keeps a revealed destination across a rescan", async () => {
    const anchor = link(SHORT);
    const reveal = vi.fn(async () => ({ kind: "revealed" as const, destination: DANGER }));
    const started = start({ reveal });
    const mark = started.marks.view(anchor)?.host as HTMLElement;
    mark.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    const revealButton = [...document.querySelectorAll(DIALOG_TAG)].length;
    expect(revealButton).toBe(1);
    await started.dialog.view;
    shadow?.querySelector<HTMLButtonElement>('button[data-action="reveal"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    started.dialog.close();
    expect(started.marks.view(anchor)?.level).toBe("danger");

    give(["miempresa.com.bo"]);
    scan.drain();
    expect(started.marks.view(anchor)?.level).toBe("danger");
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it("reports the same numbers as the indicator on a mixed page and on an empty one", () => {
    link(DANGER);
    link(SHORT);
    link("https://www.lostiempos.com/");
    const started = start();
    expect(started.status()).toEqual({
      checked: 3,
      marked: { danger: 1, caution: 0, "hidden-destination": 1 },
    });
    expect(describeStatus({ kind: "checked", counts: started.status() }).text).toBe(
      started.indicator.view?.text,
    );
    started.stop();
    document.body.innerHTML = "<p>Sin enlaces</p>";
    const empty = start();
    expect(empty.status()).toEqual({ checked: 0, marked: NONE });
    expect(empty.indicator.view).toBeNull();
  });

  it("ignores a list that arrives after stop()", () => {
    const anchor = link(IMITATION);
    const started = start();
    started.stop();
    give(["miempresa.com.bo"]);
    scan.drain();
    expect(document.querySelector(MARK_TAG)).toBeNull();
    void anchor;
  });
});
