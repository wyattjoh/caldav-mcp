import { createHmac, timingSafeEqual } from "node:crypto";

export type AuthorizeParamsSerialized = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource?: string;
  scopes?: string[];
  state?: string;
};

const DEFAULT_TTL_MS = 10 * 60_000;

export const signFlowState = (
  payload: AuthorizeParamsSerialized,
  key: Uint8Array,
  ttlMs: number = DEFAULT_TTL_MS,
): string => {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString(
    "base64url",
  );
  const sig = createHmac("sha256", Buffer.from(key)).update(body).digest("base64url");
  return `${body}.${sig}`;
};

export const verifyFlowState = (
  token: string,
  key: Uint8Array,
): AuthorizeParamsSerialized | undefined => {
  const [body, sig] = token.split(".");
  if (!body || !sig) return undefined;
  const expected = createHmac("sha256", Buffer.from(key)).update(body).digest();
  const received = Buffer.from(sig, "base64url");
  if (received.length !== expected.length) return undefined;
  if (!timingSafeEqual(expected, received)) return undefined;
  let parsed: { exp: number } & AuthorizeParamsSerialized;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
  if (parsed.exp <= Date.now()) return undefined;
  const { exp: _exp, ...rest } = parsed;
  return rest;
};

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );

export type LoginPageInput = {
  flowState: string;
  defaultServerUrl: string;
  error?: string;
};

export const renderLoginPage = (input: LoginPageInput): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>caldav-mcp login</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; max-width: 28rem; margin: 3rem auto; padding: 0 1rem; }
    label { display: block; margin-top: 1rem; font-weight: 600; }
    input { width: 100%; padding: 0.5rem; font-size: 1rem; box-sizing: border-box; }
    button { margin-top: 1.5rem; padding: 0.6rem 1rem; font-size: 1rem; cursor: pointer; }
    .error { color: #b00020; margin-top: 1rem; }
    .hint { color: #666; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>caldav-mcp</h1>
  <p>Log in with your CalDAV credentials (Fastmail app password).</p>
  <form method="POST" action="/authorize" autocomplete="off">
    <input type="hidden" name="flow_state" value="${escapeHtml(input.flowState)}">
    <label>CalDAV server URL
      <input name="server_url" value="${escapeHtml(input.defaultServerUrl)}" required>
    </label>
    <label>Username
      <input name="username" type="email" required autocomplete="off">
    </label>
    <label>App password
      <input name="password" type="password" required autocomplete="new-password">
    </label>
    ${input.error ? `<p class="error">${escapeHtml(input.error)}</p>` : ""}
    <button type="submit">Authorize</button>
  </form>
  <p class="hint">Your password is never stored in plaintext.</p>
</body>
</html>`;
