import { describe, expect, it } from "vitest";
import { checkTargets, evaluateSample, loadExceptions } from "../src/evaluate.ts";
import { folder, measured, sample } from "./helpers.ts";

const CYRILLIC_BCP = `b${String.fromCodePoint(0x0441, 0x0440)}.com.bo`;

describe("classifying one sample", () => {
  it.each([
    ["protected", "https://www.bcp.com.bo/", "safe", "correct"],
    ["general", "https://www.lostiempos.com/", "safe", "correct"],
    ["general", "https://usuario@example.net/", "caution", "false-positive"],
    ["idn", "https://yuriña.gob.bo/", "safe", "correct"],
    [
      "tracker",
      "https://example.us12.list-manage.com/track/click?u=1",
      "hidden-destination",
      "correct",
    ],
    ["shortener", "https://bit.ly/x", "hidden-destination", "correct"],
    ["shortener", "https://youtu.be/x", "safe", "correct"],
    ["hosting", "https://mi-portafolio.netlify.app/", "caution", "correct"],
    ["hosting", "https://microsoft-login.pages.dev/", "danger", "false-positive"],
    ["near-neighbour", "https://banco.com.bo/", "caution", "correct"],
  ])("legitimate %s sample %s gets %s: %s", (kind, input, level, outcome) => {
    const result = evaluateSample(sample("legitimate", kind, "uno", { input }));
    expect(result).toMatchObject({ level, outcome });
  });

  it.each([
    ["subdomain", "https://bcp.com.bo.example.net/", "danger", "correct"],
    ["typosquat", "https://bancosoll.com.bo/", "caution", "correct"],
    ["hidden-destination", "https://bit.ly/x", "hidden-destination", "correct"],
    ["subdomain", "https://example.org/banca", "safe", "miss"],
  ])("phishing %s sample %s gets %s: %s", (kind, input, level, outcome) => {
    const result = evaluateSample(sample("phishing", kind, "uno", { input }));
    expect(result).toMatchObject({ level, outcome });
  });

  it("reports an out-of-reach sample apart, whatever its level", () => {
    const result = evaluateSample(
      sample("phishing", "out-of-reach", "uno", {
        input: "https://example.org/",
        outOfReach: true,
      }),
    );
    expect(result).toMatchObject({ level: "safe", outcome: "out-of-reach" });
  });

  it("records the signals that triggered", () => {
    const result = evaluateSample(
      sample("phishing", "homograph", "uno", { input: `https://${CYRILLIC_BCP}/` }),
    );
    expect(result.signals).toEqual(["homograph/letters-many", "mixed-script/many"]);
    expect(result.score).toBe(100);
  });

  it("uses the sample's own list of user domains", () => {
    const input = "https://miempresa.com.bo.example.net/";
    expect(evaluateSample(sample("phishing", "subdomain", "sin", { input })).level).toBe("safe");
    expect(
      evaluateSample(
        sample("phishing", "subdomain", "con", { input, userDomains: ["miempresa.com.bo"] }),
      ).level,
    ).toBe("danger");
  });

  it("passes the link text to the engine", () => {
    const visibleText = `factura${String.fromCodePoint(0x202e)}fdp.exe`;
    const result = evaluateSample(
      sample("phishing", "invisible-characters", "uno", {
        input: "https://example.com/",
        visibleText,
      }),
    );
    expect(result.signals).toEqual(["invisible-characters/text-one"]);
  });

  it("requires the exact level when the sample states one", () => {
    const input = "https://bancosoll.com.bo/";
    const result = evaluateSample(
      sample("phishing", "typosquat", "uno", { input, expected: "danger" }),
    );
    expect(result.outcome).toBe("miss");
  });

  it("counts a link the engine cannot analyze as a wrong result", () => {
    const result = evaluateSample(
      sample("phishing", "subdomain", "uno", { input: "no es un enlace" }),
    );
    expect(result).toMatchObject({ level: "not-analyzed", outcome: "miss" });
  });

  it("leaves hosting pages and near-neighbour names out of the caution rate", () => {
    const counts = (kind: string) =>
      evaluateSample(sample("legitimate", kind, "uno")).countsTowardCaution;
    expect(["protected", "general", "idn", "tracker", "shortener"].every(counts)).toBe(true);
    expect(["hosting", "near-neighbour"].some(counts)).toBe(false);
  });
});

describe("accuracy targets", () => {
  const good = [
    ...Array.from({ length: 40 }, (_, index) =>
      measured("legitimate", "general", `g${index}`, "safe", "ok"),
    ),
    measured("legitimate", "protected", "banco", "safe", "ok"),
    measured("legitimate", "hosting", "blog", "caution", "ok", ["hosting/plain"]),
    ...Array.from({ length: 10 }, (_, index) =>
      measured("phishing", "subdomain", `p${index}`, "danger", "ok", ["subdomain/domain"]),
    ),
  ];

  it("passes when every target holds and reports the rates", () => {
    const result = checkTargets(good);
    expect(result.ok).toBe(true);
    expect(result.rates).toMatchObject({
      legitimate: 42,
      legitimateAtDanger: 0,
      cautionCounted: 41,
      cautionRate: 0,
      protectedTotal: 1,
      protectedSafe: 1,
      phishingCovered: 10,
      detectionRate: 1,
    });
  });

  it("fails on a legitimate sample at danger, naming the sample and its signals", () => {
    const result = checkTargets([
      ...good,
      measured("legitimate", "hosting", "notas", "danger", "fp", ["hosting/words"]),
    ]);
    expect(result.failures).toEqual([
      expect.stringMatching(/^Legitimate sample at danger: "notas".*hosting\/words/),
    ]);
  });

  it("fails on a protected page that is not safe", () => {
    const result = checkTargets([
      ...good,
      measured("legitimate", "protected", "otro-banco", "caution", "fp", ["typosquat/changed"]),
    ]);
    expect(result.failures).toContainEqual(
      expect.stringMatching(/^Protected page not safe: "otro-banco".*typosquat\/changed/),
    );
  });

  it("fails when more than 5% of the samples that count get caution, and reports the rate", () => {
    const marked = Array.from({ length: 3 }, (_, index) =>
      measured("legitimate", "general", `c${index}`, "caution", "fp", ["ip-host/public"]),
    );
    const exceptions = marked.map((item) => ({ id: item.sample.id, reason: "Accepted." }));
    const result = checkTargets([...good, ...marked], exceptions);
    expect(result.failures).toEqual([
      expect.stringMatching(/^Caution rate 6\.8% is over 5\.0%: 3 of 44.*"c0" \(ip-host\/public\)/),
    ]);
  });

  it("does not count caution on a hosting page toward the rate", () => {
    const pages = Array.from({ length: 30 }, (_, index) =>
      measured("legitimate", "hosting", `h${index}`, "caution", "ok", ["hosting/plain"]),
    );
    const result = checkTargets([...good, ...pages]);
    expect(result.ok).toBe(true);
    expect(result.rates.cautionMarked).toBe(0);
  });

  it("fails when fewer than 90% of covered phishing samples are detected", () => {
    const missed = Array.from({ length: 2 }, (_, index) =>
      measured("phishing", "typosquat", `m${index}`, "safe", "miss"),
    );
    const exceptions = missed.map((item) => ({ id: item.sample.id, reason: "Accepted." }));
    const result = checkTargets([...good, ...missed], exceptions);
    expect(result.failures).toEqual([
      expect.stringMatching(/^Detection rate 83\.3% is under 90\.0%: 10 of 12.*"m0", "m1"/),
    ]);
  });

  it("leaves out-of-reach samples out of the detection rate", () => {
    const far = {
      ...measured("phishing", "out-of-reach", "lejos", "safe", "ok"),
      outcome: "out-of-reach" as const,
    };
    const result = checkTargets([...good, { ...far, sample: { ...far.sample, outOfReach: true } }]);
    expect(result.ok).toBe(true);
    expect(result.rates).toMatchObject({ phishingCovered: 10, outOfReach: 1, detectionRate: 1 });
  });

  it("fails on a wrong result that is not an exception", () => {
    const result = checkTargets([
      ...good,
      measured("legitimate", "general", "marcada", "caution", "fp", ["credentials/plain"]),
      measured("phishing", "typosquat", "perdida", "safe", "miss"),
    ]);
    expect(result.failures).toEqual([
      expect.stringMatching(/^Wrong result with no exception: "marcada"/),
      expect.stringMatching(/^Phishing sample not detected: "perdida"/),
    ]);
  });
});

describe("accepted exceptions", () => {
  const notes = measured("legitimate", "hosting", "notas", "danger", "fp", ["hosting/words"]);
  const safe = measured("legitimate", "general", "normal", "safe", "ok");

  it("does not fail on a recorded exception and lists it", () => {
    const result = checkTargets(
      [safe, notes],
      [{ id: "notas", reason: "Brand beside a lure word." }],
    );
    expect(result.ok).toBe(true);
    expect(result.accepted.map((item) => item.sample.id)).toEqual(["notas"]);
  });

  it("does not allow an exception for a protected page", () => {
    const page = measured("legitimate", "protected", "banco", "caution", "fp", ["typosquat/two"]);
    const result = checkTargets([safe, page], [{ id: "banco", reason: "No." }]);
    expect(result.failures.slice(0, 2)).toEqual([
      expect.stringMatching(/^Exception "banco" is not allowed/),
      expect.stringMatching(/^Protected page not safe: "banco"/),
    ]);
  });

  it("fails on an exception whose sample is now correct", () => {
    const result = checkTargets([safe], [{ id: "normal", reason: "Old." }]);
    expect(result.failures).toEqual([
      'Exception "normal" no longer applies: the sample now gets safe; remove it',
    ]);
  });

  it("fails on an exception that names no sample", () => {
    const result = checkTargets([safe], [{ id: "nadie", reason: "Old." }]);
    expect(result.failures).toEqual([
      expect.stringContaining('"nadie" names a sample that is not in the corpus'),
    ]);
  });

  it("reads exceptions from the corpus folder and requires a reason", () => {
    expect(loadExceptions(folder({}))).toEqual([]);
    expect(loadExceptions(folder({ "exceptions.json": [{ id: "a", reason: "Why." }] }))).toEqual([
      { id: "a", reason: "Why." },
    ]);
    expect(() => loadExceptions(folder({ "exceptions.json": [{ id: "a" }] }))).toThrow(/reason/);
  });
});
