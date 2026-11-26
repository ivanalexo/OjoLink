import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";

/**
 * Takes the store screenshots from the real extension, on invented messages. It builds its
 * own copy of the package against a stand-in resolver on this machine, so nothing real is
 * contacted. Run `pnpm exec playwright-core install chromium` once, or point OJOLINK_CHROMIUM
 * at a Chromium that can load extensions.
 */
const root = process.cwd();
const SIZE = { width: 1280, height: 800 };
const PORT = 8792;
const BUILD = join(root, ".output", "screenshots-build");
const TARGET = join(root, "store", "screenshots");
const MAIL = "https://mail.google.com/mail/";

/** Everything shown is invented. The person's own bank here is a made-up domain. */
const OWN_DOMAIN = "bancoejemplo.com.bo";
const IMITATION = `https://${OWN_DOMAIN}.verifica-cuenta.net/ingresar`;
const SHORT = "https://bit.ly/aviso-2026";
const REVEALED = "https://www.diario-ejemplo.com/economia/nota";

const frame = (subject: string, sender: string, body: string): string => `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${subject}</title>
<style>
  body { margin: 0; font: 15px/1.6 "Segoe UI", Arial, sans-serif; color: #1f2933; background: #f3f5f8; }
  header { padding: 14px 28px; background: #ffffff; border-bottom: 1px solid #d8dee6; font-weight: 600; color: #52606d; }
  main { max-width: 760px; margin: 28px auto; padding: 28px 36px; background: #ffffff; border: 1px solid #d8dee6; border-radius: 12px; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  .from { margin: 0 0 22px; color: #616e7c; }
  .button { display: inline-block; padding: 10px 22px; border-radius: 8px; background: #1f4fbf; color: #ffffff; text-decoration: none; }
  footer { margin-top: 26px; padding-top: 14px; border-top: 1px solid #e4e8ee; color: #7b8794; font-size: 13px; }
</style></head>
<body><header>Correo de ejemplo</header>
<main><h1>${subject}</h1><p class="from">${sender}</p>${body}</main></body></html>`;

const MESSAGES = {
  marks: frame(
    "Aviso importante sobre tu cuenta",
    "De: Atención al cliente (remitente inventado)",
    `<p>Detectamos un acceso inusual. Para evitar la suspensión, confirma tus datos hoy:</p>
     <p><a id="imitacion" href="${IMITATION}">Ingresar a mi cuenta</a></p>
     <p>También puedes entrar desde <a id="texto" href="https://centro-de-ayuda-clientes.net/acceso">https://${OWN_DOMAIN}/acceso</a>.</p>
     <p>Revisa el comprobante: <a id="corto" href="${SHORT}">ver comprobante</a></p>
     <p>Nuestra tienda: <a id="tienda" href="https://ofertas-de-hoy.net/catalogo">www.tienda-ejemplo.com</a></p>
     <footer>Lee la noticia completa en <a id="normal" href="${REVEALED}">Diario Ejemplo</a>.</footer>`,
  ),
  warning: frame(
    "Tu cuenta será suspendida",
    "De: Seguridad (remitente inventado)",
    `<p>Por tu seguridad debes verificar tu identidad en las próximas 24 horas.</p>
     <p><a id="imitacion" class="button" href="${IMITATION}">Verificar ahora</a></p>
     <footer>Mensaje de ejemplo creado para mostrar OjoLink.</footer>`,
  ),
  reveal: frame(
    "Tu pedido está en camino",
    "De: Envíos (remitente inventado)",
    `<p>Sigue tu pedido en este enlace:</p>
     <p><a id="corto" href="${SHORT}">${SHORT.replace("https://", "")}</a></p>
     <footer>Mensaje de ejemplo creado para mostrar OjoLink.</footer>`,
  ),
};

function fail(message: string): never {
  process.stderr.write(`screenshots: ${message}\n`);
  process.exit(1);
}

function build(): void {
  rmSync(BUILD, { recursive: true, force: true });
  const env = {
    ...process.env,
    WXT_RESOLVER_URL: `http://127.0.0.1:${PORT}`,
    WXT_DONATE_URL: "",
    OJOLINK_OUT_DIR: BUILD,
  };
  const result = spawnSync("pnpm exec wxt build", {
    cwd: root,
    env,
    shell: true,
    stdio: "inherit",
  });
  if (result.status !== 0) fail("the extension could not be built");
}

/** Answers like the resolver, for the one short link of the test messages. */
function standIn() {
  const server = createServer((request, response) => {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };
    request.resume();
    request.on("end", () => {
      const answer = { status: "resolved", destination: REVEALED, hops: [SHORT] };
      response.writeHead(request.method === "OPTIONS" ? 204 : 200, headers);
      response.end(request.method === "OPTIONS" ? "" : JSON.stringify(answer));
    });
  });
  return new Promise<() => void>((resolve) => {
    server.listen(PORT, "127.0.0.1", () => resolve(() => void server.close()));
  });
}

async function open(context: BrowserContext, html: string): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize(SIZE);
  await page.route(`${MAIL}**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }),
  );
  await page.goto(MAIL);
  await page.waitForSelector("ojolink-status", { timeout: 15_000 });
  await page.waitForTimeout(600);
  return page;
}

async function main(): Promise<void> {
  build();
  mkdirSync(TARGET, { recursive: true });
  const stop = await standIn();
  const executablePath = process.env.OJOLINK_CHROMIUM;
  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "ojolink-")), {
    ...(executablePath ? { executablePath } : { channel: "chromium" }),
    headless: true,
    viewport: SIZE,
    locale: "es",
    args: [
      `--disable-extensions-except=${BUILD}/chrome-mv3`,
      `--load-extension=${BUILD}/chrome-mv3`,
    ],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const id = worker.url().split("/")[2] ?? "";
    await worker.evaluate(
      (domain) => chrome.storage.local.set({ userDomains: [domain] }),
      OWN_DOMAIN,
    );

    const marks = await open(context, MESSAGES.marks);
    await marks.hover("#texto");
    await marks.waitForTimeout(500);
    await marks.screenshot({ path: join(TARGET, "1-marcas.png") });

    const warning = await open(context, MESSAGES.warning);
    await warning.click("#imitacion");
    await warning.waitForTimeout(500);
    await warning.screenshot({ path: join(TARGET, "2-aviso.png") });
    await warning.close();

    const reveal = await open(context, MESSAGES.reveal);
    await reveal.click("#corto");
    await reveal.waitForTimeout(300);
    await reveal.keyboard.press("Enter");
    await reveal.waitForTimeout(1200);
    await reveal.screenshot({ path: join(TARGET, "3-revelar.png") });
    await reveal.close();

    // The panel reads the tab in front, so it is opened behind the message and shown over it.
    await marks.bringToFront();
    await worker.evaluate(
      (url) => chrome.tabs.create({ url, active: false }),
      `chrome-extension://${id}/popup.html`,
    );
    const panel =
      context.pages().find((page) => page.url().endsWith("/popup.html")) ??
      (await context.waitForEvent("page"));
    await panel.waitForSelector(".domains code", { timeout: 10_000 });
    await panel.setViewportSize({ width: 360, height: 600 });
    await panel.waitForTimeout(400);
    const picture = (await panel.screenshot()).toString("base64");
    await marks.mouse.move(5, 5);
    await marks.evaluate((data) => {
      const image = document.createElement("img");
      image.src = `data:image/png;base64,${data}`;
      image.alt = "";
      image.style.cssText =
        "position:fixed;top:12px;right:24px;width:360px;border-radius:10px;border:1px solid #c9d1dc;box-shadow:0 14px 40px rgb(0 0 0 / 35%);z-index:2147483000";
      document.body.append(image);
    }, picture);
    await marks.waitForTimeout(300);
    await marks.screenshot({ path: join(TARGET, "4-panel.png") });
  } finally {
    await context.close();
    stop();
    rmSync(BUILD, { recursive: true, force: true });
  }
  process.stdout.write(`Wrote 4 screenshots of ${SIZE.width}×${SIZE.height} to ${TARGET}\n`);
}

declare const chrome: {
  storage: { local: { set(values: Record<string, unknown>): Promise<void> } };
  tabs: { create(options: { url: string; active: boolean }): Promise<unknown> };
};

await main();
