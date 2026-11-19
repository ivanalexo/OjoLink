/** The only platform APIs the engine may use: those shared by browsers, workers, and Node. */
declare class URLSearchParams {
  get(name: string): string | null;
}

declare class URL {
  constructor(url: string, base?: string);
  hostname: string;
  readonly href: string;
  readonly protocol: string;
  readonly pathname: string;
  readonly search: string;
  readonly searchParams: URLSearchParams;
}
