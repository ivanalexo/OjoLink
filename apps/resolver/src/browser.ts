import puppeteer, { type BrowserWorker } from "@cloudflare/puppeteer";
import type { DeepBrowser } from "./deep.ts";
import { isolatePage } from "./isolate.ts";

/** Applies the verdicts of deep.ts to a real browser. It decides nothing about addresses. */
export function edgeBrowser(binding: BrowserWorker): DeepBrowser {
  return {
    async open(url, onRequest) {
      const browser = await puppeteer.launch(binding);
      const close = (): Promise<void> => browser.close();
      try {
        const page = await browser.newPage();
        browser.on("targetcreated", (target) => {
          if (target.type() === "page") void close().catch(() => undefined);
        });
        const client = await page.createCDPSession();
        await client.send("Browser.setDownloadBehavior", { behavior: "deny" });
        await page.evaluateOnNewDocument(isolatePage);
        await page.setRequestInterception(true);
        page.on("request", (request) => {
          const verdict = onRequest({
            url: request.url(),
            navigation: request.isNavigationRequest() && request.frame() === page.mainFrame(),
            type: request.resourceType(),
          });
          const applied = verdict === "continue" ? request.continue() : request.abort();
          void applied.catch(() => undefined);
        });
        void page.goto(url).catch(() => undefined);
        return { close };
      } catch (error) {
        await close().catch(() => undefined);
        throw error;
      }
    },
  };
}
