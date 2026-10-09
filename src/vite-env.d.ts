/// <reference types="vite/client" />

/** Injected at build time by vite.config.ts (git short commit hash). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** "true" takes the whole site offline behind the EventClosed page. */
  readonly VITE_EVENT_CLOSED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}