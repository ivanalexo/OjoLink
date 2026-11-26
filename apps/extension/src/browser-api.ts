import { browser } from "wxt/browser";
import type { OptionsApi } from "./options.ts";
import type { PopupApi } from "./popup.ts";
import type { SiteApi } from "./registration.ts";
import { CACHE_KEY, type RevealRequest, type SessionStore } from "./reveal-service.ts";
import { HOVER_SETTING } from "./settings.ts";
import { createPageStatus, createStatusResponder } from "./status.ts";
import type { PageCounts } from "./indicator.ts";
import { readUserDomains, USER_DOMAINS_KEY } from "./user-domains.ts";

async function grantedOrigins(): Promise<readonly string[]> {
  return (await browser.permissions.getAll()).origins ?? [];
}

export const siteApi: SiteApi = {
  grantedOrigins,
  async registeredIds() {
    return (await browser.scripting.getRegisteredContentScripts()).map((script) => script.id);
  },
  async register(scripts) {
    await browser.scripting.registerContentScripts(
      scripts.map((script) => ({ ...script, matches: [...script.matches], js: [...script.js] })),
    );
  },
  async unregister(ids) {
    await browser.scripting.unregisterContentScripts({ ids: [...ids] });
  },
};

export const sessionStore: SessionStore = {
  async read() {
    return (await browser.storage.session.get(CACHE_KEY))[CACHE_KEY];
  },
  async write(value) {
    await browser.storage.session.set({ [CACHE_KEY]: value });
  },
};

/** Sends a reveal request from the page script to the background. */
export function askBackground(message: RevealRequest): Promise<unknown> {
  return browser.runtime.sendMessage(message);
}

async function readHover(): Promise<boolean> {
  return (await browser.storage.local.get(HOVER_SETTING))[HOVER_SETTING] === true;
}

/** Follows the hover setting, so a change in the options page applies without a reload. */
export function watchHover(): () => boolean {
  let on = false;
  void readHover().then(
    (value) => {
      on = value;
    },
    () => undefined,
  );
  browser.storage.onChanged.addListener((changes, area) => {
    const change = changes[HOVER_SETTING];
    if (area === "local" && change) on = change.newValue === true;
  });
  return () => on;
}

async function storedUserDomains(): Promise<unknown> {
  return (await browser.storage.local.get(USER_DOMAINS_KEY))[USER_DOMAINS_KEY];
}

/** Gives the person's protected domains now and each time the panel changes them. */
export function watchUserDomains(onChange: (domains: readonly string[]) => void): void {
  void storedUserDomains().then(
    (stored) => onChange(readUserDomains(stored)),
    () => undefined,
  );
  browser.storage.onChanged.addListener((changes, area) => {
    const change = changes[USER_DOMAINS_KEY];
    if (area === "local" && change) onChange(readUserDomains(change.newValue));
  });
}

/** Lets the panel ask this tab's page script what it found. */
export function answerStatus(counts: () => PageCounts): void {
  const respond = createStatusResponder(browser.runtime.id, counts);
  browser.runtime.onMessage.addListener((message, sender, send) => {
    const answer = respond(message, sender.id);
    if (answer === null) return false;
    send(answer);
    return false;
  });
}

export const popupApi: PopupApi = {
  pageStatus: createPageStatus({
    async active() {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      return tab;
    },
    send: (tabId, message) => browser.tabs.sendMessage(tabId, message),
  }),
  userDomains: storedUserDomains,
  saveUserDomains: (domains) => browser.storage.local.set({ [USER_DOMAINS_KEY]: [...domains] }),
  grantedOrigins,
  openOptions: () => browser.runtime.openOptionsPage(),
};

export const optionsApi: OptionsApi = {
  grantedOrigins,
  request: (pattern) => browser.permissions.request({ origins: [pattern] }),
  remove: (pattern) => browser.permissions.remove({ origins: [pattern] }),
  revealOnHover: readHover,
  setRevealOnHover: (on) => browser.storage.local.set({ [HOVER_SETTING]: on }),
};
