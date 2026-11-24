import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "../src/App.svelte";
import { strings } from "../src/lib/strings";

const cp = (...values: number[]) => String.fromCodePoint(...values);
const FAKE_BCP = `https://b${cp(0x0441, 0x0440)}.com.bo/validar`;

function field(): HTMLTextAreaElement {
  return screen.getByLabelText(strings.fieldLabel);
}

async function analyze(text: string) {
  await fireEvent.input(field(), { target: { value: text } });
  await fireEvent.click(screen.getByRole("button", { name: strings.analyze }));
}

function cards(): HTMLElement[] {
  return screen.queryAllByRole("article");
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
});

describe("page shell", () => {
  it("declares Spanish and a no-referrer policy", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
    expect(html).toContain('<html lang="es">');
    expect(html).toContain('<meta name="referrer" content="no-referrer" />');
  });

  it("takes its texts from the catalog", () => {
    render(App);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(strings.appName);
    expect(screen.getByText(strings.tagline)).toBeTruthy();
    expect(screen.getByText(strings.privacy)).toBeTruthy();
    expect(screen.getByText(strings.fieldHint)).toBeTruthy();
  });

  it("starts with an empty field and no results", () => {
    render(App);
    expect(field().value).toBe("");
    expect(cards()).toHaveLength(0);
  });
});

describe("checking links", () => {
  it("shows a result when submitted with the button", async () => {
    render(App);
    await analyze(FAKE_BCP);
    expect(cards()).toHaveLength(1);
    expect(within(cards()[0] as HTMLElement).getByText("Peligro")).toBeTruthy();
  });

  it("analyzes with the keyboard shortcut", async () => {
    render(App);
    await fireEvent.input(field(), { target: { value: "https://bit.ly/3xYz" } });
    await fireEvent.keyDown(field(), { key: "Enter", ctrlKey: true });
    expect(within(cards()[0] as HTMLElement).getByText("Destino oculto")).toBeTruthy();
  });

  it("does not analyze on a plain Enter", async () => {
    render(App);
    await fireEvent.input(field(), { target: { value: "https://bit.ly/3xYz" } });
    await fireEvent.keyDown(field(), { key: "Enter" });
    expect(cards()).toHaveLength(0);
  });

  it("asks for a link when the field is empty", async () => {
    render(App);
    await analyze("");
    expect(screen.getByText("Pega un enlace o un mensaje para revisarlo.")).toBeTruthy();
    expect(cards()).toHaveLength(0);
  });

  it("says that an email address is not a link", async () => {
    render(App);
    await analyze("juan@gmail.com");
    expect(screen.getByText("Esto es una dirección de correo, no un enlace.")).toBeTruthy();
    expect(cards()).toHaveLength(0);
  });

  it("shows one card per link of a message, in order", async () => {
    render(App);
    await analyze(`Mira ${FAKE_BCP} y https://bit.ly/abc y https://bcp.com.bo/login`);
    const labels = cards().map((card) => card.querySelector(".badge")?.textContent?.trim());
    expect(labels).toEqual(["Peligro", "Destino oculto", "Sin señales de alerta"]);
  });

  it("replaces earlier results on a new analysis", async () => {
    render(App);
    await analyze(FAKE_BCP);
    await analyze("Hola");
    expect(cards()).toHaveLength(0);
    expect(screen.getByText("No encontramos ningún enlace en este texto.")).toBeTruthy();
  });
});

describe("showing a warning", () => {
  it("presents the parts in order", async () => {
    render(App);
    await analyze(FAKE_BCP);
    const card = cards()[0] as HTMLElement;
    const text = card.textContent ?? "";
    const order = [
      "Peligro",
      "Este enlace imita a bcp.com.bo",
      "Se ve como bcp.com.bo",
      "Letra por letra",
      "Dirección real",
      "xn--b-5tbc.com.bo",
      "Si esperabas un mensaje de BCP",
      "Ver detalle técnico",
    ].map((part) => text.indexOf(part));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(within(card).getByRole("heading", { level: 3 }).textContent).toBe(
      "Este enlace imita a bcp.com.bo",
    );
  });

  it("labels each letter and announces the substituted ones", async () => {
    render(App);
    await analyze(FAKE_BCP);
    const list = screen.getByRole("list", { name: "Letra por letra" });
    const names = within(list)
      .getAllByRole("listitem")
      .map((item) => item.querySelector(".sr-only")?.textContent?.trim() ?? item.textContent);
    expect(names).toEqual([
      "b, latina",
      `${cp(0x0441)}, cirílica, sustituida`,
      `${cp(0x0440)}, cirílica, sustituida`,
      ".com.bo",
    ]);
    expect(list.querySelectorAll(".tile.marked")).toHaveLength(2);
  });

  it("keeps the technical detail collapsed until it is opened", async () => {
    render(App);
    await analyze(FAKE_BCP);
    const details = (cards()[0] as HTMLElement).querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toBe("Ver detalle técnico");
    details.open = true;
    const text = details.textContent ?? "";
    expect(text).toContain("homograph");
    expect(text).toContain("mixed-script");
    expect(text).toContain("peso 90");
    expect(text).toContain("Puntaje: 100");
  });

  it("omits the comparison when the main signal has no letter data", async () => {
    render(App);
    await analyze("https://bit.ly/3xYz");
    expect(screen.queryByRole("list", { name: "Letra por letra" })).toBeNull();
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe(
      "No se sabe a dónde lleva este enlace",
    );
  });

  it("shows only the level description when there are no warning signs", async () => {
    render(App);
    await analyze("https://bcp.com.bo/login");
    const card = cards()[0] as HTMLElement;
    expect(card.textContent).toContain("Eso no garantiza que el sitio sea legítimo.");
    expect(card.querySelector("details")).toBeNull();
    expect(card.querySelector("h3")).toBeNull();
  });

  it("never renders the analyzed link as an active link", async () => {
    render(App);
    await analyze(`${FAKE_BCP} https://bit.ly/abc https://bcp.com.bo/login`);
    expect(document.querySelectorAll("article a")).toHaveLength(0);
    for (const link of document.querySelectorAll("a")) {
      expect(link.getAttribute("href")).toBe("#ios");
    }
    expect((cards()[0] as HTMLElement).querySelector(".link code")?.textContent).toBe(FAKE_BCP);
  });

  it("shortens a long wrapped link and shows the destination's host", async () => {
    const wrapped = `https://nam02.safelinks.protection.outlook.com/?url=${encodeURIComponent(FAKE_BCP)}&data=${"x".repeat(120)}`;
    render(App);
    await analyze(wrapped);
    const card = cards()[0] as HTMLElement;
    const shown = card.querySelector(".link code")?.textContent ?? "";
    expect(Array.from(shown).length).toBeLessThan(wrapped.length);
    expect(shown).toContain("…");
    expect(card.textContent).toContain("xn--b-5tbc.com.bo");
  });
});

describe("accessibility", () => {
  it("announces the number of links and each level", async () => {
    render(App);
    const status = document.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(status.textContent?.trim()).toBe("");
    await analyze(`${FAKE_BCP} https://bit.ly/abc`);
    expect(status.textContent?.trim()).toBe("Se encontraron 2 enlaces: Peligro, Destino oculto.");
  });

  it("connects the field with its label and hints", () => {
    render(App);
    expect(field().getAttribute("aria-describedby")).toBe("hint shortcut");
    expect(document.getElementById("hint")?.textContent).toBe(strings.fieldHint);
    expect(document.getElementById("shortcut")?.textContent).toBe(strings.shortcut);
  });

  it("gives each level a different icon and different words", async () => {
    render(App);
    await analyze(`${FAKE_BCP} https://bit.ly/abc https://bcp.com.bo/login https://prodam.bo/`);
    const badges = [...document.querySelectorAll(".badge")];
    const icons = badges.map((badge) => badge.querySelector("svg")?.getAttribute("data-icon"));
    const shapes = badges.map((badge) => badge.querySelector("svg")?.innerHTML);
    const words = badges.map((badge) => badge.textContent?.trim());
    expect(new Set(icons).size).toBe(4);
    expect(new Set(shapes).size).toBe(4);
    expect(new Set(words).size).toBe(4);
  });
});

describe("links received in the address fragment", () => {
  it("fills the field, analyzes, and removes the fragment", async () => {
    window.history.replaceState(null, "", `/#u=${encodeURIComponent(FAKE_BCP)}`);
    render(App);
    await Promise.resolve();
    expect(field().value).toBe(FAKE_BCP);
    expect(cards()).toHaveLength(1);
    expect(window.location.hash).toBe("");
  });

  it("ignores a link in the query string", async () => {
    window.history.replaceState(null, "", `/?u=${encodeURIComponent(FAKE_BCP)}`);
    render(App);
    await Promise.resolve();
    expect(field().value).toBe("");
    expect(cards()).toHaveLength(0);
  });

  it("opens empty for a malformed fragment", async () => {
    window.history.replaceState(null, "", "/#u=%E0%A4%A");
    render(App);
    await Promise.resolve();
    expect(field().value).toBe("");
    expect(cards()).toHaveLength(0);
    expect(screen.queryByRole("status", { name: /error/i })).toBeNull();
  });

  it("reads a fragment that arrives while the app is open", async () => {
    render(App);
    window.history.replaceState(null, "", "/#u=https%3A%2F%2Fbit.ly%2F3xYz");
    await fireEvent(window, new HashChangeEvent("hashchange"));
    expect(field().value).toBe("https://bit.ly/3xYz");
    expect(cards()).toHaveLength(1);
  });
});
