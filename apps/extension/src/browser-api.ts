import { browser } from "wxt/browser";
import type { OptionsApi } from "./options.ts";
import type { SiteApi } from "./registration.ts";

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

export const optionsApi: OptionsApi = {
  grantedOrigins,
  request: (pattern) => browser.permissions.request({ origins: [pattern] }),
  remove: (pattern) => browser.permissions.remove({ origins: [pattern] }),
};
