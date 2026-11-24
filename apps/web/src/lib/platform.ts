export function isInstalled(view: Partial<Pick<Window, "matchMedia">> = window): boolean {
  return view.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

/** True on iPhone and iPad, including an iPad that presents itself as a Mac. */
export function isIos(agent: Pick<Navigator, "userAgent" | "maxTouchPoints"> = navigator): boolean {
  return (
    /iPad|iPhone|iPod/.test(agent.userAgent) ||
    (/Macintosh/.test(agent.userAgent) && agent.maxTouchPoints > 1)
  );
}
