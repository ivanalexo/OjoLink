import { describe, expect, it } from "vitest";
import {
  createSync,
  grantedHosts,
  PAGE_SCRIPT,
  reconcile,
  SCRIPT_PREFIX,
  type PageScript,
  type SiteApi,
} from "../src/registration.ts";
import {
  checkSite,
  DEFAULT_PATTERNS,
  DEFAULT_SITES,
  hostOfPattern,
  toPattern,
} from "../src/sites.ts";

describe("default sites", () => {
  it("are the three webmail sites of the requirements", () => {
    expect(DEFAULT_SITES).toEqual(["mail.google.com", "outlook.office.com", "outlook.live.com"]);
    expect(DEFAULT_PATTERNS).toEqual([
      "https://mail.google.com/*",
      "https://outlook.office.com/*",
      "https://outlook.live.com/*",
    ]);
  });
});

describe("a site typed by the person", () => {
  it.each([
    ["mail.proton.me", "mail.proton.me"],
    ["  Mail.Proton.me  ", "mail.proton.me"],
    ["https://mail.proton.me", "mail.proton.me"],
    ["https://mail.proton.me/u/0/inbox?x=1#y", "mail.proton.me"],
    ["webmail.miempresa.com.bo/roundcube", "webmail.miempresa.com.bo"],
    ["correo.ñandú.bo", "correo.xn--and-6ma2c.bo"],
  ])("accepts %j as one https site", (input, host) => {
    expect(checkSite(input)).toEqual({ ok: true, host, pattern: `https://${host}/*` });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["*.proton.me", "wildcard"],
    ["https://*/*", "wildcard"],
    ["http://mail.proton.me", "not-https"],
    ["ftp://mail.proton.me", "not-https"],
    ["file:///C:/correo.html", "not-https"],
    ["chrome://extensions", "not-https"],
    ["mail.proton.me:8443", "port"],
    ["https://mail.proton.me:8443/", "port"],
    ["192.168.1.10", "ip-address"],
    ["https://[::1]/", "ip-address"],
    ["localhost", "not-a-host"],
    ["correo", "not-a-host"],
    ["mi correo.com", "not-a-host"],
    ["https://user:clave@mail.proton.me", "not-a-host"],
    ["mail.google.com", "default-site"],
    ["https://outlook.live.com/mail/0/", "default-site"],
  ])("rejects %j as %s", (input, reason) => {
    expect(checkSite(input)).toEqual({ ok: false, reason });
  });

  it("reads the host of a one-site pattern only", () => {
    expect(hostOfPattern("https://mail.proton.me/*")).toBe("mail.proton.me");
    expect(hostOfPattern(toPattern("a.example.org"))).toBe("a.example.org");
    for (const pattern of [
      "https://*/*",
      "<all_urls>",
      "http://a.example/*",
      "https://*.a.org/*",
    ]) {
      expect(hostOfPattern(pattern), pattern).toBeNull();
    }
  });
});

describe("page scripts follow the granted sites", () => {
  const id = (host: string) => `${SCRIPT_PREFIX}${host}`;
  const origins = (...hosts: string[]) => [...DEFAULT_PATTERNS, ...hosts.map(toPattern)];

  it("leaves the default sites to the manifest", () => {
    expect(grantedHosts(DEFAULT_PATTERNS)).toEqual([]);
    expect(reconcile(DEFAULT_PATTERNS, [])).toEqual({ register: [], unregister: [] });
  });

  it("registers a newly granted site, for that site alone", () => {
    const plan = reconcile(origins("mail.proton.me"), []);
    expect(plan.unregister).toEqual([]);
    expect(plan.register).toEqual([
      {
        id: id("mail.proton.me"),
        matches: ["https://mail.proton.me/*"],
        js: [PAGE_SCRIPT],
        runAt: "document_idle",
        persistAcrossSessions: true,
      },
    ]);
  });

  it("unregisters a withdrawn site", () => {
    expect(reconcile(DEFAULT_PATTERNS, [id("mail.proton.me")])).toEqual({
      register: [],
      unregister: [id("mail.proton.me")],
    });
  });

  it("does nothing when both already agree", () => {
    expect(reconcile(origins("mail.proton.me"), [id("mail.proton.me")])).toEqual({
      register: [],
      unregister: [],
    });
  });

  it("removes a registration left over with no grant and leaves foreign ones alone", () => {
    const plan = reconcile(origins("a.example.org"), [id("b.example.org"), "otra-extension"]);
    expect(plan.unregister).toEqual([id("b.example.org")]);
    expect(plan.register.map((script) => script.id)).toEqual([id("a.example.org")]);
  });

  it("never registers a broad pattern, even if the browser reports one", () => {
    const plan = reconcile(
      [...DEFAULT_PATTERNS, "https://*/*", "<all_urls>", "http://a.org/*"],
      [],
    );
    expect(plan.register).toEqual([]);
  });
});

describe("keeping registrations up to date", () => {
  function fake(granted: string[], registered: string[] = []) {
    const state = { granted: [...DEFAULT_PATTERNS, ...granted.map(toPattern)], registered };
    const calls: string[] = [];
    const api: SiteApi = {
      grantedOrigins: async () => state.granted,
      registeredIds: async () => state.registered,
      register: async (scripts: readonly PageScript[]) => {
        calls.push(`register ${scripts.map((script) => script.id).join(",")}`);
        for (const script of scripts) {
          if (state.registered.includes(script.id)) throw new Error("Duplicate script ID");
          state.registered.push(script.id);
        }
      },
      unregister: async (ids: readonly string[]) => {
        calls.push(`unregister ${ids.join(",")}`);
        state.registered = state.registered.filter((item) => !ids.includes(item));
      },
    };
    return { state, calls, api };
  }

  it("registers the page script after a grant", async () => {
    const { state, api } = fake(["mail.proton.me"]);
    await createSync(api)();
    expect(state.registered).toEqual([`${SCRIPT_PREFIX}mail.proton.me`]);
  });

  it("unregisters it after the grant is withdrawn", async () => {
    const { state, api } = fake(["mail.proton.me"]);
    const sync = createSync(api);
    await sync();
    state.granted = [...DEFAULT_PATTERNS];
    await sync();
    expect(state.registered).toEqual([]);
  });

  it("creates it again on start when it was missing", async () => {
    const { state, calls, api } = fake(["mail.proton.me"], []);
    await createSync(api)();
    expect(calls).toEqual([`register ${SCRIPT_PREFIX}mail.proton.me`]);
    expect(state.registered).toHaveLength(1);
  });

  it("makes no browser call when there is nothing to do", async () => {
    const { calls, api } = fake(["mail.proton.me"], [`${SCRIPT_PREFIX}mail.proton.me`]);
    await createSync(api)();
    expect(calls).toEqual([]);
  });

  it("runs one at a time, so two events at once do not register twice", async () => {
    const { state, calls, api } = fake(["mail.proton.me"]);
    const sync = createSync(api);
    await Promise.all([sync(), sync(), sync()]);
    expect(calls).toEqual([`register ${SCRIPT_PREFIX}mail.proton.me`]);
    expect(state.registered).toHaveLength(1);
  });

  it("keeps working after a failed run", async () => {
    const { state, api } = fake(["mail.proton.me"]);
    let fail = true;
    const flaky: SiteApi = {
      ...api,
      grantedOrigins: async () => {
        if (fail) throw new Error("not ready");
        return state.granted;
      },
    };
    const sync = createSync(flaky);
    await expect(sync()).rejects.toThrow("not ready");
    fail = false;
    await sync();
    expect(state.registered).toHaveLength(1);
  });
});
