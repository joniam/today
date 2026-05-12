/// <reference types="vite/client" />

declare const __BUILD_SHA__: string;
declare const __BUILD_TIME__: string;

// Minimal ambient type for the one node built-in used at build time.
// Avoids adding @types/node just for vite.config.ts.
declare module 'node:child_process' {
  export function execSync(
    command: string,
    options?: { stdio?: ReadonlyArray<'pipe' | 'ignore' | 'inherit'> }
  ): { toString(): string };
}
