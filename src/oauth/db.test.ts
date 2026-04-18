import { test, expect } from "bun:test";
import { createDb } from "../db/index";
import {
  upsertAccount,
  loadAccount,
  insertClient,
  getClient,
  insertAuthCode,
  peekAuthCode,
  consumeAuthCode,
  insertAccessToken,
  validateAccessToken,
  revokeAccessToken,
  insertRefreshToken,
  lookupRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  sweepExpired,
} from "./db";

const KEY = new Uint8Array(32).fill(7);

// ---------------------------------------------------------------------------
// Account helpers
// ---------------------------------------------------------------------------

test("account upsert + load round-trip", () => {
  const db = createDb(":memory:");
  const id = upsertAccount(db, KEY, {
    username: "alice",
    serverUrl: "https://cal.example.com",
    password: "p1",
  });
  expect(typeof id).toBe("string");
  expect(id.length).toBeGreaterThan(0);
  const row = loadAccount(db, KEY, id);
  expect(row).toBeDefined();
  expect(row!.username).toBe("alice");
  expect(row!.serverUrl).toBe("https://cal.example.com");
  expect(row!.password).toBe("p1");
});

test("account upsert is idempotent on (username, serverUrl)", () => {
  const db = createDb(":memory:");
  const id1 = upsertAccount(db, KEY, {
    username: "alice",
    serverUrl: "https://cal.example.com",
    password: "p1",
  });
  const id2 = upsertAccount(db, KEY, {
    username: "alice",
    serverUrl: "https://cal.example.com",
    password: "p2",
  });
  expect(id2).toBe(id1);
  const row = loadAccount(db, KEY, id1);
  expect(row!.password).toBe("p2");
});

// ---------------------------------------------------------------------------
// Client helpers
// ---------------------------------------------------------------------------

test("client insert + get round-trips all fields", () => {
  const db = createDb(":memory:");
  const client = {
    clientId: "c1",
    clientName: "Test App",
    redirectUris: ["https://app.example.com/cb", "https://app.example.com/cb2"],
    scope: "caldav",
    clientUri: "https://app.example.com",
    logoUri: "https://app.example.com/logo.png",
    tokenEndpointAuthMethod: "none",
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
  };
  insertClient(db, client);
  const got = getClient(db, "c1");
  expect(got).toBeDefined();
  expect(got!.clientId).toBe("c1");
  expect(got!.clientName).toBe("Test App");
  expect(got!.redirectUris).toEqual(["https://app.example.com/cb", "https://app.example.com/cb2"]);
  expect(got!.scope).toBe("caldav");
  expect(got!.clientUri).toBe("https://app.example.com");
  expect(got!.logoUri).toBe("https://app.example.com/logo.png");
  expect(got!.tokenEndpointAuthMethod).toBe("none");
  expect(got!.grantTypes).toEqual(["authorization_code", "refresh_token"]);
  expect(got!.responseTypes).toEqual(["code"]);
});

test("getClient returns undefined for unknown id", () => {
  const db = createDb(":memory:");
  expect(getClient(db, "nope")).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Auth code helpers
// ---------------------------------------------------------------------------

test("auth code consume-once: insert, consume returns row, consume again returns undefined", () => {
  const db = createDb(":memory:");
  const now = () => 1_000_000;
  insertAuthCode(db, {
    code: "code-abc",
    clientId: "c1",
    accountId: "a1",
    redirectUri: "https://app.example.com/cb",
    codeChallenge: "challenge",
    resource: "https://res.example.com",
    scopes: ["read", "write"],
    expiresAt: now() + 60_000,
  });
  const first = consumeAuthCode(db, "code-abc", now);
  expect(first).toBeDefined();
  expect(first!.code).toBe("code-abc");
  expect(first!.clientId).toBe("c1");
  expect(first!.accountId).toBe("a1");
  expect(first!.scopes).toEqual(["read", "write"]);
  expect(first!.resource).toBe("https://res.example.com");
  const second = consumeAuthCode(db, "code-abc", now);
  expect(second).toBeUndefined();
});

test("auth code expiry: consumeAuthCode returns undefined for past expiresAt", () => {
  const db = createDb(":memory:");
  const base = 1_000_000;
  insertAuthCode(db, {
    code: "code-expired",
    clientId: "c1",
    accountId: "a1",
    redirectUri: "https://app.example.com/cb",
    codeChallenge: "challenge",
    expiresAt: base - 1,
  });
  const row = consumeAuthCode(db, "code-expired", () => base);
  expect(row).toBeUndefined();
});

test("peekAuthCode does not delete the row", () => {
  const db = createDb(":memory:");
  const now = () => 1_000_000;
  insertAuthCode(db, {
    code: "code-peek",
    clientId: "c1",
    accountId: "a1",
    redirectUri: "https://app.example.com/cb",
    codeChallenge: "challenge",
    expiresAt: now() + 60_000,
  });
  const peek1 = peekAuthCode(db, "code-peek", now);
  expect(peek1).toBeDefined();
  const peek2 = peekAuthCode(db, "code-peek", now);
  expect(peek2).toBeDefined();
  // consume still works after peeks
  const consumed = consumeAuthCode(db, "code-peek", now);
  expect(consumed).toBeDefined();
});

test("peekAuthCode returns undefined for expired code", () => {
  const db = createDb(":memory:");
  const base = 1_000_000;
  insertAuthCode(db, {
    code: "code-peek-exp",
    clientId: "c1",
    accountId: "a1",
    redirectUri: "https://app.example.com/cb",
    codeChallenge: "challenge",
    expiresAt: base - 1,
  });
  expect(peekAuthCode(db, "code-peek-exp", () => base)).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Access token helpers
// ---------------------------------------------------------------------------

test("access token validate + expiry", () => {
  const db = createDb(":memory:");
  let nowMs = 1_000_000;
  const now = () => nowMs;
  insertAccessToken(
    db,
    {
      token: "tok-at-1",
      clientId: "c1",
      accountId: "a1",
      scopes: ["read"],
      resource: "https://res.example.com",
      expiresAt: nowMs + 3600_000,
    },
    now,
  );
  const valid = validateAccessToken(db, "tok-at-1", now);
  expect(valid).toBeDefined();
  expect(valid!.clientId).toBe("c1");
  expect(valid!.accountId).toBe("a1");
  expect(valid!.scopes).toEqual(["read"]);
  expect(valid!.resource).toBe("https://res.example.com");
  nowMs += 3_600_001;
  const expired = validateAccessToken(db, "tok-at-1", now);
  expect(expired).toBeUndefined();
});

test("access token revoke: inserted token becomes invalid after revokeAccessToken", () => {
  const db = createDb(":memory:");
  const now = () => 1_000_000;
  insertAccessToken(
    db,
    {
      token: "tok-at-revoke",
      clientId: "c1",
      accountId: "a1",
      expiresAt: 1_000_000 + 3600_000,
    },
    now,
  );
  expect(validateAccessToken(db, "tok-at-revoke", now)).toBeDefined();
  revokeAccessToken(db, "tok-at-revoke");
  expect(validateAccessToken(db, "tok-at-revoke", now)).toBeUndefined();
});

// ---------------------------------------------------------------------------
// Refresh token helpers
// ---------------------------------------------------------------------------

test("refresh token rotation: rotateRefreshToken(old, new) returns binding; old is gone; new is found", () => {
  const db = createDb(":memory:");
  const now = () => 1_000_000;
  insertRefreshToken(db, {
    token: "rt-old",
    clientId: "c1",
    accountId: "a1",
    scopes: ["read"],
    resource: "https://res.example.com",
    expiresAt: 1_000_000 + 30 * 86400_000,
  });
  const binding = rotateRefreshToken(db, "rt-old", "rt-new", now);
  expect(binding).toBeDefined();
  expect(binding!.clientId).toBe("c1");
  expect(binding!.accountId).toBe("a1");
  expect(binding!.scopes).toEqual(["read"]);
  expect(binding!.resource).toBe("https://res.example.com");
  expect(lookupRefreshToken(db, "rt-old", now)).toBeUndefined();
  const newRow = lookupRefreshToken(db, "rt-new", now);
  expect(newRow).toBeDefined();
  expect(newRow!.clientId).toBe("c1");
});

test("refresh token rotation of unknown token returns undefined", () => {
  const db = createDb(":memory:");
  const now = () => 1_000_000;
  const result = rotateRefreshToken(db, "rt-nonexistent", "rt-new", now);
  expect(result).toBeUndefined();
});

test("refresh token revoke: revokeRefreshToken removes the token", () => {
  const db = createDb(":memory:");
  const now = () => 1_000_000;
  insertRefreshToken(db, {
    token: "rt-revoke",
    clientId: "c1",
    accountId: "a1",
    expiresAt: 1_000_000 + 30 * 86400_000,
  });
  expect(lookupRefreshToken(db, "rt-revoke", now)).toBeDefined();
  revokeRefreshToken(db, "rt-revoke");
  expect(lookupRefreshToken(db, "rt-revoke", now)).toBeUndefined();
});

test("lookupRefreshToken returns undefined for expired token", () => {
  const db = createDb(":memory:");
  const base = 1_000_000;
  insertRefreshToken(db, {
    token: "rt-expired",
    clientId: "c1",
    accountId: "a1",
    expiresAt: base - 1,
  });
  expect(lookupRefreshToken(db, "rt-expired", () => base)).toBeUndefined();
});

// ---------------------------------------------------------------------------
// sweepExpired
// ---------------------------------------------------------------------------

test("sweepExpired removes expired codes/tokens but not live ones", () => {
  const db = createDb(":memory:");
  const base = 1_000_000;

  // Insert one expired and one live auth code
  insertAuthCode(db, {
    code: "code-dead",
    clientId: "c1",
    accountId: "a1",
    redirectUri: "https://app.example.com/cb",
    codeChallenge: "ch",
    expiresAt: base - 1,
  });
  insertAuthCode(db, {
    code: "code-live",
    clientId: "c1",
    accountId: "a1",
    redirectUri: "https://app.example.com/cb",
    codeChallenge: "ch",
    expiresAt: base + 60_000,
  });

  // Insert one expired and one live access token
  insertAccessToken(
    db,
    { token: "at-dead", clientId: "c1", accountId: "a1", expiresAt: base - 1 },
    () => base,
  );
  insertAccessToken(
    db,
    { token: "at-live", clientId: "c1", accountId: "a1", expiresAt: base + 3600_000 },
    () => base,
  );

  // Insert one expired and one live refresh token
  insertRefreshToken(db, {
    token: "rt-dead",
    clientId: "c1",
    accountId: "a1",
    expiresAt: base - 1,
  });
  insertRefreshToken(db, {
    token: "rt-live",
    clientId: "c1",
    accountId: "a1",
    expiresAt: base + 30 * 86400_000,
  });

  sweepExpired(db, () => base);

  // Dead rows should be gone
  const codes = db.query<{ code: string }, []>("SELECT code FROM auth_codes").all();
  expect(codes.map((r) => r.code)).not.toContain("code-dead");
  expect(codes.map((r) => r.code)).toContain("code-live");

  const ats = db.query<{ token_hash: string }, []>("SELECT token_hash FROM access_tokens").all();
  expect(ats).toHaveLength(1);

  const rts = db.query<{ token_hash: string }, []>("SELECT token_hash FROM refresh_tokens").all();
  expect(rts).toHaveLength(1);
});
