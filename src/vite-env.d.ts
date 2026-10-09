/// <reference types="vite/client" />

/** Injected at build time by vite.config.ts (git short commit hash). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Set to "false" to reopen a closed site. Any other/absent value = closed. */
  readonly VITE_EVENT_CLOSED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}