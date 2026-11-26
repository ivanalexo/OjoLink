const MIDDLE_BUTTON = 1;

export interface Interceptor {
  stop(): void;
}

function isLink(node: EventTarget): node is HTMLAnchorElement {
  const element = node as Element;
  return element.nodeType === 1 && element.nodeName === "A" && element.hasAttribute("href");
}

function linkOf(event: Event): HTMLAnchorElement | null {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  for (const node of path) if (isLink(node)) return node;
  const target = event.target as Element | null;
  return typeof target?.closest === "function"
    ? target.closest<HTMLAnchorElement>("a[href]")
    : null;
}

/**
 * Sees every activation of a link before the page does. When `decide` answers for a link,
 * the activation is cancelled, the page's own handlers never run, and `onStop` gets the answer.
 */
export function createInterceptor<T>(
  view: Window,
  decide: (anchor: HTMLAnchorElement) => T | null,
  onStop: (anchor: HTMLAnchorElement, answer: T) => void,
): Interceptor {
  function handle(event: Event): void {
    const anchor = linkOf(event);
    if (!anchor) return;
    const answer = decide(anchor);
    if (answer === null) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onStop(anchor, answer);
  }

  const onClick = (event: Event): void => handle(event);
  const onAuxClick = (event: Event): void => {
    if ((event as MouseEvent).button === MIDDLE_BUTTON) handle(event);
  };

  view.addEventListener("click", onClick, true);
  view.addEventListener("auxclick", onAuxClick, true);

  return {
    stop() {
      view.removeEventListener("click", onClick, true);
      view.removeEventListener("auxclick", onAuxClick, true);
    },
  };
}
