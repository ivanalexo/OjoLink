import { defineContentScript } from "wxt/utils/define-content-script";
import { startPage } from "../src/page.ts";
import { DEFAULT_PATTERNS } from "../src/sites.ts";

export default defineContentScript({
  matches: [...DEFAULT_PATTERNS],
  runAt: "document_idle",
  main() {
    startPage(document);
  },
});
