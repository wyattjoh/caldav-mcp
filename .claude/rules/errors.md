---
description: Error handling — formatError, tool response envelope, OAuth error JSON
paths:
  - "src/**/*.ts"
alwaysApply: false
---

Use `formatError` from `src/util/errors.ts` to stringify thrown values.

Tool handlers catch and return errors as tool content, never throw:

```ts
try {
  // ...
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
} catch (error) {
  return { content: [{ type: "text", text: `Error listing calendars: ${formatError(error)}` }] };
}
```

OAuth endpoints return RFC 6749 error JSON with the correct HTTP status:

```ts
return c.json({ error: "invalid_request", error_description: "missing code_verifier" }, 400);
```

Valid `error` codes: `invalid_request`, `invalid_client`, `invalid_grant`, `unauthorized_client`, `unsupported_grant_type`, `invalid_scope`, `access_denied`, `server_error`, `temporarily_unavailable`, plus token-introspection codes (`invalid_token`, `insufficient_scope`) for resource server responses.
