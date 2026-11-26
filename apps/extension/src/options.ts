import { grantedHosts } from "./registration.ts";
import { settings as builtSettings, type Settings } from "./settings.ts";
import { checkSite, DEFAULT_SITES, toPattern } from "./sites.ts";
import { fill, strings } from "./strings.ts";

/** The browser calls the options page needs, so tests can stand in for them. */
export interface OptionsApi {
  grantedOrigins(): Promise<readonly string[]>;
  /** Shows the browser's prompt. Must be called from the person's action. */
  request(pattern: string): Promise<boolean>;
  remove(pattern: string): Promise<boolean>;
  /** Whether a hidden destination is revealed when the pointer rests on its link. */
  revealOnHover(): Promise<boolean>;
  setRevealOnHover(on: boolean): Promise<void>;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  attributes: Readonly<Record<string, string>> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

/**
 * Builds the page where the person adds and removes the sites OjoLink runs on, reads what
 * leaves the device, and turns revealing on hover on or off.
 */
export function mountOptions(
  root: HTMLElement,
  api: OptionsApi,
  settings: Settings = builtSettings,
): { refresh(): Promise<void> } {
  const status = element("p", "", { role: "status", "aria-live": "polite", class: "status" });
  const list = element("ul", undefined, { class: "sites" });
  const empty = element("p", strings.grantedEmpty, { class: "muted" });
  const input = element("input", undefined, {
    id: "site",
    type: "text",
    inputmode: "url",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    "aria-describedby": "site-hint",
  });
  const form = element("form", undefined, { novalidate: "" });

  const say = (text: string): void => {
    status.textContent = text;
  };

  const hover = element("input", undefined, {
    id: "hover",
    type: "checkbox",
    "aria-describedby": "hover-hint",
  });
  hover.addEventListener("change", () => {
    const wanted = hover.checked;
    void api.setRevealOnHover(wanted).then(
      () => say(strings.hoverSaved),
      () => {
        hover.checked = !wanted;
        say(strings.failed);
      },
    );
  });

  async function refresh(): Promise<void> {
    hover.checked = await api.revealOnHover().catch(() => false);
    const hosts = grantedHosts(await api.grantedOrigins());
    list.replaceChildren(
      ...hosts.map((host) => {
        const item = element("li");
        const remove = element("button", strings.removeButton, {
          type: "button",
          "aria-label": fill(strings.removeLabel, { host }),
        });
        remove.addEventListener("click", () => {
          void api.remove(toPattern(host)).then(
            async (removed) => {
              say(removed ? fill(strings.removed, { host }) : strings.failed);
              await refresh();
            },
            () => say(strings.failed),
          );
        });
        item.append(element("code", host), remove);
        return item;
      }),
    );
    empty.hidden = hosts.length > 0;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const site = checkSite(input.value);
    if (!site.ok) {
      say(strings.rejections[site.reason]);
      return;
    }
    void api.request(site.pattern).then(
      async (granted) => {
        say(fill(granted ? strings.added : strings.dismissed, { host: site.host }));
        if (granted) input.value = "";
        await refresh();
      },
      () => say(strings.failed),
    );
  });

  const defaults = element("ul", undefined, { class: "sites" });
  defaults.append(
    ...DEFAULT_SITES.map((host) => {
      const item = element("li");
      item.append(element("code", host));
      return item;
    }),
  );

  function privacy(): HTMLElement[] {
    const heading = element("h2", strings.privacyHeading);
    if (settings.resolver === null || settings.privacyPolicy === null) {
      return [heading, element("p", strings.privacyNoResolver, { class: "privacy" })];
    }
    const text = element("p", `${strings.privacyReveal} `, { class: "privacy" });
    text.append(
      element("a", strings.privacyPolicy, {
        href: settings.privacyPolicy,
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    );
    const choice = element("p", undefined, { class: "choice" });
    choice.append(hover, element("label", strings.hoverLabel, { for: "hover" }));
    return [
      heading,
      text,
      choice,
      element("p", strings.hoverHint, { id: "hover-hint", class: "muted" }),
    ];
  }

  form.append(
    element("label", strings.addLabel, { for: "site" }),
    element("p", strings.addHint, { id: "site-hint", class: "muted" }),
    input,
    element("button", strings.addButton, { type: "submit" }),
  );
  root.replaceChildren(
    element("h1", strings.optionsTitle),
    element("h2", strings.defaultHeading),
    element("p", strings.defaultIntro, { class: "muted" }),
    defaults,
    element("h2", strings.grantedHeading),
    empty,
    list,
    form,
    ...privacy(),
    status,
  );
  return { refresh };
}
