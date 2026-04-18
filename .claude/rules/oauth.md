---
description: OAuth 2.1 rules, use MCP SDK router, implement OAuthServerProvider hooks, never hand-roll endpoints
paths:
  - "src/oauth/**"
  - "src/transport/http.ts"
alwaysApply: false
---

The OAuth 2.1 authorization server is **not** hand-rolled. It comes from `@modelcontextprotocol/sdk`'s `server/auth/*` module, which we mount via `mcpAuthRouter` on our Express app. The SDK handles:

- RFC 8414 authorization server metadata (`.well-known/oauth-authorization-server`).
- RFC 9728 protected resource metadata (`.well-known/oauth-protected-resource`).
- RFC 7591 Dynamic Client Registration at `/register`.
- PKCE S256 validation.
- `/authorize`, `/token`, `/revoke` routing and argument parsing.
- RFC 8707 resource/audience handling.
- `WWW-Authenticate: Bearer resource_metadata=...` emission on 401.

**Our responsibility** is limited to the hooks the SDK exposes:

- `OAuthRegisteredClientsStore` (`src/oauth/clients-store.ts`): `getClient`, `registerClient` over `bun:sqlite`.
- `OAuthServerProvider` (`src/oauth/provider.ts`):
  - `authorize(client, params, res)` renders the CalDAV login form on GET and, on POST, verifies CalDAV credentials via `DAVClient.login()` (through an injected `verifyLogin` function), persists the encrypted credentials, issues an authorization code bound to `(clientId, accountId, codeChallenge, redirectUri, resource)`, and redirects.
  - `challengeForAuthorizationCode` returns the stored `code_challenge` so the SDK can validate PKCE.
  - `exchangeAuthorizationCode` consumes the code and issues access + refresh tokens.
  - `exchangeRefreshToken` rotates the refresh token and issues a new access token.
  - `verifyAccessToken` returns `AuthInfo` with `extra.accountId` so `/mcp` can load the decrypted CalDAV creds.
  - `revokeToken` honours `token_type_hint` for access vs refresh.

**Non-negotiable invariants** (enforced in our code, not the SDK):

- **Token storage.** Access and refresh tokens are stored as `sha256(token)` hashes, never plaintext. The SDK never sees the plaintext on storage, only on validation.
- **TTLs.** Auth codes 60s, access tokens 3600s, refresh tokens 30 days with rotation on every use.
- **Redirect URIs.** `registerClient` validates exact match: `https://` required unless host is `localhost`.
- **Rate limiting.** `provider.authorize()` POST path checks `src/oauth/rate-limit.ts` (5 attempts / 15 min per `ip|username`); rejects with 429 + `Retry-After`.
- **Allow-list.** `provider.authorize()` POST rejects unknown usernames when `CALDAV_MCP_ALLOWED_USERNAMES` is non-empty.
- **HTTPS-only redirects** at DCR time.

Never add a new OAuth endpoint by hand. If you think you need one, check whether the SDK already exposes it, then extend `OAuthServerProvider` or the clients store. Secrets (passwords, tokens, encryption keys) are never logged in any form.
