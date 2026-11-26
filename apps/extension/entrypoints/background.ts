import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { sessionStore, siteApi } from "../src/browser-api.ts";
import { createSync } from "../src/registration.ts";
import { createReveal } from "../src/reveal.ts";
import { createRevealService } from "../src/reveal-service.ts";
import { settings } from "../src/settings.ts";

export default defineBackground(() => {
  const sync = createSync(siteApi);
  const run = (): void => {
    void sync().catch(() => undefined);
  };
  browser.runtime.onInstalled.addListener(run);
  browser.runtime.onStartup.addListener(run);
  browser.permissions.onAdded.addListener(run);
  browser.permissions.onRemoved.addListener(run);

  const service = createRevealService(
    browser.runtime.id,
    createReveal(settings.resolver),
    sessionStore,
  );
  browser.runtime.onMessage.addListener((message, sender, respond) => {
    const answer = service.handle(message, sender.id);
    if (answer === null) return false;
    void answer.then(respond);
    return true;
  });
});
