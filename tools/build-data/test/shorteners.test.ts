import { describe, expect, it } from "vitest";
import {
  buildShorteners,
  renderShorteners,
  validateShorteners,
  type CuratedShortener,
} from "../src/shorteners.ts";

function source(hosts: CuratedShortener[], updated = "2026-11-19") {
  return { file: "shorteners.json", content: { updated, hosts } };
}

describe("validateShorteners", () => {
  it("accepts valid hosts", () => {
    expect(
      validateShorteners(
        source([
          { host: "bit.ly", kind: "shortener" },
          { host: "list-manage.com", kind: "tracker" },
        ]),
      ),
    ).toEqual([]);
  });

  it.each(["Bit.ly", "https://bit.ly", "bit.ly/", "bitly", "bit..ly", "-bit.ly", ""])(
    "rejects the host %j",
    (host) => {
      const errors = validateShorteners(source([{ host, kind: "shortener" }]));
      expect(errors.join("\n")).toMatch(/not a valid lowercase host/);
      expect(errors.join("\n")).toContain("shorteners.json");
    },
  );

  it("rejects a repeated host", () => {
    const errors = validateShorteners(
      source([
        { host: "bit.ly", kind: "shortener" },
        { host: "bit.ly", kind: "tracker" },
      ]),
    );
    expect(errors.join("\n")).toMatch(/more than once/);
  });

  it("rejects an unknown kind and a missing date", () => {
    expect(
      validateShorteners(source([{ host: "bit.ly", kind: "other" as never }])).join("\n"),
    ).toMatch(/kind/);
    expect(validateShorteners(source([], "yesterday")).join("\n")).toMatch(/updated/);
  });
});

describe("buildShorteners", () => {
  it("sorts by host and fails on invalid input", () => {
    const hosts = buildShorteners(
      source([
        { host: "t.co", kind: "shortener" },
        { host: "bit.ly", kind: "shortener" },
      ]),
    );
    expect(hosts.map((entry) => entry.host)).toEqual(["bit.ly", "t.co"]);
    expect(() => buildShorteners(source([{ host: "BIT.LY", kind: "shortener" }]))).toThrow(
      /BIT\.LY/,
    );
  });

  it("renders the source date as the version", () => {
    expect(renderShorteners([{ host: "bit.ly", kind: "shortener" }], "2026-11-19")).toContain(
      "// Source version: 2026-11-19",
    );
  });
});
