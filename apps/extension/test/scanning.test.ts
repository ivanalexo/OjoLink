// @vitest-environment jsdom
import { analyze } from "@ojolink/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MARK_TAG } from "../src/marks.ts";
import { startPage, type Page } from "../src/page.ts";
import { createScanner, SLICE_MS, type Deadline } from "../src/scanner.ts";
import { TOOLTIP_TAG } from "../src/tooltip.ts";

const DANGER = "https://bcp.com.bo.verifica.net/";
const SHORT = "https://bit.ly/3xYz";
const SAFE = "https://www.lostiempos.com/";
const CAUTION = "https://netflix-codes.com/";

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
const observed = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A scheduler the test runs by hand. */
function manual() {
  const pending: ((deadline?: Deadline) => void)[] = [];
  return {
    schedule: (batch: (deadline?: Deadline) => void) => void pending.push(batch),
    run(deadline?: Deadline) {
      const batch = pending.shift();
      batch?.(deadline);
      return batch !== undefined;
    },
    drain() {
      for (let guard = 0; guard < 10_000 && this.run(); guard++);
    },
    get waiting() {
      return pending.length;
    },
  };
}

let page: Page | null = null;
function start(options: Parameters<typeof startPage>[1] = {}) {
  const control = manual();
  const started = startPage(document, { schedule: control.schedule, ...options });
  page = started;
  return { control, page: started };
}

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

afterEach(() => {
  page?.stop();
  page = null;
  for (const tip of document.querySelectorAll(TOOLTIP_TAG)) tip.remove();
  document.body.innerHTML = "";
});

describe("the page script", () => {
  it("marks the suspicious links of a message and leaves the others alone", () => {
    const [danger, safe, short, mail] = [
      link(DANGER),
      link(SAFE),
      link(SHORT),
      link("mailto:a@b.co"),
    ];
    message(danger, safe, short, mail);
    const { control, page: started } = start();
    control.drain();
    expect(marksIn()).toHaveLength(2);
    expect(started.marks.view(danger)?.label).toBe("Peligro");
    expect(started.marks.view(short)?.label).toBe("Destino oculto");
    expect(safe.nextSibling?.nodeName).not.toBe(MARK_TAG.toUpperCase());
  });

  it("marks a newsletter's tracking links as hidden destinations", () => {
    const tracking = link("https://click.list-manage.com/track/click?u=abc&id=def", "unsubscribe");
    message(tracking);
    const { control, page: started } = start();
    control.drain();
    expect(started.marks.view(tracking)?.label).toBe("Destino oculto");
  });

  it("finds links by being anchors, whatever the page's structure or class names", () => {
    document.body.innerHTML = `
      <table><tr><td class="xY3 a0"><span><a class="zz" href="${DANGER}">uno</a></span></td></tr></table>
      <section><ul><li><a href="${DANGER}"><img alt="dos"></a></li></ul></section>
      <a href="${DANGER}" style="display:block">tres</a>`;
    const { control } = start();
    control.drain();
    expect(marksIn()).toHaveLength(3);
  });

  it("analyzes a message the mail client adds later", async () => {
    const { control, page: started } = start();
    control.drain();
    const added = link(DANGER);
    message(added);
    await observed();
    control.drain();
    expect(started.marks.view(added)?.level).toBe("danger");
  });

  it("analyzes a link again when its address changes", async () => {
    const anchor = link(SAFE);
    message(anchor);
    const { control, page: started } = start();
    control.drain();
    expect(marksIn()).toHaveLength(0);

    anchor.setAttribute("href", DANGER);
    await observed();
    control.drain();
    expect(started.marks.view(anchor)?.level).toBe("danger");

    anchor.setAttribute("href", SAFE);
    await observed();
    control.drain();
    expect(marksIn()).toHaveLength(0);

    anchor.setAttribute("href", SHORT);
    await observed();
    control.drain();
    expect(marksIn()).toHaveLength(1);
    anchor.removeAttribute("href");
    await observed();
    control.drain();
    expect(marksIn()).toHaveLength(0);
  });

  it("queues nothing because of its own marks", async () => {
    message(link(DANGER), link(SHORT));
    const { control, page: started } = start();
    control.drain();
    await observed();
    expect(started.scanner.pending).toBe(0);
    expect(control.waiting).toBe(0);
  });

  it("restores marks when the mail client redraws a message", async () => {
    const box = message(link(DANGER), link(SAFE), link(SHORT));
    const { control } = start();
    control.drain();
    expect(marksIn()).toHaveLength(2);

    const copy = box.innerHTML;
    box.innerHTML = copy;
    await observed();
    control.drain();
    const marks = marksIn();
    expect(marks).toHaveLength(2);
    for (const mark of marks) expect(mark.previousSibling?.nodeName).toBe("A");
  });

  it("leaves no mark behind when a message is closed", async () => {
    const box = message(link(DANGER));
    const alone = link(DANGER);
    box.after(alone);
    const { control, page: started } = start();
    control.drain();
    expect(marksIn()).toHaveLength(2);
    box.remove();
    alone.remove();
    await observed();
    control.drain();
    expect(marksIn()).toHaveLength(0);
    expect(started.marks.count).toBe(0);
  });

  it("uses the engine once for an address that appears many times", () => {
    const calls: string[] = [];
    message(...Array.from({ length: 40 }, () => link(DANGER)));
    const { control } = start({
      analyze: (address, options) => {
        calls.push(address);
        return analyze(address, options);
      },
    });
    control.drain();
    expect(marksIn()).toHaveLength(40);
    expect(calls).toHaveLength(1);
  });

  it("puts no mark in a text the person is writing", async () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    document.body.append(editor);
    const { control } = start();
    editor.append(link(DANGER));
    editor.insertAdjacentHTML("beforeend", `<p>mira <a href="${SHORT}">esto</a></p>`);
    await observed();
    control.drain();
    expect(marksIn()).toHaveLength(0);
    expect(editor.innerHTML).not.toContain(MARK_TAG);
  });

  it("keeps the mark out of the text of a selection", () => {
    const box = message(link(DANGER, "mi banco"));
    const { control } = start();
    control.drain();
    const range = document.createRange();
    range.selectNodeContents(box);
    expect(range.toString()).toBe("Hola, entra aquí: mi banco y avisa.");
    expect(range.cloneContents().textContent).toBe("Hola, entra aquí: mi banco y avisa.");
  });

  it("does not change what a click on a marked link does", () => {
    const anchor = link(DANGER);
    message(anchor);
    const { control } = start();
    control.drain();
    const seen: boolean[] = [];
    anchor.addEventListener("click", (event) => {
      seen.push(event.defaultPrevented);
      event.preventDefault();
    });
    anchor.click();
    expect(seen).toEqual([false]);
  });

  it("keeps the mark visible against a message's styles", () => {
    const style = document.createElement("style");
    style.textContent = `a + * { display: none !important; visibility: hidden !important; opacity: 0 !important; }
      ${MARK_TAG} { display: none !important; position: absolute !important; left: -9999px !important; }`;
    document.head.append(style);
    message(link(DANGER));
    const { control } = start();
    control.drain();
    const computed = getComputedStyle(marksIn()[0] as Element);
    expect(computed.display).toBe("inline-block");
    expect(computed.visibility).toBe("visible");
    expect(computed.opacity).toBe("1");
    expect(computed.position).toBe("static");
  });

  it("shows the reason on pointer and on keyboard focus, and hides it when they leave", () => {
    const anchor = link(DANGER);
    message(anchor);
    const { control, page: started } = start();
    control.drain();
    const host = marksIn()[0] as HTMLElement;
    const reason = started.marks.view(anchor)?.reason;

    anchor.dispatchEvent(new Event("pointerenter"));
    expect(started.tooltip.content).toMatchObject({ level: "danger", label: "Peligro", reason });
    anchor.dispatchEvent(new Event("pointerleave"));
    expect(started.tooltip.visible).toBe(false);

    host.dispatchEvent(new Event("pointerenter"));
    expect(started.tooltip.visible).toBe(true);
    host.dispatchEvent(new Event("pointerleave"));

    anchor.dispatchEvent(new FocusEvent("focusin"));
    expect(started.tooltip.content?.reason).toBe(reason);
    anchor.dispatchEvent(new FocusEvent("focusout"));
    expect(started.tooltip.visible).toBe(false);
  });

  it("stops listening on a link once its mark is gone", async () => {
    const anchor = link(DANGER);
    message(anchor);
    const { control, page: started } = start();
    control.drain();
    anchor.setAttribute("href", SAFE);
    await observed();
    control.drain();
    anchor.dispatchEvent(new Event("pointerenter"));
    expect(started.tooltip.visible).toBe(false);
  });
});

describe("batches", () => {
  it("stops a batch at the slice and continues where it left off", () => {
    message(...Array.from({ length: 10 }, (_, index) => link(`https://e${index}.example.org/`)));
    let clock = 0;
    const handled: number[] = [];
    const control = manual();
    const seen: string[] = [];
    const scanner = createScanner(
      document,
      (anchor) => {
        seen.push(anchor.href);
        clock += 1;
      },
      () => undefined,
      {
        now: () => clock,
        schedule: control.schedule,
        onBatch: (_ms, count) => handled.push(count),
      },
    );
    scanner.start();
    expect(control.waiting).toBe(1);
    control.run();
    expect(handled).toEqual([SLICE_MS]);
    expect(scanner.pending).toBe(10 - SLICE_MS);
    control.drain();
    expect(handled).toEqual([3, 3, 3, 1]);
    expect(new Set(seen).size).toBe(10);
    scanner.stop();
  });

  it("yields when the page's idle time is over", () => {
    message(link(DANGER), link(SHORT), link(SAFE));
    const handled: number[] = [];
    const control = manual();
    const scanner = createScanner(
      document,
      () => undefined,
      () => undefined,
      {
        now: () => 0,
        schedule: control.schedule,
        onBatch: (_ms, count) => handled.push(count),
      },
    );
    scanner.start();
    control.run({ timeRemaining: () => 0 });
    expect(handled).toEqual([1]);
    control.run({ timeRemaining: () => 50 });
    expect(handled).toEqual([1, 2]);
    scanner.stop();
  });

  it("uses a timer where the browser has no idle callback", async () => {
    expect("requestIdleCallback" in window).toBe(false);
    message(link(DANGER));
    page = startPage(document);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(marksIn()).toHaveLength(1);
  });

  async function measure(count: number, sliceMs?: number): Promise<number[]> {
    const targets = [DANGER, SHORT, SAFE, CAUTION, "https://www.bcp.com.bo/"];
    document.body.innerHTML = Array.from(
      { length: count },
      (_, index) =>
        `<p>Linea ${index} <a href="${targets[index % targets.length]}p${index % 97}">enlace ${index % 13}</a></p>`,
    ).join("");
    const durations: number[] = [];
    await new Promise<void>((done) => {
      const started = startPage(document, {
        ...(sliceMs === undefined ? {} : { sliceMs }),
        schedule: (batch) => void setTimeout(batch, 0),
        onBatch: (ms) => {
          durations.push(ms);
          if (started.scanner.pending === 0) done();
        },
      });
      page = started;
    });
    return durations;
  }

  it("keeps every batch under 5 ms on a page of 5,000 links", async () => {
    const durations = await measure(5000);
    expect(marksIn().length).toBe(3000);
    expect(durations.length).toBeGreaterThan(20);
    const slow = durations.filter((ms) => ms >= 5);
    expect(slow, `slow batches: ${slow.map((ms) => ms.toFixed(1)).join(", ")}`).toEqual([]);
  }, 120_000);

  it("the budget check fails when a batch is allowed to run long", async () => {
    const durations = await measure(3000, 50);
    expect(durations.some((ms) => ms >= 5)).toBe(true);
  }, 120_000);
});
