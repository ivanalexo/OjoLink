interface PageScope {
  location: { href: string };
  navigator?: { serviceWorker?: object };
  addEventListener?: (type: string, listener: (event: unknown) => void, capture: boolean) => void;
}

/**
 * Runs inside the page before its scripts. Removes the ways a page can reach the network
 * without going through request interception: other transports, workers, and new windows.
 * It is sent to the browser as text, so it must not use anything defined outside itself.
 */
export function isolatePage(scope: PageScope = globalThis as unknown as PageScope): void {
  type Node = Record<string, unknown> & { setAttribute?: (name: string, value: string) => void };
  const fixed = (target: object, name: string, value: unknown): void => {
    try {
      Object.defineProperty(target, name, { value, writable: false, configurable: false });
    } catch {
      (target as Record<string, unknown>)[name] = value;
    }
  };
  const types = scope as unknown as Record<string, { prototype?: Record<string, unknown> }>;

  const blocked = [
    "WebSocket",
    "WebTransport",
    "RTCPeerConnection",
    "webkitRTCPeerConnection",
    "Worker",
    "SharedWorker",
  ];
  for (const name of blocked) fixed(scope, name, undefined);
  fixed(scope, "open", (url?: unknown) => {
    if (url !== undefined && url !== "") scope.location.href = String(url);
    return null;
  });
  const workers = scope.navigator?.serviceWorker;
  if (workers) fixed(workers, "register", () => Promise.reject(new Error("disabled")));

  const sameWindow = (node: unknown): void => {
    const element = node as Node | null;
    if (!element || typeof element.setAttribute !== "function") return;
    try {
      const tag = String(element.tagName).toUpperCase();
      if (tag === "A" || tag === "AREA" || tag === "FORM") element.setAttribute("target", "_self");
      if (tag === "BUTTON" || tag === "INPUT") {
        element.setAttribute("formtarget", "_self");
        sameWindow(element.form);
      }
    } catch {
      return;
    }
  };
  const sameWindowUp = (node: unknown): void => {
    for (let current = node as Node | null; current; current = current.parentNode as Node | null) {
      sameWindow(current);
    }
  };
  const guard = (type: string, method: string): void => {
    const prototype = types[type]?.prototype;
    const original = prototype?.[method];
    if (!prototype || typeof original !== "function") return;
    fixed(prototype, method, function (this: unknown, ...args: unknown[]) {
      sameWindowUp(this);
      sameWindow(args[0]);
      return original.apply(this, args);
    });
  };
  guard("HTMLElement", "click");
  guard("HTMLFormElement", "submit");
  guard("HTMLFormElement", "requestSubmit");
  guard("EventTarget", "dispatchEvent");
  for (const type of ["click", "auxclick", "submit"]) {
    scope.addEventListener?.(
      type,
      (event) => {
        const fired = event as { composedPath?: () => unknown[]; submitter?: unknown };
        for (const node of fired.composedPath?.() ?? []) sameWindow(node);
        sameWindow(fired.submitter);
      },
      true,
    );
  }
}
