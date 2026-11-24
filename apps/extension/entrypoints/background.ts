import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { siteApi } from "../src/browser-api.ts";
import { createSync } from "../src/registration.ts";

export default defineBackground(() => {
  const sync = createSync(siteApi);
  const run = (): void => {
    void sync().catch(() => undefined);
  };
  browser.runtime.onInstalled.addListener(run);
  browser.runtime.onStartup.addListener(run);
  browser.permissions.onAdded.addListener(run);
  browser.permissions.onRemoved.addListener(run);
});
