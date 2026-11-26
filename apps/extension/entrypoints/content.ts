import { defineContentScript } from "wxt/utils/define-content-script";
import { answerStatus, askBackground, watchHover, watchUserDomains } from "../src/browser-api.ts";
import { startPage } from "../src/page.ts";
import { createPageReveal } from "../src/reveal-service.ts";
import { settings } from "../src/settings.ts";
import { DEFAULT_PATTERNS } from "../src/sites.ts";

export default defineContentScript({
  matches: [...DEFAULT_PATTERNS],
  runAt: "document_start",
  main(ctx) {
    const page = startPage(document, {
      userDomains: watchUserDomains,
      ...(settings.resolver === null
        ? {}
        : {
            reveal: createPageReveal(askBackground),
            privacyPolicy: settings.privacyPolicy,
            revealOnHover: watchHover(),
          }),
    });
    answerStatus(() => page.status());
    ctx.onInvalidated(() => page.stop());
  },
});
