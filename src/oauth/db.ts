import { createHash, randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import { encryptSecret, decryptSecret } from "../db/crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CaldavAccountRow = {
  id: string;
  username: string;
  serverUrl: string;
  password: string;
};

export type ClientRow = {
  clientId: string;
  clientName?: string;
  redirectUris: string[];
  scope?: string;
  clientUri?: string;
  logoUri?: string;
  tokenEndpointAuthMethod?: string;
  grantTypes?: string[];
  responseTypes?: string[];
};

export type AuthCodeRow = {
  code: string;
  clientId: string;
  accountId: string;
  redirectUri: string;
  codeChallenge: string;
  resource?: string;
  scopes?: string[];
};

export type AccessTokenRow = {
  clientId: string;
  accountId: string;
  scopes?: string[];
  resource?: string;
  expiresAt: number;
};

export type RefreshTokenRow = {
  clientId: string;
  accountId: string;
  scopes?: string[];
  resource?: string;
  expiresAt: number;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const sha256hex = (token: string): string => createHash("sha256").update(token).digest("hex");

const nowMs = (): number => Date.now();

// ---------------------------------------------------------------------------
// CalDAV accounts
// ---------------------------------------------------------------------------

export const upsertAccount = (
  db: Database,
  key: Uint8Array,
  input: { username: string; serverUrl: string; password: string },
  now: () => number = nowMs,
): string => {
  const existing = db
    .query<{ id: string }, [string, string]>(
      "SELECT id FROM caldav_accounts WHERE username = ? AND server_url = ?",
    )
    .get(input.username, input.serverUrl);

  if (existing) {
    const { ciphertext, nonce } = encryptSecret(input.password, key);
    db.query(
      "UPDATE caldav_accounts SET encrypted_password = ?, nonce = ?, updated_at = ? WHERE id = ?",
    ).run(ciphertext, nonce, now(), existing.id);
    return existing.id;
  }

  const id = randomUUID();
  const ts = now();
  const { ciphertext, nonce } = encryptSecret(input.password, key);
  db.query(
    "INSERT INTO caldav_accounts (id, username, server_url, encrypted_password, nonce, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, input.username, input.serverUrl, ciphertext, nonce, ts, ts);
  return id;
};

export const loadAccount = (
  db: Database,
  key: Uint8Array,
  id: string,
): CaldavAccountRow | undefined => {
  const row = db
    .query<
      {
        id: string;
        username: string;
        server_url: string;
        encrypted_password: Uint8Array;
        nonce: Uint8Array;
      },
      [string]
    >(
      "SELECT id, username, server_url, encrypted_password, nonce FROM caldav_accounts WHERE id = ?",
    )
    .get(id);

  if (!row) return undefined;

  const password = decryptSecret(row.encrypted_password, row.nonce, key);
  return { id: row.id, username: row.username, serverUrl: row.server_url, password };
};

// ---------------------------------------------------------------------------
// OAuth clients
// ---------------------------------------------------------------------------

export const insertClient = (db: Database, input: ClientRow, now: () => number = nowMs): void => {
  db.query(
    `INSERT INTO oauth_clients
       (client_id, client_name, redirect_uris, scope, client_uri, logo_uri,
        token_endpoint_auth_method, grant_types, response_types, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.clientId,
    input.clientName ?? null,
    JSON.stringify(input.redirectUris),
    input.scope ?? null,
    input.clientUri ?? null,
    input.logoUri ?? null,
    input.tokenEndpointAuthMethod ?? null,
    input.grantTypes ? JSON.stringify(input.grantTypes) : null,
    input.responseTypes ? JSON.stringify(input.responseTypes) : null,
    now(),
  );
};

export const getClient = (db: Database, clientId: string): ClientRow | undefined => {
  const row = db
    .query<
      {
        client_id: string;
        client_name: string | null;
        redirect_uris: string;
        scope: string | null;
        client_uri: string | null;
        logo_uri: string | null;
        token_endpoint_auth_method: string | null;
        grant_types: string | null;
        response_types: string | null;
      },
      [string]
    >(
      `SELECT client_id, client_name, redirect_uris, scope, client_uri, logo_uri,
              token_endpoint_auth_method, grant_types, response_types
       FROM oauth_clients WHERE client_id = ?`,
    )
    .get(clientId);

  if (!row) return undefined;

  return {
    clientId: row.client_id,
    clientName: row.client_name ?? undefined,
    redirectUris: JSON.parse(row.redirect_uris) as string[],
    scope: row.scope ?? undefined,
    clientUri: row.client_uri ?? undefined,
    logoUri: row.logo_uri ?? undefined,
    tokenEndpointAuthMethod: row.token_endpoint_auth_method ?? undefined,
    grantTypes: row.grant_types ? (JSON.parse(row.grant_types) as string[]) : undefined,
    responseTypes: row.response_types ? (JSON.parse(row.response_types) as string[]) : undefined,
  };
};

// ---------------------------------------------------------------------------
// Auth codes
// ---------------------------------------------------------------------------

export const insertAuthCode = (db: Database, input: AuthCodeRow & { expiresAt: number }): void => {
  db.query(
    `INSERT INTO auth_codes
       (code, client_id, account_id, redirect_uri, code_challenge, resource, scopes, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.code,
    input.clientId,
    input.accountId,
    input.redirectUri,
    input.codeChallenge,
    input.resource ?? null,
    input.scopes ? JSON.stringify(input.scopes) : null,
    input.expiresAt,
  );
};

const parseAuthCodeRow = (row: {
  code: string;
  client_id: string;
  account_id: string;
  redirect_uri: string;
  code_challenge: string;
  resource: string | null;
  scopes: string | null;
  expires_at: number;
}): AuthCodeRow & { expiresAt: number } => ({
  code: row.code,
  clientId: row.client_id,
  accountId: row.account_id,
  redirectUri: row.redirect_uri,
  codeChallenge: row.code_challenge,
  resource: row.resource ?? undefined,
  scopes: row.scopes ? (JSON.parse(row.scopes) as string[]) : undefined,
  expiresAt: row.expires_at,
});

type AuthCodeDbRow = {
  code: string;
  client_id: string;
  account_id: string;
  redirect_uri: string;
  code_challenge: string;
  resource: string | null;
  scopes: string | null;
  expires_at: number;
};

export const peekAuthCode = (
  db: Database,
  code: string,
  now: () => number = nowMs,
): AuthCodeRow | undefined => {
  const row = db
    .query<AuthCodeDbRow, [string]>(
      "SELECT code, client_id, account_id, redirect_uri, code_challenge, resource, scopes, expires_at FROM auth_codes WHERE code = ?",
    )
    .get(code);

  if (!row) return undefined;
  if (row.expires_at <= now()) return undefined;

  const { expiresAt: _expiresAt, ...authCodeRow } = parseAuthCodeRow(row);
  return authCodeRow;
};

export const consumeAuthCode = (
  db: Database,
  code: string,
  now: () => number = nowMs,
): AuthCodeRow | undefined => {
  const row = db
    .query<AuthCodeDbRow, [string]>(
      "SELECT code, client_id, account_id, redirect_uri, code_challenge, resource, scopes, expires_at FROM auth_codes WHERE code = ?",
    )
    .get(code);

  // Always delete the row to prevent replay attacks
  db.query("DELETE FROM auth_codes WHERE code = ?").run(code);

  if (!row) return undefined;
  if (row.expires_at <= now()) return undefined;

  const { expiresAt: _expiresAt, ...authCodeRow } = parseAuthCodeRow(row);
  return authCodeRow;
};

// ---------------------------------------------------------------------------
// Access tokens
// ---------------------------------------------------------------------------

export const insertAccessToken = (
  db: Database,
  input: {
    token: string;
    clientId: string;
    accountId: string;
    scopes?: string[];
    resource?: string;
    expiresAt: number;
  },
  now: () => number = nowMs,
): void => {
  const hash = sha256hex(input.token);
  db.query(
    `INSERT INTO access_tokens
       (token_hash, client_id, account_id, scopes, resource, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    hash,
    input.clientId,
    input.accountId,
    input.scopes ? JSON.stringify(input.scopes) : null,
    input.resource ?? null,
    input.expiresAt,
    now(),
  );
};

export const validateAccessToken = (
  db: Database,
  token: string,
  now: () => number = nowMs,
): AccessTokenRow | undefined => {
  const hash = sha256hex(token);
  const row = db
    .query<
      {
        client_id: string;
        account_id: string;
        scopes: string | null;
        resource: string | null;
        expires_at: number;
      },
      [string]
    >(
      "SELECT client_id, account_id, scopes, resource, expires_at FROM access_tokens WHERE token_hash = ?",
    )
    .get(hash);

  if (!row) return undefined;

  if (row.expires_at <= now()) {
    db.query("DELETE FROM access_tokens WHERE token_hash = ?").run(hash);
    return undefined;
  }

  return {
    clientId: row.client_id,
    accountId: row.account_id,
    scopes: row.scopes ? (JSON.parse(row.scopes) as string[]) : undefined,
    resource: row.resource ?? undefined,
    expiresAt: row.expires_at,
  };
};

export const revokeAccessToken = (db: Database, token: string): void => {
  db.query("DELETE FROM access_tokens WHERE token_hash = ?").run(sha256hex(token));
};

// ---------------------------------------------------------------------------
// Refresh tokens
// ---------------------------------------------------------------------------

export const insertRefreshToken = (
  db: Database,
  input: {
    token: string;
    clientId: string;
    accountId: string;
    scopes?: string[];
    resource?: string;
    expiresAt: number;
  },
): void => {
  const hash = sha256hex(input.token);
  db.query(
    `INSERT INTO refresh_tokens
       (token_hash, client_id, account_id, scopes, resource, expires_at, rotated_from)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  ).run(
    hash,
    input.clientId,
    input.accountId,
    input.scopes ? JSON.stringify(input.scopes) : null,
    input.resource ?? null,
    input.expiresAt,
  );
};

type RefreshTokenDbRow = {
  token_hash: string;
  client_id: string;
  account_id: string;
  scopes: string | null;
  resource: string | null;
  expires_at: number;
};

const parseRefreshTokenRow = (row: RefreshTokenDbRow): RefreshTokenRow => ({
  clientId: row.client_id,
  accountId: row.account_id,
  scopes: row.scopes ? (JSON.parse(row.scopes) as string[]) : undefined,
  resource: row.resource ?? undefined,
  expiresAt: row.expires_at,
});

export const lookupRefreshToken = (
  db: Database,
  token: string,
  now: () => number = nowMs,
): RefreshTokenRow | undefined => {
  const hash = sha256hex(token);
  const row = db
    .query<RefreshTokenDbRow, [string]>(
      "SELECT token_hash, client_id, account_id, scopes, resource, expires_at FROM refresh_tokens WHERE token_hash = ?",
    )
    .get(hash);

  if (!row) return undefined;

  if (row.expires_at <= now()) {
    db.query("DELETE FROM refresh_tokens WHERE token_hash = ?").run(hash);
    return undefined;
  }

  return parseRefreshTokenRow(row);
};

export const rotateRefreshToken = (
  db: Database,
  oldToken: string,
  newToken: string,
  now: () => number = nowMs,
): RefreshTokenRow | undefined => {
  const oldHash = sha256hex(oldToken);
  const newHash = sha256hex(newToken);

  return db.transaction((): RefreshTokenRow | undefined => {
    const row = db
      .query<RefreshTokenDbRow, [string]>(
        "SELECT token_hash, client_id, account_id, scopes, resource, expires_at FROM refresh_tokens WHERE token_hash = ?",
      )
      .get(oldHash);

    if (!row) return undefined;
    if (row.expires_at <= now()) {
      db.query("DELETE FROM refresh_tokens WHERE token_hash = ?").run(oldHash);
      return undefined;
    }

    db.query("DELETE FROM refresh_tokens WHERE token_hash = ?").run(oldHash);
    db.query(
      `INSERT INTO refresh_tokens
         (token_hash, client_id, account_id, scopes, resource, expires_at, rotated_from)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    ).run(newHash, row.client_id, row.account_id, row.scopes, row.resource, row.expires_at);

    return parseRefreshTokenRow(row);
  })();
};

export const revokeRefreshToken = (db: Database, token: string): void => {
  db.query("DELETE FROM refresh_tokens WHERE token_hash = ?").run(sha256hex(token));
};

// ---------------------------------------------------------------------------
// Sweep expired rows
// ---------------------------------------------------------------------------

export const sweepExpired = (db: Database, now: () => number = nowMs): void => {
  const ts = now();
  db.query("DELETE FROM auth_codes WHERE expires_at <= ?").run(ts);
  db.query("DELETE FROM access_tokens WHERE expires_at <= ?").run(ts);
  db.query("DELETE FROM refresh_tokens WHERE expires_at <= ?").run(ts);
};
