// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { STATUS_MESSAGE } from "../src/status.ts";
import { USER_DOMAINS_KEY } from "../src/user-domains.ts";

type MessageListener = (
  message: unknown,
  sender: { id?: string },
  send: (answer: unknown) => void,
) => boolean;
type StorageListener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;

const OWN_ID = "abcdefghijklmnop";
const state = vi.hoisted(() => ({
  local: {} as Record<string, unknown>,
  messages: [] as unknown[],
  storage: [] as unknown[],
}));

vi.mock("wxt/browser", () => ({
  browser: {
    runtime: {
      id: "abcdefghijklmnop",
      onMessage: { addListener: (listener: unknown) => void state.messages.push(listener) },
    },
    storage: {
      local: { get: async (key: string) => ({ [key]: state.local[key] }) },
      onChanged: { addListener: (listener: unknown) => void state.storage.push(listener) },
    },
  },
}));

const settled = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits for the scan to get there, however slow the machine is, then lets it settle. */
async function until(check: () => boolean): Promise<void> {
  for (let waited = 0; waited < 5000 && !check(); waited += 20) await settled(20);
  await settled(40);
}
const indicator = () => document.querySelector("ojolink-status")?.getAttribute("aria-label") ?? "";
const marked = () =>
  [...document.querySelectorAll("ojolink-mark")].map(
    (mark) => mark.previousElementSibling?.textContent,
  );

async function run() {
  const { default: script } = await import("../entrypoints/content.ts");
  const invalidated: (() => void)[] = [];
  await script.main({ onInvalidated: (stop: () => void) => invalidated.push(stop) } as never);
  await settled();
  return {
    invalidate: () => invalidated.forEach((stop) => stop()),
    invalidated,
    ask: (message: unknown, sender = OWN_ID) => {
      const answers: unknown[] = [];
      for (const listener of state.messages as MessageListener[]) {
        listener(message, { id: sender }, (answer) => void answers.push(answer));
      }
      return answers;
    },
    change: (value: unknown, area = "local") => {
      for (const listener of state.storage as StorageListener[]) {
        listener({ [USER_DOMAINS_KEY]: { newValue: value } }, area);
      }
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  for (const own of document.querySelectorAll("ojolink-mark, ojolink-status, ojolink-warning")) {
    own.remove();
  }
  state.local = {};
  state.messages.length = 0;
  state.storage.length = 0;
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("page script", () => {
  it("marks a dangerous link, leaves a safe one alone, and exposes nothing to the page", async () => {
    document.body.innerHTML =
      '<p><a href="https://bcp.com.bo.verifica.net/">Entrar</a> <a href="https://www.lostiempos.com/">Noticias</a></p>';
    const globals = new Set(Object.keys(window));
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const page = await run();
    await until(() => indicator().includes("2 enlaces"));

    expect(marked()).toEqual(["Entrar"]);
    expect(Object.keys(window).filter((key) => !globals.has(key))).toEqual([]);
    expect(debug).not.toHaveBeenCalled();

    expect(page.invalidated).toHaveLength(1);
    page.invalidate();
    expect(document.querySelectorAll("ojolink-mark, ojolink-status, ojolink-warning")).toHaveLength(
      0,
    );
  });

  it("judges links with the person's stored domains, validated on the way in", async () => {
    state.local[USER_DOMAINS_KEY] = ["https://www.MiEmpresa.com.bo/login", 7, "no es un dominio"];
    document.body.innerHTML =
      '<p><a href="https://miempresa.com.bo.acceso-seguro.net/">Portal</a> <a href="https://miempresa.com.bo/">Mi empresa</a></p>';
    const page = await run();
    await until(() => marked().length === 1 && indicator().includes("2 enlaces"));
    expect(marked()).toEqual(["Portal"]);
    page.invalidate();
  });

  it("follows a change to the list without a reload, and only from local storage", async () => {
    document.body.innerHTML =
      '<p><a href="https://miempresa.com.bo.acceso-seguro.net/">Portal</a></p>';
    const page = await run();
    await until(() => indicator().includes("1 enlace"));
    expect(marked()).toEqual([]);

    page.change(["miempresa.com.bo"], "sync");
    await settled(200);
    expect(marked()).toEqual([]);

    page.change(["miempresa.com.bo"]);
    await until(() => marked().length === 1);
    expect(marked()).toEqual(["Portal"]);

    page.change(undefined);
    await until(() => marked().length === 0);
    expect(marked()).toEqual([]);
    page.invalidate();
  });

  it("answers the panel's question with what the indicator shows", async () => {
    document.body.innerHTML =
      '<p><a href="https://bcp.com.bo.verifica.net/">Entrar</a> <a href="https://www.lostiempos.com/">Noticias</a> <a href="https://bit.ly/3xYz">Corto</a></p>';
    const page = await run();
    await until(() => indicator().includes("3 enlaces"));
    expect(page.ask({ type: STATUS_MESSAGE })).toEqual([
      { checked: 3, marked: { danger: 1, caution: 0, "hidden-destination": 1 } },
    ]);
    expect(indicator()).toBe("OjoLink · 3 enlaces revisados, 2 con avisos");
    page.invalidate();
  });

  it("ignores other messages and other senders", async () => {
    document.body.innerHTML = '<p><a href="https://www.lostiempos.com/">Noticias</a></p>';
    const page = await run();
    expect(page.ask({ type: "something-else" })).toEqual([]);
    expect(page.ask("ojolink:status")).toEqual([]);
    expect(page.ask(null)).toEqual([]);
    expect(page.ask({ type: STATUS_MESSAGE }, "another-extension")).toEqual([]);
    page.invalidate();
  });
});
