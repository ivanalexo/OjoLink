import { contactable, isWeb, parseUrl } from "./allow.ts";
import type { Reason, Resolution } from "./hops.ts";
import { DEEP_CLOSE_WAIT_MS, DEEP_TIMEOUT_MS, MAX_REQUESTS } from "./limits.ts";

export interface PageRequest {
  url: string;
  navigation: boolean;
  type: string;
}

export type Verdict = "continue" | "abort";

export interface DeepSession {
  close(): Promise<void>;
}

export interface DeepBrowser {
  open(url: string, onRequest: (request: PageRequest) => Verdict): Promise<DeepSession>;
}

const NEVER_LOADED = new Set(["image", "media", "font", "stylesheet"]);

/**
 * Opens the last hop in a browser and stops every request the resolver would not send itself.
 * The first navigation that is stopped is the destination.
 */
export async function resolveDeep(
  reached: readonly string[],
  browser: DeepBrowser,
): Promise<Resolution> {
  const hops = [...reached];
  const start = hops.at(-1);
  if (start === undefined) return { status: "unresolved", reason: "deep-unavailable", hops };

  let finished = false;
  let settle: (answer: Resolution) => void = () => undefined;
  const outcome = new Promise<Resolution>((resolve) => {
    settle = resolve;
  });
  const finish = (answer: Resolution): void => {
    if (finished) return;
    finished = true;
    settle(answer);
  };
  const stop = (reason: Reason): void => finish({ status: "unresolved", reason, hops: [...hops] });

  const onRequest = (request: PageRequest): Verdict => {
    if (finished) return "abort";
    const url = parseUrl(request.url);
    if (!url || !contactable(url)) {
      if (!request.navigation) return "abort";
      if (url && isWeb(url)) {
        finish({ status: "resolved", destination: url.href, hops: [...hops], method: "headless" });
      } else {
        stop("unsupported-destination");
      }
      return "abort";
    }
    if (NEVER_LOADED.has(request.type)) return "abort";
    if (!request.navigation || url.href === hops.at(-1)) return "continue";
    if (hops.includes(url.href)) {
      stop("loop");
      return "abort";
    }
    if (hops.length >= MAX_REQUESTS) {
      stop("too-many-hops");
      return "abort";
    }
    hops.push(url.href);
    return "continue";
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, DEEP_TIMEOUT_MS);
  });
  void expired.then(() => stop("timeout"));

  const close = (session: DeepSession): Promise<void> => session.close().catch(() => undefined);
  let session: DeepSession | undefined;
  void browser.open(start, onRequest).then(
    (opened) => {
      if (finished) void close(opened);
      else session = opened;
    },
    () => stop("deep-unavailable"),
  );

  const answer = await outcome;
  clearTimeout(timer);
  if (session) {
    let wait: ReturnType<typeof setTimeout> | undefined;
    const patience = new Promise<void>((resolve) => {
      wait = setTimeout(resolve, DEEP_CLOSE_WAIT_MS);
    });
    await Promise.race([close(session), patience]);
    clearTimeout(wait);
  }
  return answer;
}
