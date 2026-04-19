import { test, expect, describe } from "bun:test";
import type { Request } from "express";
import { createDb } from "../db/index";
import { createProvider, type VerifyLogin } from "./provider";
import { createRateLimiter } from "./rate-limit";
import { signFlowState } from "./login-page";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FakeRes = {
  req: Partial<Request>;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  location: string;
  setHeader(k: string, v: string): FakeRes;
  status(c: number): FakeRes;
  send(b: string): FakeRes;
  redirect(c: number, url: string): FakeRes;
};

const fakeRes = (init: {
  method: "GET" | "POST";
  body?: Record<string, string>;
  remoteAddress?: string;
}): FakeRes => {
  const res = {
    req: {
      method: init.method,
      body: init.body,
      headers: {},
      socket: { remoteAddress: init.remoteAddress ?? "127.0.0.1" } as unknown,
    } as unknown,
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: "",
    location: "",
  } as FakeRes;
  res.setHeader = (k: string, v: string) => {
    res.headers[k.toLowerCase()] = v;
    return res;
  };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.send = (b: string) => {
    res.body = String(b);
    return res;
  };
  res.redirect = (c: number, url: string) => {
    res.statusCode = c;
    res.location = url;
    return res;
  };
  return res;
};

const ENCRYPTION_KEY = new Uint8Array(32).fill(1);
const FLOW_KEY = new Uint8Array(32).fill(2);

const okVerify: VerifyLogin = async () => {};
const failVerify: VerifyLogin = async () => {
  throw new Error("bad creds");
};

const TEST_CLIENT: OAuthClientInformationFull = {
  client_id: "test-client-id",
  redirect_uris: ["https://client.example.com/callback"],
};

const makeProvider = (opts?: {
  verifyLogin?: VerifyLogin;
  allowedUsernames?: string[];
  now?: () => number;
}) => {
  const db = createDb(":memory:");
  const rateLimiter = createRateLimiter({ limit: 5, windowMs: 15 * 60_000 });
  const provider = createProvider({
    db,
    encryptionKey: ENCRYPTION_KEY,
    flowKey: FLOW_KEY,
    defaultServerUrl: "https://caldav.example.com",
    allowedUsernames: opts?.allowedUsernames ?? [],
    verifyLogin: opts?.verifyLogin ?? okVerify,
    rateLimiter,
    now: opts?.now,
  });
  return { db, provider };
};

const makeFlowState = (overrides?: Partial<Parameters<typeof signFlowState>[0]>): string =>
  signFlowState(
    {
      clientId: TEST_CLIENT.client_id,
      redirectUri: "https://client.example.com/callback",
      codeChallenge: "abc123challenge",
      state: "mystate",
      ...overrides,
    },
    FLOW_KEY,
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("authorize GET", () => {
  test("renders HTML with flow_state", async () => {
    const { provider } = makeProvider();
    const res = fakeRes({ method: "GET" });
    await provider.authorize(
      TEST_CLIENT,
      {
        codeChallenge: "abc123",
        redirectUri: "https://client.example.com/callback",
      },
      res as unknown as import("express").Response,
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain('name="flow_state"');
    expect(res.body).toContain("value=");
  });
});

describe("authorize POST", () => {
  test("valid flow and stubbed verifyLogin => 302 redirect with code and state", async () => {
    const { provider } = makeProvider();
    const flowState = makeFlowState();
    const res = fakeRes({
      method: "POST",
      body: {
        flow_state: flowState,
        username: "alice@example.com",
        password: "secret",
        server_url: "https://caldav.example.com",
      },
    });
    await provider.authorize(
      TEST_CLIENT,
      {
        codeChallenge: "abc123",
        redirectUri: "https://client.example.com/callback",
      },
      res as unknown as import("express").Response,
    );

    expect(res.statusCode).toBe(302);
    expect(res.location).toContain("code=");
    expect(res.location).toContain("state=mystate");
    const u = new URL(res.location);
    expect(u.searchParams.get("code")).toBeTruthy();
  });

  test("tampered flow_state => 400", async () => {
    const { provider } = makeProvider();
    const res = fakeRes({
      method: "POST",
      body: {
        flow_state: "totally.invalid",
        username: "alice@example.com",
        password: "secret",
      },
    });
    await provider.authorize(
      TEST_CLIENT,
      {
        codeChallenge: "abc123",
        redirectUri: "https://client.example.com/callback",
      },
      res as unknown as import("express").Response,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("expired");
  });

  test("verifyLogin rejects => re-renders login page with error", async () => {
    const { provider } = makeProvider({ verifyLogin: failVerify });
    const flowState = makeFlowState();
    const res = fakeRes({
      method: "POST",
      body: {
        flow_state: flowState,
        username: "alice@example.com",
        password: "badpass",
      },
    });
    await provider.authorize(
      TEST_CLIENT,
      {
        codeChallenge: "abc123",
        redirectUri: "https://client.example.com/callback",
      },
      res as unknown as import("express").Response,
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("Login failed");
  });

  test("username not in allowlist => re-renders with generic login error (no enumeration oracle)", async () => {
    const { provider } = makeProvider({ allowedUsernames: ["allowed@example.com"] });
    const flowState = makeFlowState();
    const res = fakeRes({
      method: "POST",
      body: {
        flow_state: flowState,
        username: "notallowed@example.com",
        password: "secret",
      },
    });
    await provider.authorize(
      TEST_CLIENT,
      {
        codeChallenge: "abc123",
        redirectUri: "https://client.example.com/callback",
      },
      res as unknown as import("express").Response,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Login failed");
    expect(res.body).not.toContain("not permitted");
  });

  test("allowlist match is case-insensitive and whitespace-tolerant", async () => {
    const { provider } = makeProvider({ allowedUsernames: ["alice@example.com"] });
    const flowState = makeFlowState();
    const res = fakeRes({
      method: "POST",
      body: {
        flow_state: flowState,
        username: "  Alice@Example.COM  ",
        password: "secret",
      },
    });
    await provider.authorize(
      TEST_CLIENT,
      {
        codeChallenge: "abc123",
        redirectUri: "https://client.example.com/callback",
      },
      res as unknown as import("express").Response,
    );

    expect(res.statusCode).toBe(302);
    expect(res.location).toContain("code=");
  });

  test("rate-limited => 429 with Retry-After", async () => {
    const db = createDb(":memory:");
    // Use a very tight rate limiter: 1 attempt per window
    const rateLimiter = createRateLimiter({ limit: 1, windowMs: 15 * 60_000 });
    const provider = createProvider({
      db,
      encryptionKey: ENCRYPTION_KEY,
      flowKey: FLOW_KEY,
      defaultServerUrl: "https://caldav.example.com",
      allowedUsernames: [],
      verifyLogin: okVerify,
      rateLimiter,
    });

    const flowState = makeFlowState();
    const body = {
      flow_state: flowState,
      username: "alice@example.com",
      password: "secret",
    };

    // First attempt consumes the limit
    const res1 = fakeRes({ method: "POST", body });
    await provider.authorize(
      TEST_CLIENT,
      {
        codeChallenge: "abc123",
        redirectUri: "https://client.example.com/callback",
      },
      res1 as unknown as import("express").Response,
    );
    // First attempt either succeeds or hits an issue; make a second attempt
    const flowState2 = makeFlowState();
    const res2 = fakeRes({ method: "POST", body: { ...body, flow_state: flowState2 } });
    await provider.authorize(
      TEST_CLIENT,
      {
        codeChallenge: "abc123",
        redirectUri: "https://client.example.com/callback",
      },
      res2 as unknown as import("express").Response,
    );

    expect(res2.statusCode).toBe(429);
    expect(res2.headers["retry-after"]).toBeTruthy();
  });
});

describe("challengeForAuthorizationCode", () => {
  test("returns stored challenge for valid code", async () => {
    const { provider } = makeProvider();
    const flowState = makeFlowState({ codeChallenge: "challenge-xyz" });
    const res = fakeRes({
      method: "POST",
      body: {
        flow_state: flowState,
        username: "alice@example.com",
        password: "secret",
      },
    });
    await provider.authorize(
      TEST_CLIENT,
      {
        codeChallenge: "challenge-xyz",
        redirectUri: "https://client.example.com/callback",
      },
      res as unknown as import("express").Response,
    );

    const u = new URL(res.location);
    const code = u.searchParams.get("code")!;
    expect(code).toBeTruthy();

    const challenge = await provider.challengeForAuthorizationCode(TEST_CLIENT, code);
    expect(challenge).toBe("challenge-xyz");
  });

  test("throws on unknown code", async () => {
    const { provider } = makeProvider();
    await expect(
      provider.challengeForAuthorizationCode(TEST_CLIENT, "nonexistent-code"),
    ).rejects.toThrow();
  });
});

describe("exchangeAuthorizationCode", () => {
  const setup = async () => {
    const { provider, db } = makeProvider();
    const flowState = makeFlowState({ codeChallenge: "pkce-challenge" });
    const res = fakeRes({
      method: "POST",
      body: {
        flow_state: flowState,
        username: "alice@example.com",
        password: "secret",
      },
    });
    await provider.authorize(
      TEST_CLIENT,
      {
        codeChallenge: "pkce-challenge",
        redirectUri: "https://client.example.com/callback",
      },
      res as unknown as import("express").Response,
    );

    const u = new URL(res.location);
    const code = u.searchParams.get("code")!;
    return { provider, db, code };
  };

  test("mints access + refresh tokens", async () => {
    const { provider, code } = await setup();
    const tokens = await provider.exchangeAuthorizationCode(TEST_CLIENT, code);
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.expires_in).toBe(3600);
  });

  test("second call with same code throws (code is consumed)", async () => {
    const { provider, code } = await setup();
    await provider.exchangeAuthorizationCode(TEST_CLIENT, code);
    await expect(provider.exchangeAuthorizationCode(TEST_CLIENT, code)).rejects.toThrow();
  });

  test("throws when redirectUri mismatches", async () => {
    const { provider, code } = await setup();
    await expect(
      provider.exchangeAuthorizationCode(
        TEST_CLIENT,
        code,
        undefined,
        "https://evil.example.com/callback",
      ),
    ).rejects.toThrow();
  });
});

describe("exchangeRefreshToken", () => {
  const setup = async () => {
    const { provider } = makeProvider();
    const flowState = makeFlowState({ codeChallenge: "pkce-challenge" });
    const res = fakeRes({
      method: "POST",
      body: {
        flow_state: flowState,
        username: "alice@example.com",
        password: "secret",
      },
    });
    await provider.authorize(
      TEST_CLIENT,
      {
        codeChallenge: "pkce-challenge",
        redirectUri: "https://client.example.com/callback",
      },
      res as unknown as import("express").Response,
    );

    const u = new URL(res.location);
    const code = u.searchParams.get("code")!;
    const tokens = await provider.exchangeAuthorizationCode(TEST_CLIENT, code);
    return { provider, tokens };
  };

  test("rotates: old token becomes invalid, new token validates", async () => {
    const { provider, tokens } = await setup();
    const oldRefresh = tokens.refresh_token!;

    const newTokens = await provider.exchangeRefreshToken(TEST_CLIENT, oldRefresh);
    expect(newTokens.refresh_token).toBeTruthy();
    expect(newTokens.refresh_token).not.toBe(oldRefresh);
    expect(newTokens.access_token).toBeTruthy();

    // Old refresh token should now be invalid
    await expect(provider.exchangeRefreshToken(TEST_CLIENT, oldRefresh)).rejects.toThrow();
  });

  test("refresh is rejected when account is removed from allowlist after issuance", async () => {
    const db = createDb(":memory:");
    const rateLimiter = createRateLimiter({ limit: 5, windowMs: 15 * 60_000 });
    const allowedUsernames = ["alice@example.com"];
    const provider = createProvider({
      db,
      encryptionKey: ENCRYPTION_KEY,
      flowKey: FLOW_KEY,
      defaultServerUrl: "https://caldav.example.com",
      allowedUsernames,
      verifyLogin: okVerify,
      rateLimiter,
    });

    const flowState = makeFlowState({ codeChallenge: "pkce-challenge" });
    const res = fakeRes({
      method: "POST",
      body: {
        flow_state: flowState,
        username: "alice@example.com",
        password: "secret",
      },
    });
    await provider.authorize(
      TEST_CLIENT,
      {
        codeChallenge: "pkce-challenge",
        redirectUri: "https://client.example.com/callback",
      },
      res as unknown as import("express").Response,
    );
    const u = new URL(res.location);
    const code = u.searchParams.get("code")!;
    const tokens = await provider.exchangeAuthorizationCode(TEST_CLIENT, code);

    // Remove alice from the live allowlist (mutate in place so provider sees it)
    allowedUsernames.length = 0;
    allowedUsernames.push("bob@example.com");

    await expect(
      provider.exchangeRefreshToken(TEST_CLIENT, tokens.refresh_token!),
    ).rejects.toThrow();
  });
});

describe("verifyAccessToken", () => {
  const setup = async (nowFn?: () => number) => {
    const { provider } = makeProvider({ now: nowFn });
    const flowState = makeFlowState({ codeChallenge: "pkce-challenge" });
    const res = fakeRes({
      method: "POST",
      body: {
        flow_state: flowState,
        username: "alice@example.com",
        password: "secret",
      },
    });
    await provider.authorize(
      TEST_CLIENT,
      {
        codeChallenge: "pkce-challenge",
        redirectUri: "https://client.example.com/callback",
      },
      res as unknown as import("express").Response,
    );

    const u = new URL(res.location);
    const code = u.searchParams.get("code")!;
    const tokens = await provider.exchangeAuthorizationCode(TEST_CLIENT, code);
    return { provider, tokens };
  };

  test("returns AuthInfo with extra.accountId", async () => {
    const { provider, tokens } = await setup();
    const info = await provider.verifyAccessToken(tokens.access_token);
    expect(info.token).toBe(tokens.access_token);
    expect(info.clientId).toBe(TEST_CLIENT.client_id);
    expect(info.scopes).toBeInstanceOf(Array);
    expect(info.extra?.accountId).toBeTruthy();
  });

  test("expired access token throws", async () => {
    // Issue token at time 0, then verify at time far in the future
    let t = 0;
    const nowFn = () => t;
    const { provider, tokens } = await setup(nowFn);

    // Advance time past the 3600s expiry
    t = 3600_001;
    await expect(provider.verifyAccessToken(tokens.access_token)).rejects.toThrow();
  });

  test("access token rejected when account is removed from allowlist after issuance", async () => {
    const db = createDb(":memory:");
    const rateLimiter = createRateLimiter({ limit: 5, windowMs: 15 * 60_000 });
    const allowedUsernames = ["alice@example.com"];
    const provider = createProvider({
      db,
      encryptionKey: ENCRYPTION_KEY,
      flowKey: FLOW_KEY,
      defaultServerUrl: "https://caldav.example.com",
      allowedUsernames,
      verifyLogin: okVerify,
      rateLimiter,
    });

    const flowState = makeFlowState({ codeChallenge: "pkce-challenge" });
    const res = fakeRes({
      method: "POST",
      body: {
        flow_state: flowState,
        username: "alice@example.com",
        password: "secret",
      },
    });
    await provider.authorize(
      TEST_CLIENT,
      {
        codeChallenge: "pkce-challenge",
        redirectUri: "https://client.example.com/callback",
      },
      res as unknown as import("express").Response,
    );
    const u = new URL(res.location);
    const code = u.searchParams.get("code")!;
    const tokens = await provider.exchangeAuthorizationCode(TEST_CLIENT, code);

    // Token works initially
    const info = await provider.verifyAccessToken(tokens.access_token);
    expect(info.extra?.accountId).toBeTruthy();

    // Remove alice from the live allowlist (mutate in place so provider sees it)
    allowedUsernames.length = 0;
    allowedUsernames.push("bob@example.com");

    await expect(provider.verifyAccessToken(tokens.access_token)).rejects.toThrow();
  });
});

describe("revokeToken", () => {
  test("revoke with token_type_hint: refresh_token invalidates it", async () => {
    const { provider } = makeProvider();
    const flowState = makeFlowState({ codeChallenge: "pkce-challenge" });
    const res = fakeRes({
      method: "POST",
      body: {
        flow_state: flowState,
        username: "alice@example.com",
        password: "secret",
      },
    });
    await provider.authorize(
      TEST_CLIENT,
      {
        codeChallenge: "pkce-challenge",
        redirectUri: "https://client.example.com/callback",
      },
      res as unknown as import("express").Response,
    );

    const u = new URL(res.location);
    const code = u.searchParams.get("code")!;
    const tokens = await provider.exchangeAuthorizationCode(TEST_CLIENT, code);
    const refreshToken = tokens.refresh_token!;

    await provider.revokeToken!(TEST_CLIENT, {
      token: refreshToken,
      token_type_hint: "refresh_token",
    });

    await expect(provider.exchangeRefreshToken(TEST_CLIENT, refreshToken)).rejects.toThrow();
  });
});

describe("clientsStore", () => {
  test("registerClient requires at least one redirect_uri", async () => {
    const { provider } = makeProvider();
    await expect(
      provider.clientsStore.registerClient!({
        redirect_uris: [],
        client_name: "test",
      } as unknown as Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">),
    ).rejects.toThrow("redirect_uris required");
  });

  test("registerClient rejects non-https non-localhost redirect_uris", async () => {
    const { provider } = makeProvider();
    await expect(
      provider.clientsStore.registerClient!({
        redirect_uris: ["http://evil.example.com/callback"],
        client_name: "test",
      } as unknown as Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">),
    ).rejects.toThrow("invalid redirect_uri");
  });

  test("registerClient accepts localhost http redirect_uris", async () => {
    const { provider } = makeProvider();
    const result = await provider.clientsStore.registerClient!({
      redirect_uris: ["http://localhost:8080/callback"],
      client_name: "test",
    } as unknown as Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">);
    expect(result.client_id).toBeTruthy();
  });

  test("registerClient accepts custom-scheme redirect_uris", async () => {
    const { provider } = makeProvider();
    const result = await provider.clientsStore.registerClient!({
      redirect_uris: ["raycast://oauth"],
      client_name: "test",
    } as unknown as Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">);
    expect(result.client_id).toBeTruthy();
  });

  test("registerClient rejects dangerous custom-scheme redirect_uris", async () => {
    const { provider } = makeProvider();
    await expect(
      provider.clientsStore.registerClient!({
        redirect_uris: ["javascript:alert(1)"],
        client_name: "test",
      } as unknown as Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">),
    ).rejects.toThrow("invalid redirect_uri");
  });
});
