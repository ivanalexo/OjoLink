// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountOptions, type OptionsApi } from "../src/options.ts";
import { DEFAULT_PATTERNS, DEFAULT_SITES, toPattern } from "../src/sites.ts";
import { strings } from "../src/strings.ts";

function fakeApi(answer: "grant" | "dismiss" | "fail" = "grant") {
  const state = { granted: [...DEFAULT_PATTERNS] as string[] };
  const requests: string[] = [];
  const api: OptionsApi = {
    grantedOrigins: async () => state.granted,
    request: async (pattern) => {
      requests.push(pattern);
      if (answer === "fail") throw new Error("no gesture");
      if (answer === "grant") state.granted.push(pattern);
      return answer === "grant";
    },
    remove: async (pattern) => {
      state.granted = state.granted.filter((item) => item !== pattern);
      return true;
    },
  };
  return { state, requests, api };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
const input = () => document.querySelector<HTMLInputElement>("#site") as HTMLInputElement;
const status = () => document.querySelector('[role="status"]')?.textContent ?? "";
const listed = () =>
  [...document.querySelectorAll(".sites")].map((list) =>
    [...list.querySelectorAll("code")].map((code) => code.textContent),
  );

async function submit(value: string) {
  input().value = value;
  document.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true }));
  await settled();
}

async function mount(api: OptionsApi) {
  document.body.innerHTML = '<main id="app"></main>';
  await mountOptions(document.getElementById("app") as HTMLElement, api).refresh();
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("options page", () => {
  it("lists the default sites and says when nothing was added", async () => {
    await mount(fakeApi().api);
    expect(document.querySelector("h1")?.textContent).toBe(strings.optionsTitle);
    expect(listed()).toEqual([[...DEFAULT_SITES], []]);
    expect(document.body.textContent).toContain(strings.grantedEmpty);
    expect(input().labels?.[0]?.textContent).toBe(strings.addLabel);
  });

  it("asks the browser for nothing until the person submits", async () => {
    const { requests, api } = fakeApi();
    await mount(api);
    input().value = "mail.proton.me";
    input().dispatchEvent(new Event("input"));
    await settled();
    expect(requests).toEqual([]);
  });

  it("requests one site from the person's action and lists it once granted", async () => {
    const { requests, api } = fakeApi();
    await mount(api);
    await submit("https://Mail.Proton.me/u/0/inbox");
    expect(requests).toEqual(["https://mail.proton.me/*"]);
    expect(listed()[1]).toEqual(["mail.proton.me"]);
    expect(status()).toBe(
      "OjoLink ya funciona en mail.proton.me. Recarga esa página para empezar.",
    );
    expect(input().value).toBe("");
  });

  it("makes the request in the same turn as the action", async () => {
    const { requests, api } = fakeApi();
    await mount(api);
    input().value = "mail.proton.me";
    document.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(requests).toEqual(["https://mail.proton.me/*"]);
  });

  it.each([
    ["", strings.rejections.empty],
    ["*.proton.me", strings.rejections.wildcard],
    ["http://mail.proton.me", strings.rejections["not-https"]],
    ["192.168.1.10", strings.rejections["ip-address"]],
    ["mail.google.com", strings.rejections["default-site"]],
  ])("rejects %j with a message and no request", async (value, message) => {
    const { requests, api } = fakeApi();
    await mount(api);
    await submit(value);
    expect(status()).toBe(message);
    expect(requests).toEqual([]);
  });

  it("changes nothing when the prompt is dismissed", async () => {
    const { state, api } = fakeApi("dismiss");
    await mount(api);
    await submit("mail.proton.me");
    expect(state.granted).toEqual([...DEFAULT_PATTERNS]);
    expect(listed()[1]).toEqual([]);
    expect(status()).toBe("No se agregó mail.proton.me: el permiso no se confirmó.");
    expect(input().value).toBe("mail.proton.me");
  });

  it("says so when the browser refuses the request", async () => {
    await mount(fakeApi("fail").api);
    await submit("mail.proton.me");
    expect(status()).toBe(strings.failed);
  });

  it("shows what the browser has granted, not a copy of its own", async () => {
    const { state, api } = fakeApi();
    state.granted.push(toPattern("b.example.org"), toPattern("a.example.org"), "https://*/*");
    await mount(api);
    expect(listed()[1]).toEqual(["a.example.org", "b.example.org"]);
  });

  it("removes a site with a labeled button", async () => {
    const { state, api } = fakeApi();
    state.granted.push(toPattern("mail.proton.me"));
    await mount(api);
    const remove = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Quitar mail.proton.me"]',
    );
    remove?.click();
    await settled();
    expect(state.granted).toEqual([...DEFAULT_PATTERNS]);
    expect(listed()[1]).toEqual([]);
    expect(status()).toBe("OjoLink dejó de funcionar en mail.proton.me.");
  });

  it("offers no way to remove a default site", async () => {
    await mount(fakeApi().api);
    expect(document.querySelectorAll(".sites")[0]?.querySelectorAll("button")).toHaveLength(0);
  });
});

describe("page script", () => {
  it("marks a dangerous link, leaves a safe one alone, and exposes nothing to the page", async () => {
    document.body.innerHTML =
      '<p><a href="https://bcp.com.bo.verifica.net/">Entrar</a> <a href="https://www.lostiempos.com/">Noticias</a></p>';
    const globals = new Set(Object.keys(window));
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);

    const { default: script } = await import("../entrypoints/content.ts");
    const invalidated: (() => void)[] = [];
    await script.main({ onInvalidated: (stop: () => void) => invalidated.push(stop) } as never);
    await new Promise((resolve) => setTimeout(resolve, 80));

    const marks = document.querySelectorAll("ojolink-mark");
    expect(marks).toHaveLength(1);
    expect(marks[0]?.previousElementSibling?.textContent).toBe("Entrar");
    expect(Object.keys(window).filter((key) => !globals.has(key))).toEqual([]);
    expect(debug).not.toHaveBeenCalled();

    expect(invalidated).toHaveLength(1);
    invalidated[0]?.();
    expect(document.querySelectorAll("ojolink-mark, ojolink-status, ojolink-warning")).toHaveLength(
      0,
    );
  });
});
