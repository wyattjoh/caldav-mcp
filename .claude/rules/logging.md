---
description: Output discipline, stderr only, never pollute stdio JSON-RPC
paths:
  - "src/**/*.ts"
alwaysApply: false
---

`console.log` is banned in `src/**`. On the stdio transport, `stdout` is the JSON-RPC channel, any stray byte corrupts it. Status messages go to stderr via `console.warn` or `console.error`.

- Bootstrap and diagnostic messages: `console.warn("caldav-mcp: …")`.
- Fatal errors before `process.exit`: `console.error("caldav-mcp: fatal: …")`.
- Request logging in HTTP mode goes through `src/util/log.ts` (added later) and always writes to stderr.

Secrets (passwords, tokens, encryption keys) are never logged in any form, including in error messages.
