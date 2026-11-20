import { describe, expect, it } from "vitest";
import { checkText } from "../src/lib/check";
import { readFragmentLink } from "../src/lib/fragment";
import { shortenLink } from "../src/lib/shorten";
import { fill } from "../src/lib/strings";

const cp = (...values: number[]) => String.fromCodePoint(...values);
const FAKE_BCP = `https://b${cp(0x0441, 0x0440)}.com.bo/validar`;

function results(text: string) {
  const outcome = checkText(text);
  if (outcome.kind !== "results") throw new Error(`expected results, got: ${outcome.message}`);
  return outcome;
}

function message(text: string): string {
  const outcome = checkText(text);
  if (outcome.kind !== "message") throw new Error("expected a message");
  return outcome.message;
}

describe("checkText", () => {
  it("gives one result for a single link", () => {
    const { items, announcement } = results(FAKE_BCP);
    expect(items).toHaveLength(1);
    expect(items[0]?.description.level).toBe("danger");
    expect(announcement).toBe("Se encontró 1 enlace: Peligro.");
  });

  it("finds the one link of a whole message", () => {
    const text =
      "BCP: su tarjeta fue bloqueada. Reactive en bit.ly/3xYzAb o escriba a ayuda@bcp.com.bo. Costo Bs 1.250,50.";
    const { items } = results(text);
    expect(items.map((item) => item.link)).toEqual(["bit.ly/3xYzAb"]);
    expect(items[0]?.description.level).toBe("hidden-destination");
  });

  it("gives a result per link, in order, and announces each level", () => {
    const text = `Mira ${FAKE_BCP} y también https://bit.ly/abc y https://bcp.com.bo/login`;
    const { items, announcement } = results(text);
    expect(items.map((item) => item.description.level)).toEqual([
      "danger",
      "hidden-destination",
      "safe",
    ]);
    expect(announcement).toBe(
      "Se encontraron 3 enlaces: Peligro, Destino oculto, Sin señales de alerta.",
    );
  });

  it.each([
    ["an ordinary sentence", "Hola, ¿cómo estás?", "No encontramos ningún enlace"],
    ["an email address alone", "juan@gmail.com", "Esto es una dirección de correo, no un enlace."],
    ["an empty field", "   ", "Pega un enlace o un mensaje para revisarlo."],
    ["an unsupported scheme", "mailto:juan@gmail.com", "Este tipo de enlace no se analiza."],
  ])("says what %s is, without a result", (_name, text, expected) => {
    expect(message(text)).toContain(expected);
  });

  it("analyzes a single item that extraction skips, such as a bare address", () => {
    expect(results("192.168.1.1").items[0]?.description.level).toBe("safe");
  });
});

describe("readFragmentLink", () => {
  it("decodes a link passed in the fragment", () => {
    const link = "https://bit.ly/3xYz?a=1&b=2";
    expect(readFragmentLink(`#u=${encodeURIComponent(link)}`)).toBe(link);
    expect(readFragmentLink(`u=${encodeURIComponent(link)}`)).toBe(link);
  });

  it.each(["", "#", "#seccion", "#x=1", "#u=", "#u=%20", "#u=%E0%A4%A", "#U=https://a.com"])(
    "returns null for %j",
    (hash) => {
      expect(readFragmentLink(hash)).toBeNull();
    },
  );
});

describe("shortenLink", () => {
  it("leaves a short link as it is", () => {
    expect(shortenLink("https://bcp.com.bo/login")).toBe("https://bcp.com.bo/login");
  });

  it("shortens a long link in the middle and keeps its host", () => {
    const link = `https://nam02.safelinks.protection.outlook.com/?url=${"a".repeat(200)}&data=fin-del-enlace`;
    const shown = shortenLink(link);
    expect(Array.from(shown)).toHaveLength(72);
    expect(shown).toContain("nam02.safelinks.protection.outlook.com");
    expect(shown).toContain("…");
    expect(shown.endsWith("fin-del-enlace")).toBe(true);
  });
});

describe("fill", () => {
  it("fills known placeholders and leaves unknown ones visible", () => {
    expect(fill("{a} y {b}", { a: 1 })).toBe("1 y {b}");
  });
});
