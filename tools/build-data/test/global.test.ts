import { describe, expect, it } from "vitest";
import {
  applyRanks,
  buildProtected,
  GLOBAL_CATEGORIES,
  matchingNames,
  nameOf,
  RANK_LIMIT,
  rankedDomains,
  renderProtected,
  validateProtected,
  type Category,
  type CuratedEntity,
  type CuratedPack,
  type SourceFile,
  type Verification,
} from "../src/protected.ts";
import { createRankReader } from "../src/refresh-ranking.ts";

const ranked = (rank: number | null | "none" = 120): Verification => ({
  status: "confirmed",
  method: "ranking",
  ranking: "majestic-million",
  checked: "2026-11-23",
  ...(rank === "none" ? {} : { rank }),
});
const visited: Verification = {
  status: "confirmed",
  source: "https://example.org/",
  checked: "2026-11-23",
};

function brand(domain: string, category: Category, extra: Partial<CuratedEntity> = {}) {
  return { domain, name: domain, category, verification: ranked(), ...extra } as CuratedEntity;
}

const ONE_OF_EACH: CuratedEntity[] = [
  brand("paypal.com", "payments", { name: "PayPal" }),
  brand("chase.com", "bank"),
  brand("microsoft.com", "mail", {
    name: "Microsoft",
    aliases: [
      { domain: "live.com", verification: ranked(40), commonWord: true },
      { domain: "outlook.com", verification: ranked(55) },
    ],
  }),
  brand("netflix.com", "streaming"),
  brand("facebook.com", "social"),
  brand("amazon.com", "shopping", { commonWord: true }),
  brand("dhl.com", "shipping"),
  brand("vodafone.com", "telecom"),
];

function global(entities: CuratedEntity[] = ONE_OF_EACH): SourceFile<CuratedPack> {
  return { file: "protected/global.json", content: { country: "global", suffixes: [], entities } };
}

const entriesOf = (source: SourceFile<CuratedPack>) => buildProtected([source]).packs[0]?.entries;

describe("the global pack's format", () => {
  it("accepts a pack named global with ranking-confirmed entries", () => {
    expect(validateProtected([global()])).toEqual([]);
  });

  it("still rejects any other pack name", () => {
    const source = { ...global(), content: { ...global().content, country: "world" } };
    expect(validateProtected([source]).join("\n")).toMatch(/two-letter lowercase code or "global"/);
  });

  it.each([
    ["no ranking name", { ...ranked(), ranking: "" }, /does not name its ranking/],
    ["no checked date", { ...ranked(), checked: undefined as never }, /checked date/],
    ["an unknown method", { ...visited, method: "rumor" as never }, /"site" or "ranking"/],
  ])("rejects a verification record with %s", (_name, verification, message) => {
    const errors = validateProtected([global([brand("paypal.com", "payments", { verification })])]);
    expect(errors.join("\n")).toMatch(message);
    expect(errors.join("\n")).toContain("paypal.com");
  });

  it("accepts an entry confirmed against its own site", () => {
    const entities = ONE_OF_EACH.map((entity) =>
      entity.domain === "dhl.com" ? { ...entity, verification: visited } : entity,
    );
    expect(entriesOf(global(entities))?.map((entry) => entry.domain)).toContain("dhl.com");
  });
});

describe("names that find a brand", () => {
  it("uses the domain's own name by default", () => {
    expect(nameOf("paypal.com")).toBe("paypal");
    expect(nameOf("bcp.com.bo")).toBe("bcp");
    expect(matchingNames({ domain: "paypal.com", verification: ranked() })).toEqual(["paypal"]);
  });

  it("ships declared names, and nothing when the name is the default", () => {
    const entities = [
      ...ONE_OF_EACH,
      brand("disneyplus.com", "streaming", { names: ["disneyplus", "disney"] }),
    ];
    const entries = entriesOf(global(entities));
    expect(entries?.find((entry) => entry.domain === "disneyplus.com")?.names).toEqual([
      "disneyplus",
      "disney",
    ]);
    expect(entries?.find((entry) => entry.domain === "paypal.com")).not.toHaveProperty("names");
  });

  it("lets an alias opt out of matching with an empty list", () => {
    const entities = ONE_OF_EACH.map((entity) =>
      entity.domain === "microsoft.com"
        ? { ...entity, aliases: [{ domain: "live.com", verification: ranked(40), names: [] }] }
        : entity,
    );
    expect(validateProtected([global(entities)])).toEqual([]);
    expect(
      entriesOf(global(entities))?.find((entry) => entry.domain === "live.com")?.names,
    ).toEqual([]);
  });

  it.each([
    ["uppercase", ["PayPal"]],
    ["a hyphen", ["pay-pal"]],
    ["a space", ["pay pal"]],
    ["an accent", ["café"]],
  ])("rejects a declared name with %s and names the entry", (_name, names) => {
    const errors = validateProtected([global([brand("paypal.com", "payments", { names })])]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/paypal\.com.*lowercase letters and digits/);
  });

  it("asks for declared names when the domain's own name has a hyphen", () => {
    const errors = validateProtected([global([brand("t-mobile.com", "telecom")])]);
    expect(errors.join("\n")).toMatch(/t-mobile\.com.*declare its names/);
    expect(
      validateProtected([global([brand("t-mobile.com", "telecom", { names: ["tmobile"] })])]),
    ).toEqual([]);
  });

  it("rejects a declared name that another entity uses, and names both", () => {
    const errors = validateProtected([
      global([
        brand("primevideo.com", "streaming", { names: ["primevideo", "prime"] }),
        brand("prime.com", "shopping"),
      ]),
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/prime\.com.*"prime".*primevideo\.com/);
  });

  it("accepts the same name on the main domain and an alias of one entity", () => {
    const source = global([
      ...ONE_OF_EACH,
      brand("mercadolibre.com", "shopping", {
        aliases: [{ domain: "mercadolibre.com.ar", verification: ranked(300) }],
      }),
    ]);
    expect(validateProtected([source])).toEqual([]);
  });

  it("rejects a commonWord that is not true or false", () => {
    const errors = validateProtected([
      global([brand("apple.com", "shopping", { commonWord: "yes" as never })]),
    ]);
    expect(errors.join("\n")).toMatch(/commonWord must be true or false/);
  });
});

describe("generated global data", () => {
  it("marks common words and keeps several official domains under one entity", () => {
    const entries = entriesOf(global());
    expect(entries?.find((entry) => entry.domain === "amazon.com")?.common).toBe(true);
    expect(entries?.find((entry) => entry.domain === "paypal.com")).not.toHaveProperty("common");
    expect(
      entries?.filter((entry) => entry.name === "Microsoft").map((entry) => entry.domain),
    ).toEqual(["live.com", "microsoft.com", "outlook.com"]);
    expect(entries?.find((entry) => entry.domain === "live.com")?.common).toBe(true);
  });

  it("renders the pack as global with the new fields in the types", () => {
    const text = renderProtected(buildProtected([global()]));
    expect(text).toContain('"country": "global"');
    expect(text).toContain('"streaming"');
    expect(text).toContain("readonly names?: readonly string[];");
    expect(text).toContain("readonly common?: true;");
    expect(text).toContain("export const SHORT_NAME_LENGTH = 4;");
  });

  it.each(GLOBAL_CATEGORIES)("fails when the %s category has no confirmed entry", (category) => {
    const entities = ONE_OF_EACH.filter((entity) => entity.category !== category);
    expect(() => buildProtected([global(entities)])).toThrow(
      new RegExp(`global\\.json: no confirmed entry in ${category}`),
    );
  });

  it("does not ask a country pack for every category", () => {
    const bo: SourceFile<CuratedPack> = {
      file: "protected/bo.json",
      content: {
        country: "bo",
        suffixes: [],
        entities: [brand("bcp.com.bo", "bank", { verification: visited })],
      },
    };
    expect(buildProtected([bo, global()]).packs.map((pack) => pack.country)).toEqual([
      "bo",
      "global",
    ]);
  });
});

describe("confirmation by the ranking", () => {
  const withRank = (rank: number | null | "none") =>
    global([...ONE_OF_EACH, brand("spotify.com", "streaming", { verification: ranked(rank) })]);

  it("ships an entry within the limit", () => {
    const source = withRank(RANK_LIMIT);
    expect(entriesOf(source)?.map((entry) => entry.domain)).toContain("spotify.com");
    expect(buildProtected([source]).leftOut).toEqual([]);
  });

  it.each([
    ["a rank past the limit", RANK_LIMIT + 1, `rank ${RANK_LIMIT + 1} is past ${RANK_LIMIT}`],
    ["a domain the ranking does not have", null, "not found in the ranking"],
    ["no rank recorded yet", "none" as const, "not found in the ranking"],
  ])("leaves out and names an entry with %s", (_name, rank, reason) => {
    const result = buildProtected([withRank(rank)]);
    expect(result.packs[0]?.entries.map((entry) => entry.domain)).not.toContain("spotify.com");
    expect(result.leftOut).toEqual([`global: spotify.com (spotify.com, ${reason})`]);
  });

  it("leaves out an alias past the limit and keeps its entity", () => {
    const entities = ONE_OF_EACH.map((entity) =>
      entity.domain === "microsoft.com"
        ? { ...entity, aliases: [{ domain: "live.com", verification: ranked(RANK_LIMIT + 5) }] }
        : entity,
    );
    const result = buildProtected([global(entities)]);
    const domains = result.packs[0]?.entries.map((entry) => entry.domain);
    expect(domains).toContain("microsoft.com");
    expect(domains).not.toContain("live.com");
    expect(result.leftOut[0]).toContain("live.com");
  });
});

describe("reading ranks", () => {
  const FILE = [
    "GlobalRank,TldRank,Domain,TLD,RefSubNets,RefIPs,IDN_Domain,IDN_TLD,PrevGlobalRank,PrevTldRank,PrevRefSubNets,PrevRefIPs",
    "1,1,google.com,com,503675,2165733,google.com,com,1,1,503473,2166267",
    "2,2,facebook.com,com,463021,2133240,facebook.com,com,2,2,462912,2133510",
    "37,30,paypal.com,com,1,1,paypal.com,com,37,30,1,1",
    "38,1,en.wikipedia.org,org,1,1,en.wikipedia.org,org,38,1,1,1",
    "150000,9,live.com,com,1,1,live.com,com,1,1,1,1",
    "",
  ];

  function read(wanted: string[]) {
    const reader = createRankReader(new Set(wanted));
    for (const line of FILE) reader.line(`${line}\r`);
    return reader.ranks;
  }

  it("keeps the rank of the wanted domains only", () => {
    expect([...read(["paypal.com", "facebook.com", "missing.example"])]).toEqual([
      ["facebook.com", 2],
      ["paypal.com", 37],
    ]);
  });

  it("fails on a file with another header", () => {
    const reader = createRankReader(new Set(["paypal.com"]));
    expect(() => reader.line("rank,domain")).toThrow(/unknown header/);
  });

  it("lists the domains a pack confirms by ranking", () => {
    const pack = global(
      ONE_OF_EACH.map((entity) =>
        entity.domain === "dhl.com" ? { ...entity, verification: visited } : entity,
      ),
    ).content;
    expect(rankedDomains(pack)).toContain("live.com");
    expect(rankedDomains(pack)).not.toContain("dhl.com");
  });

  it("writes rank and date, a null for a missing domain, and leaves other entries alone", () => {
    const pack = global([
      brand("paypal.com", "payments", { verification: ranked(999) }),
      brand("microsoft.com", "mail", {
        aliases: [{ domain: "live.com", verification: ranked(5) }],
      }),
      brand("dhl.com", "shipping", { verification: visited }),
    ]).content;
    const updated = applyRanks(
      pack,
      read(["paypal.com", "live.com", "microsoft.com"]),
      "majestic-million",
      "2026-12-01",
    );
    const [paypal, microsoft, dhl] = updated.entities;
    expect(paypal?.verification).toMatchObject({ rank: 37, checked: "2026-12-01" });
    expect(microsoft?.verification.rank).toBeNull();
    expect(microsoft?.aliases?.[0]?.verification.rank).toBe(150000);
    expect(dhl?.verification).toEqual(visited);
    expect(JSON.stringify(pack)).toContain('"rank":999');
  });
});
