import { describeReveal } from "@ojolink/core";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.svelte";
import type { Reveal, RevealOutcome } from "../src/lib/reveal";
import type { Settings } from "../src/lib/settings";
import { strings } from "../src/lib/strings";

const texts = describeReveal();
const SHORT = "https://bit.ly/3xYz";
const cp = (...values: number[]) => String.fromCodePoint(...values);
const FAKE_BCP = `https://b${cp(0x0441, 0x0440)}.com.bo/validar`;
const WITH_RESOLVER: Settings = { resolver: "https://resolver.example", shortcut: null };
const NO_RESOLVER: Settings = { resolver: null, shortcut: null };

const revealedAt = (destination: string): RevealOutcome => ({
  kind: "revealed",
  destination,
  hops: [SHORT],
});
const failure = (reason: string, deepOffered = false) =>
  ({ kind: "failed", reason, deepOffered }) as RevealOutcome;

function fakeReveal(
  answer: (link: string, deep: boolean) => RevealOutcome | Promise<RevealOutcome>,
) {
  const calls: [string, boolean][] = [];
  const reveal: Reveal = async (link, { deep }) => {
    calls.push([link, deep]);
    return answer(link, deep);
  };
  return { calls, reveal };
}

const field = (): HTMLTextAreaElement => screen.getByLabelText(strings.fieldLabel);
const cards = (): HTMLElement[] => screen.queryAllByRole("article");
const card = (index = 0) => within(cards()[index] as HTMLElement);
const level = (index = 0) => (cards()[index] as HTMLElement).dataset.level;
const announced = () => document.querySelector("[data-reveal]")?.textContent?.trim() ?? "";

async function analyze(text: string) {
  await fireEvent.input(field(), { target: { value: text } });
  await fireEvent.click(screen.getByRole("button", { name: strings.analyze }));
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("revealing a short link on arrival", () => {
  it("shows the verdict of a dangerous destination, with both addresses as plain text", async () => {
    const { calls, reveal } = fakeReveal(() => revealedAt(FAKE_BCP));
    render(App, { settings: WITH_RESOLVER, reveal });
    await analyze(SHORT);
    await waitFor(() => expect(level()).toBe("danger"));
    expect(calls).toEqual([[SHORT, false]]);
    expect(card().getByText("Peligro")).toBeTruthy();
    expect((cards()[0] as HTMLElement).querySelector(".link code")?.textContent).toBe(SHORT);
    const leads = (cards()[0] as HTMLElement).querySelector(".real")?.textContent ?? "";
    expect(leads).toContain(texts.leadsTo);
    expect(leads).toContain(FAKE_BCP);
    expect(card().getByText(texts.viaShortener)).toBeTruthy();
    expect(card().getByRole("heading", { level: 3 }).textContent).toContain("imita");
    for (const link of (cards()[0] as HTMLElement).querySelectorAll("a")) {
      expect(link.getAttribute("href")).toBe("https://resolver.example/privacidad");
    }
  });

  it("shows the safe level for an ordinary destination and names it", async () => {
    const { reveal } = fakeReveal(() => revealedAt("https://www.lostiempos.com/nota"));
    render(App, { settings: WITH_RESOLVER, reveal });
    await analyze(SHORT);
    await waitFor(() => expect(level()).toBe("safe"));
    expect(card().getByText(texts.safeDestination)).toBeTruthy();
    expect((cards()[0] as HTMLElement).textContent).toContain("https://www.lostiempos.com/nota");
  });

  it("says it is revealing while it waits, and never shows that as safe", async () => {
    const { reveal } = fakeReveal(() => new Promise<RevealOutcome>(() => undefined));
    render(App, { settings: WITH_RESOLVER, reveal });
    await analyze(SHORT);
    expect(card().getByText(texts.waiting)).toBeTruthy();
    expect(level()).toBe("hidden-destination");
  });

  it("sends the inner short link of a wrapped one", async () => {
    const { calls, reveal } = fakeReveal(() => revealedAt("https://example.org/"));
    render(App, { settings: WITH_RESOLVER, reveal });
    await analyze(
      `https://nam02.safelinks.protection.outlook.com/?url=${encodeURIComponent(SHORT)}&data=x`,
    );
    await waitFor(() => expect(calls).toEqual([[SHORT, false]]));
  });

  it("sends nothing for a message without short links", async () => {
    const { calls, reveal } = fakeReveal(() => revealedAt("https://example.org/"));
    render(App, { settings: WITH_RESOLVER, reveal });
    await analyze(`Hola, entra a ${FAKE_BCP} o a https://www.lostiempos.com/ con tu clave 1234`);
    expect(cards()).toHaveLength(2);
    expect(calls).toEqual([]);
  });

  it("sends only the short link of a longer message", async () => {
    const { calls, reveal } = fakeReveal(() => revealedAt("https://example.org/"));
    render(App, { settings: WITH_RESOLVER, reveal });
    await analyze(`Tu paquete 4471 espera, paga en ${SHORT} antes del lunes. ${FAKE_BCP}`);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls).toEqual([[SHORT, false]]);
  });

  it("announces the revealed result and tells what was sent", async () => {
    const { reveal } = fakeReveal(() => revealedAt(FAKE_BCP));
    render(App, { settings: WITH_RESOLVER, reveal });
    expect(screen.getByText(strings.privacyWithReveal)).toBeTruthy();
    await analyze(SHORT);
    await waitFor(() => expect(announced()).toBe("Destino revelado: Peligro."));
    const notice = (cards()[0] as HTMLElement).querySelector(".sent");
    expect(notice?.textContent).toContain(texts.sentNotice);
    const policy = card().getByRole("link", { name: texts.policyLink });
    expect(policy.getAttribute("href")).toBe("https://resolver.example/privacidad");
    expect(policy.getAttribute("rel")).toContain("noopener");
  });

  it("reveals five short links by itself and offers a button for the rest", async () => {
    const links = Array.from({ length: 7 }, (_, index) => `https://bit.ly/n${index}`);
    const { calls, reveal } = fakeReveal(() => revealedAt("https://example.org/"));
    render(App, { settings: WITH_RESOLVER, reveal });
    await analyze(links.join("\n"));
    await waitFor(() => expect(calls).toHaveLength(5));
    expect(screen.getAllByRole("button", { name: texts.revealButton })).toHaveLength(2);
    expect(level(5)).toBe("hidden-destination");

    await fireEvent.click(card(5).getByRole("button", { name: texts.revealButton }));
    await waitFor(() => expect(level(5)).toBe("safe"));
    expect(calls.at(-1)).toEqual([links[5], false]);
  });

  it("drops the answers of an earlier analysis", async () => {
    const pending: ((outcome: RevealOutcome) => void)[] = [];
    const { reveal } = fakeReveal(
      () => new Promise<RevealOutcome>((resolve) => pending.push(resolve)),
    );
    render(App, { settings: WITH_RESOLVER, reveal });
    await analyze(SHORT);
    await analyze("https://tinyurl.com/otro");
    pending[0]?.(revealedAt(FAKE_BCP));
    await Promise.resolve();
    expect(cards()).toHaveLength(1);
    expect(level()).toBe("hidden-destination");
  });
});

describe("a destination that cannot be revealed", () => {
  it.each([
    ["unresolved", texts.failedUnresolved],
    ["offline", texts.failedOffline],
    ["limited", texts.failedLimited],
    ["error", texts.failedError],
  ])("shows %s as caution, never as safe, and offers to try again", async (reason, text) => {
    const { calls, reveal } = fakeReveal(() => failure(reason));
    render(App, { settings: WITH_RESOLVER, reveal });
    await analyze(SHORT);
    await waitFor(() => expect(level()).toBe("caution"));
    expect(card().getByText("Precaución")).toBeTruthy();
    expect(card().getByRole("heading", { level: 3 }).textContent).toBe(texts.failedTitle);
    expect(card().getByText(text)).toBeTruthy();
    expect(card().getByText(texts.failedAdvice)).toBeTruthy();
    expect(announced()).toBe(texts.announceFailed);
    expect(card().queryByRole("button", { name: texts.deepButton })).toBeNull();

    await fireEvent.click(card().getByRole("button", { name: texts.retryButton }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual([SHORT, false]);
  });

  it("does not say the link was sent when there was no connection", async () => {
    const { reveal } = fakeReveal(() => failure("offline"));
    render(App, { settings: WITH_RESOLVER, reveal });
    await analyze(SHORT);
    await waitFor(() => expect(level()).toBe("caution"));
    expect((cards()[0] as HTMLElement).querySelector(".sent")).toBeNull();
  });

  it("treats a destination that is itself hidden as not revealed", async () => {
    const { reveal } = fakeReveal(() => revealedAt("https://tinyurl.com/abc"));
    render(App, { settings: WITH_RESOLVER, reveal });
    await analyze(SHORT);
    await waitFor(() => expect(level()).toBe("caution"));
    expect(card().getByText(texts.failedUnresolved)).toBeTruthy();
  });

  it("keeps the other results of the message", async () => {
    const { reveal } = fakeReveal(() => failure("error"));
    render(App, { settings: WITH_RESOLVER, reveal });
    await analyze(`${FAKE_BCP} ${SHORT}`);
    await waitFor(() => expect(level(1)).toBe("caution"));
    expect(level(0)).toBe("danger");
  });
});

describe("deep analysis", () => {
  it("is sent only when the button is pressed, and replaces the result", async () => {
    const { calls, reveal } = fakeReveal((_link, deep) =>
      deep ? revealedAt(FAKE_BCP) : failure("unresolved", true),
    );
    render(App, { settings: WITH_RESOLVER, reveal });
    await analyze(SHORT);
    await waitFor(() => expect(level()).toBe("caution"));
    expect(calls).toEqual([[SHORT, false]]);

    await fireEvent.click(card().getByRole("button", { name: texts.deepButton }));
    await waitFor(() => expect(level()).toBe("danger"));
    expect(calls).toEqual([
      [SHORT, false],
      [SHORT, true],
    ]);
  });

  it("says it may take a few seconds", async () => {
    const { reveal } = fakeReveal((_link, deep) =>
      deep ? new Promise<RevealOutcome>(() => undefined) : failure("unresolved", true),
    );
    render(App, { settings: WITH_RESOLVER, reveal });
    await analyze(SHORT);
    await waitFor(() => expect(level()).toBe("caution"));
    await fireEvent.click(card().getByRole("button", { name: texts.deepButton }));
    expect(card().getByText(texts.waitingDeep)).toBeTruthy();
  });

  it("stays at caution when it is not available, and can be tried later", async () => {
    const { reveal } = fakeReveal((_link, deep) =>
      deep ? failure("deep-unavailable", true) : failure("unresolved", true),
    );
    render(App, { settings: WITH_RESOLVER, reveal });
    await analyze(SHORT);
    await waitFor(() => expect(level()).toBe("caution"));
    await fireEvent.click(card().getByRole("button", { name: texts.deepButton }));
    await waitFor(() => expect(card().getByText(texts.failedDeepUnavailable)).toBeTruthy());
    expect(level()).toBe("caution");
    expect(card().getByRole("button", { name: texts.deepButton })).toBeTruthy();
  });

  it("is not offered again after it fails", async () => {
    const { reveal } = fakeReveal((_link, deep) => failure("unresolved", !deep));
    render(App, { settings: WITH_RESOLVER, reveal });
    await analyze(SHORT);
    await waitFor(() => expect(level()).toBe("caution"));
    await fireEvent.click(card().getByRole("button", { name: texts.deepButton }));
    await waitFor(() =>
      expect(card().queryByRole("button", { name: texts.deepButton })).toBeNull(),
    );
    expect(level()).toBe("caution");
    expect(card().getByRole("button", { name: texts.retryButton })).toBeTruthy();
  });
});

describe("without a resolver", () => {
  it("makes no request and shows a short link as a hidden destination", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    render(App, { settings: NO_RESOLVER });
    expect(screen.getByText(strings.privacy)).toBeTruthy();
    await analyze(`${SHORT} ${FAKE_BCP}`);
    expect(level(0)).toBe("hidden-destination");
    expect(level(1)).toBe("danger");
    expect(screen.queryByRole("button", { name: texts.revealButton })).toBeNull();
    expect(document.querySelector(".sent")).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("uses the real client when only the address is set", async () => {
    const request = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () =>
      Response.json(revealedResponse()),
    );
    vi.stubGlobal("fetch", request);
    render(App, { settings: WITH_RESOLVER });
    await analyze(SHORT);
    await waitFor(() => expect(level()).toBe("safe"));
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toBe("https://resolver.example/resolve");
  });

  function revealedResponse() {
    return { status: "resolved", destination: "https://example.org/", hops: [SHORT] };
  }
});

describe("share route", () => {
  const openAt = (address: string, props = {}) => {
    window.history.replaceState(null, "", address);
    return render(App, { settings: NO_RESOLVER, ...props });
  };

  it("fills the field, analyzes, and cleans the address", () => {
    openAt(`/analizar?${new URLSearchParams({ text: `Mira esto ${FAKE_BCP}`, title: "Aviso" })}`);
    expect(field().value).toBe(`Aviso\nMira esto ${FAKE_BCP}`);
    expect(cards()).toHaveLength(1);
    expect(level()).toBe("danger");
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("");
  });

  it("shows one result for the same link in text and url", () => {
    openAt(`/analizar?${new URLSearchParams({ text: `Mira ${FAKE_BCP}`, url: FAKE_BCP })}`);
    expect(cards()).toHaveLength(1);
  });

  it("says it found no links when the share has none", () => {
    openAt(`/analizar?${new URLSearchParams({ text: "nos vemos a las cinco" })}`);
    expect(field().value).toBe("nos vemos a las cinco");
    expect(cards()).toHaveLength(0);
    expect(screen.getByText("No encontramos ningún enlace en este texto.")).toBeTruthy();
  });

  it("opens empty when the route carries no data", () => {
    openAt("/analizar");
    expect(field().value).toBe("");
    expect(cards()).toHaveLength(0);
    expect(window.location.pathname).toBe("/");
  });

  it("reveals a shared short link", async () => {
    const { calls, reveal } = fakeReveal(() => revealedAt(FAKE_BCP));
    openAt(`/analizar?${new URLSearchParams({ url: SHORT })}`, {
      settings: WITH_RESOLVER,
      reveal,
    });
    await waitFor(() => expect(level()).toBe("danger"));
    expect(calls).toEqual([[SHORT, false]]);
  });

  it("still ignores shared fields outside the share route", () => {
    openAt(`/?${new URLSearchParams({ text: FAKE_BCP, url: FAKE_BCP })}`);
    expect(field().value).toBe("");
    expect(cards()).toHaveLength(0);
  });
});

describe("message in the address fragment", () => {
  it("shows a result for each link of a whole message", () => {
    const message = `Hola, revisa ${FAKE_BCP} y también https://www.lostiempos.com/`;
    window.history.replaceState(null, "", `/#u=${encodeURIComponent(message)}`);
    render(App, { settings: NO_RESOLVER });
    expect(field().value).toBe(message);
    expect(cards()).toHaveLength(2);
    expect(window.location.hash).toBe("");
  });
});

describe("iOS guide and install hint", () => {
  const agent = (userAgent: string, maxTouchPoints = 0) => {
    vi.stubGlobal("navigator", { userAgent, maxTouchPoints, onLine: true });
  };
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1";
  const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36";

  it("links to the guide from the footer, and under the field on an iPhone", () => {
    agent(DESKTOP);
    render(App, { settings: NO_RESOLVER });
    expect(screen.getAllByRole("link", { name: strings.iosLink })).toHaveLength(1);
    expect(screen.queryByText(strings.iosHint, { exact: false })).toBeNull();
    cleanup();

    agent(IPHONE, 5);
    render(App, { settings: NO_RESOLVER });
    const links = screen.getAllByRole("link", { name: strings.iosLink });
    expect(links).toHaveLength(2);
    expect(links.every((link) => link.getAttribute("href") === "#ios")).toBe(true);
    expect(screen.getByText(strings.iosHint, { exact: false })).toBeTruthy();
  });

  it("shows the manual steps with the app's own address", () => {
    window.history.replaceState(null, "", "/#ios");
    render(App, { settings: NO_RESOLVER });
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(strings.iosTitle);
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe(strings.iosManual);
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      ...strings.iosSteps,
    ]);
    expect(document.querySelector(".address code")?.textContent).toBe(
      `${window.location.origin}/#u=`,
    );
    expect(screen.queryByRole("link", { name: strings.iosReady })).toBeNull();
    expect(screen.queryByLabelText(strings.fieldLabel)).toBeNull();
    expect(screen.getByRole("link", { name: strings.iosBack })).toBeTruthy();
  });

  it("offers the ready-made Shortcut when the project has one", () => {
    window.history.replaceState(null, "", "/#ios");
    const shortcut = "https://www.icloud.com/shortcuts/abc";
    render(App, { settings: { resolver: null, shortcut } });
    expect(screen.getByRole("link", { name: strings.iosReady }).getAttribute("href")).toBe(
      shortcut,
    );
  });

  it("opens and leaves the guide when the fragment changes", async () => {
    render(App, { settings: NO_RESOLVER });
    expect(screen.queryByRole("heading", { level: 2, name: strings.iosTitle })).toBeNull();
    window.location.hash = "#ios";
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: strings.iosTitle })).toBeTruthy(),
    );
    window.location.hash = "#inicio";
    await waitFor(() => expect(screen.getByLabelText(strings.fieldLabel)).toBeTruthy());
  });

  it("explains how to install only when the app is not installed", () => {
    const media = (matches: boolean) =>
      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches })),
      );
    media(false);
    render(App, { settings: NO_RESOLVER });
    expect(screen.getByText(strings.installHint)).toBeTruthy();
    cleanup();

    media(true);
    render(App, { settings: NO_RESOLVER });
    expect(screen.queryByText(strings.installHint)).toBeNull();
  });
});
