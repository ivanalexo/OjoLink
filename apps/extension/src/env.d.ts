interface ImportMetaEnv {
  readonly WXT_RESOLVER_URL?: string;
  readonly [name: string]: unknown;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
