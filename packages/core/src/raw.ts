export interface RawAuthority {
  readonly userInfo: string | null;
  readonly host: string;
  readonly rest: string;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const AUTHORITY_END = /[/\\?#]/;

/** Reads the user information and host of a link exactly as typed, before the browser rewrites them. */
export function rawAuthority(destination: string): RawAuthority {
  const text = destination.trim();
  const schemeLength = SCHEME.exec(text)?.[0].length ?? 0;
  const tail = text.slice(schemeLength);
  const end = tail.search(AUTHORITY_END);
  const authority = end === -1 ? tail : tail.slice(0, end);

  const at = authority.lastIndexOf("@");
  const userInfo = at === -1 ? null : authority.slice(0, at);
  let host = authority.slice(at + 1);
  if (host.startsWith("[")) {
    const close = host.indexOf("]");
    if (close !== -1) host = host.slice(0, close + 1);
  } else {
    host = host.replace(/:\d*$/, "");
  }

  const hostStart = schemeLength + at + 1;
  return { userInfo, host, rest: text.slice(0, hostStart) + text.slice(hostStart + host.length) };
}
