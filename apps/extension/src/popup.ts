import { describeCounts, STATE_ICONS } from "./indicator.ts";
import { grantedHosts } from "./registration.ts";
import { settings as builtSettings, type Settings } from "./settings.ts";
import { DEFAULT_SITES } from "./sites.ts";
import type { PanelStatus } from "./status.ts";
import { fill, strings } from "./strings.ts";
import { addUserDomain, readUserDomains, removeUserDomain } from "./user-domains.ts";

const SVG = "http://www.w3.org/2000/svg";

/** The browser calls the panel needs, so tests can stand in for them. */
export interface PopupApi {
  pageStatus(): Promise<PanelStatus>;
  /** Whatever storage holds for the person's domains. It is validated before use. */
  userDomains(): Promise<unknown>;
  saveUserDomains(domains: readonly string[]): Promise<void>;
  grantedOrigins(): Promise<readonly string[]>;
  openOptions(): Promise<void>;
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

function icon(paths: readonly string[]): SVGElement {
  const svg = document.createElementNS(SVG, "svg");
  for (const [name, value] of Object.entries({
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  })) {
    svg.setAttribute(name, value);
  }
  for (const d of paths) {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

/** What the panel says about the page, and in which tone. */
export function describeStatus(status: PanelStatus): { tone: string; text: string } {
  if (status.kind === "reload") return { tone: "note", text: strings.popupReload };
  if (status.kind === "not-here") return { tone: "note", text: strings.popupNotHere };
  if (status.counts.checked === 0) return { tone: "note", text: strings.popupNoLinks };
  const { tone, text } = describeCounts(status.counts);
  return { tone, text };
}

/**
 * Builds the panel on the extension's icon: what OjoLink found on this page, the person's
 * own protected domains, where it works, and the donation link when the build has one.
 */
export function mountPopup(
  root: HTMLElement,
  api: PopupApi,
  settings: Settings = builtSettings,
): { refresh(): Promise<void> } {
  let domains: readonly string[] = [];

  const message = element("p", "", { role: "status", "aria-live": "polite", class: "message" });
  const say = (text: string): void => {
    message.textContent = text;
  };

  const page = element("p", strings.popupLooking, { class: "page", "data-tone": "note" });
  const addSite = element("button", strings.popupAddSite, { type: "button", class: "plain" });
  addSite.hidden = true;
  const manage = element("button", strings.popupManageSites, { type: "button", class: "plain" });
  const openOptions = (): void => {
    void api.openOptions().catch(() => say(strings.failed));
  };
  addSite.addEventListener("click", openOptions);
  manage.addEventListener("click", openOptions);

  const list = element("ul", undefined, { class: "domains" });
  const empty = element("p", strings.domainsEmpty, { class: "muted" });
  const input = element("input", undefined, {
    id: "domain",
    type: "text",
    inputmode: "url",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    "aria-describedby": "domain-hint",
  });
  const form = element("form", undefined, { novalidate: "" });
  const sites = element("ul", undefined, { class: "sites" });

  function drawDomains(): void {
    list.replaceChildren(
      ...domains.map((domain) => {
        const item = element("li");
        const remove = element("button", strings.removeButton, {
          type: "button",
          class: "plain",
          "aria-label": fill(strings.removeLabel, { host: domain }),
        });
        remove.addEventListener("click", () => {
          void save(removeUserDomain(domains, domain), fill(strings.domainRemoved, { domain }));
        });
        item.append(element("code", domain), remove);
        return item;
      }),
    );
    empty.hidden = domains.length > 0;
  }

  async function save(next: readonly string[], done: string): Promise<boolean> {
    try {
      await api.saveUserDomains(next);
    } catch {
      say(strings.failed);
      return false;
    }
    domains = next;
    drawDomains();
    say(done);
    return true;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const result = addUserDomain(domains, input.value);
    if (!result.ok) {
      say(strings.domainRejections[result.reason]);
      return;
    }
    void save(result.domains, fill(strings.domainAdded, { domain: result.domain })).then(
      (saved) => {
        if (saved) input.value = "";
      },
    );
  });

  async function refresh(): Promise<void> {
    const [status, stored, origins] = await Promise.all([
      api.pageStatus().catch((): PanelStatus => ({ kind: "not-here" })),
      api.userDomains().catch(() => []),
      api.grantedOrigins().catch(() => []),
    ]);
    const { tone, text } = describeStatus(status);
    page.dataset.tone = tone;
    page.replaceChildren(icon(STATE_ICONS[tone] ?? STATE_ICONS.note ?? []), element("span", text));
    addSite.hidden = status.kind !== "not-here";

    domains = readUserDomains(stored);
    drawDomains();

    sites.replaceChildren(
      ...[...DEFAULT_SITES, ...grantedHosts(origins)].map((host) => {
        const item = element("li");
        item.append(element("code", host));
        return item;
      }),
    );
  }

  form.append(
    element("label", strings.domainLabel, { for: "domain" }),
    element("p", strings.domainHint, { id: "domain-hint", class: "muted" }),
    input,
    element("button", strings.domainAdd, { type: "submit" }),
  );

  const state = element("section", undefined, { "aria-labelledby": "state-heading" });
  state.append(element("h2", strings.popupStateHeading, { id: "state-heading" }), page, addSite);
  const own = element("section", undefined, { "aria-labelledby": "domains-heading" });
  own.append(
    element("h2", strings.domainsHeading, { id: "domains-heading" }),
    element("p", strings.domainsIntro, { class: "muted" }),
    empty,
    list,
    form,
  );
  const where = element("section", undefined, { "aria-labelledby": "sites-heading" });
  where.append(element("h2", strings.popupSitesHeading, { id: "sites-heading" }), sites, manage);

  const parts: HTMLElement[] = [element("h1", strings.name), state, own, where];
  if (settings.donate !== null) {
    const donate = element("section", undefined, { class: "donate" });
    const text = element("p", `${strings.donateText} `);
    text.append(
      element("a", strings.donateLink, {
        href: settings.donate,
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    );
    donate.append(text);
    parts.push(donate);
  }
  root.replaceChildren(...parts, message);
  input.focus();
  return { refresh };
}
