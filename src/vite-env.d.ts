/// <reference types="vite/client" />

// Injected at build time by vite.config.ts (`define`), sourced from package.json `version`.
declare const __APP_VERSION__: string

// Build-time default for the monetization kill switch (VITE_MONETIZATION_ENABLED).
// `false` ships a free build: no paid tiers, no license gating, no upsells.
// Overridden at runtime by the `monetizationEnabled` setting and the server's
// GET /v1/config — see src/lib/monetization.ts.
declare const __MONETIZATION_ENABLED__: boolean
