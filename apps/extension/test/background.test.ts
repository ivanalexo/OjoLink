import { beforeEach, describe, expect, it, vi } from "vitest";
import { REVEAL_MESSAGE } from "../src/reveal-service.ts";

type Listener = (
  message: unknown,
  sender: { id?: string },
  respond: (answer: unknown) => void,
) => boolean;

const state = vi.hoisted(() => ({
  listeners: [] as unknown[],
  session: {} as Record<string, unknown>,
}));

vi.mock("wxt/utils/define-background", () => ({
  defineBackground: (main: () => void) => ({ main }),
}));

vi.mock("wxt/browser", () => {
  const event = { addListener: () => undefined };
  return {
    browser: {
      runtime: {
        id: "abcdefghijklmnop",
        onInstalled: event,
        onStartup: event,
        onMessage: { addListener: (listener: unknown) => void state.listeners.push(listener) },
      },
      permissions: {
        onAdded: event,
        onRemoved: event,
        getAll: async () => ({ origins: [] }),
      },
      scripting: { getRegisteredContentScripts: async () => [] },
      storage: {
        session: {
          get: async (key: string) => ({ [key]: state.session[key] }),
          set: async (values: Record<string, unknown>) => void Object.assign(state.session, values),
        },
      },
    },
  };
});

async function listener(): Promise<Listener> {
  const { default: background } = await import("../entrypoints/background.ts");
  (background as unknown as { main(): void }).main();
  return state.listeners.at(-1) as Listener;
}

describe("the background's message listener", () => {
  beforeEach(() => {
    state.listeners.length = 0;
    state.session = {};
    vi.resetModules();
  });

  it("leaves messages that are not reveal requests to others", async () => {
    const listen = await listener();
    const respond = vi.fn();
    expect(listen({ type: "something-else" }, { id: "abcdefghijklmnop" }, respond)).toBe(false);
    expect(listen("text", { id: "abcdefghijklmnop" }, respond)).toBe(false);
    expect(respond).not.toHaveBeenCalled();
  });

  it("answers a reveal request, and in a package with no resolver the answer is unavailable", async () => {
    const listen = await listener();
    const sent = vi.fn();
    vi.stubGlobal("fetch", sent);
    const answer = await new Promise((resolve) => {
      const kept = listen(
        { type: REVEAL_MESSAGE, link: "https://bit.ly/3xYz" },
        { id: "abcdefghijklmnop" },
        resolve,
      );
      expect(kept).toBe(true);
    });
    expect(answer).toEqual({ kind: "failed", reason: "unavailable" });
    expect(sent).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("refuses a request from another sender", async () => {
    const listen = await listener();
    const answer = await new Promise((resolve) => {
      listen(
        { type: REVEAL_MESSAGE, link: "https://bit.ly/3xYz" },
        { id: "someone-else" },
        resolve,
      );
    });
    expect(answer).toEqual({ kind: "failed", reason: "error" });
  });
});
