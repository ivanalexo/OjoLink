import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { describeSelfCheck } from "../src/self-check.ts";
import { DEFAULT_PATTERNS } from "../src/sites.ts";

export default defineContentScript({
  matches: [...DEFAULT_PATTERNS],
  runAt: "document_idle",
  main() {
    // eslint-disable-next-line no-console
    console.debug(describeSelfCheck(browser.runtime.getManifest().version));
  },
});
