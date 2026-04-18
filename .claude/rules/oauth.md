---
description: OAuth 2.1 endpoint discipline, PKCE, audience binding, token hashing
paths:
  - "src/oauth/**"
alwaysApply: false
---

Non-negotiable rules for the authorization server:

- **PKCE S256 only.** Reject any `/authorize` request that omits `code_challenge` or sets `code_challenge_method` to anything other than `S256`.
- **Audience binding.** The `resource` parameter must be present on `/authorize` and `/token`, must be persisted alongside the token, and must match `CALDAV_MCP_PUBLIC_URL` on every `/mcp` request.
- **Token storage.** Access and refresh tokens are stored as `sha256(token)` hashes. The plaintext token never touches disk or logs.
- **TTLs.** Auth codes expire in 60s. Access tokens in 3600s. Refresh tokens in 30 days and rotate on every use.
- **Redirect URIs.** Validate exact match against the registered set. Must be `https://` unless the host is `localhost`.
- **Rate limiting.** `POST /authorize` is gated by `src/oauth/rate-limit.ts` (5 attempts / 15 min per `ip|username`). Rejections return `429` with `Retry-After`.
- **401 response.** Every protected response must set `WWW-Authenticate: Bearer realm="caldav-mcp", resource_metadata="<base>/.well-known/oauth-protected-resource"`.

Secrets (passwords, tokens) are never logged. Log lines must go through a redacting helper or not include these fields at all.
