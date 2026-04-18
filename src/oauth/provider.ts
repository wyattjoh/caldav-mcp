import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  InvalidGrantError,
  InvalidTargetError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { Request, Response } from "express";
import { randomBytes } from "node:crypto";
import type { Database } from "bun:sqlite";
import * as store from "./db";
import { renderLoginPage, signFlowState, verifyFlowState } from "./login-page";
import type { RateLimiter } from "./rate-limit";
import { createClientsStore } from "./clients-store";

export type VerifyLogin = (input: {
  serverUrl: string;
  username: string;
  password: string;
}) => Promise<void>;

export type ProviderOptions = {
  db: Database;
  encryptionKey: Uint8Array;
  flowKey: Uint8Array;
  defaultServerUrl: string;
  allowedUsernames: string[];
  verifyLogin: VerifyLogin;
  rateLimiter: RateLimiter;
  now?: () => number;
};

const ACCESS_TTL_MS = 3600_000;
const REFRESH_TTL_MS = 30 * 24 * 3600_000;
const AUTH_CODE_TTL_MS = 60_000;

const randomToken = (): string => randomBytes(32).toString("base64url");

export const createProvider = (opts: ProviderOptions): OAuthServerProvider => {
  const now = opts.now ?? (() => Date.now());
  const clients = createClientsStore(opts.db, now);

  return {
    clientsStore: clients,

    async authorize(
      client: OAuthClientInformationFull,
      params: AuthorizationParams,
      res: Response,
    ) {
      const req = res.req as Request;

      if (req.method === "GET") {
        const flowState = signFlowState(
          {
            clientId: client.client_id,
            redirectUri: params.redirectUri,
            codeChallenge: params.codeChallenge,
            resource: params.resource?.toString(),
            scopes: params.scopes,
            state: params.state,
          },
          opts.flowKey,
        );
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.send(renderLoginPage({ flowState, defaultServerUrl: opts.defaultServerUrl }));
        return;
      }

      const body = (req.body ?? {}) as Record<string, string>;
      const flowStateStr = body.flow_state ?? "";
      const flow = verifyFlowState(flowStateStr, opts.flowKey);
      if (!flow) {
        res
          .status(400)
          .setHeader("content-type", "text/plain")
          .send("Flow expired, please restart authorization.");
        return;
      }

      const username = body.username ?? "";
      const password = body.password ?? "";
      const serverUrl = body.server_url ?? opts.defaultServerUrl;

      const ip = (
        req.headers["x-forwarded-for"]?.toString().split(",")[0] ??
        req.socket?.remoteAddress ??
        "local"
      ).trim();

      const rl = opts.rateLimiter.check(`${ip}|${username}`);
      if (!rl.allowed) {
        res
          .status(429)
          .setHeader("Retry-After", String(Math.ceil(rl.retryAfterMs / 1000)))
          .send("Too many attempts.");
        return;
      }

      if (opts.allowedUsernames.length > 0 && !opts.allowedUsernames.includes(username)) {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.send(
          renderLoginPage({
            flowState: flowStateStr,
            defaultServerUrl: opts.defaultServerUrl,
            error: "This username is not permitted.",
          }),
        );
        return;
      }

      try {
        await opts.verifyLogin({ serverUrl, username, password });
      } catch {
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.send(
          renderLoginPage({
            flowState: flowStateStr,
            defaultServerUrl: opts.defaultServerUrl,
            error: "Login failed. Check your server URL, username, and app password.",
          }),
        );
        return;
      }

      const accountId = store.upsertAccount(
        opts.db,
        opts.encryptionKey,
        { username, serverUrl, password },
        now,
      );
      const code = randomToken();
      store.insertAuthCode(opts.db, {
        code,
        clientId: flow.clientId,
        accountId,
        redirectUri: flow.redirectUri,
        codeChallenge: flow.codeChallenge,
        resource: flow.resource,
        scopes: flow.scopes,
        expiresAt: now() + AUTH_CODE_TTL_MS,
      });

      const redirect = new URL(flow.redirectUri);
      redirect.searchParams.set("code", code);
      if (flow.state) redirect.searchParams.set("state", flow.state);
      res.redirect(302, redirect.toString());
    },

    async challengeForAuthorizationCode(
      _client: OAuthClientInformationFull,
      authorizationCode: string,
    ) {
      const row = store.peekAuthCode(opts.db, authorizationCode, now);
      if (!row) throw new InvalidGrantError("invalid authorization code");
      return row.codeChallenge;
    },

    async exchangeAuthorizationCode(
      client: OAuthClientInformationFull,
      authorizationCode: string,
      _codeVerifier?: string,
      redirectUri?: string,
      resource?: URL,
    ): Promise<OAuthTokens> {
      const row = store.consumeAuthCode(opts.db, authorizationCode, now);
      if (!row) throw new InvalidGrantError("invalid or expired authorization code");
      if (row.clientId !== client.client_id) throw new InvalidGrantError("client mismatch");
      if (redirectUri && redirectUri !== row.redirectUri)
        throw new InvalidGrantError("redirect_uri mismatch");
      if (resource && row.resource && resource.toString() !== row.resource)
        throw new InvalidTargetError("resource mismatch");

      const accessToken = randomToken();
      const refreshToken = randomToken();
      const ts = now();
      store.insertAccessToken(
        opts.db,
        {
          token: accessToken,
          clientId: client.client_id,
          accountId: row.accountId,
          scopes: row.scopes,
          resource: row.resource,
          expiresAt: ts + ACCESS_TTL_MS,
        },
        now,
      );
      store.insertRefreshToken(opts.db, {
        token: refreshToken,
        clientId: client.client_id,
        accountId: row.accountId,
        scopes: row.scopes,
        resource: row.resource,
        expiresAt: ts + REFRESH_TTL_MS,
      });
      return {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: Math.floor(ACCESS_TTL_MS / 1000),
        refresh_token: refreshToken,
        scope: row.scopes?.join(" "),
      } satisfies OAuthTokens;
    },

    async exchangeRefreshToken(
      client: OAuthClientInformationFull,
      refreshToken: string,
      _scopes?: string[],
      resource?: URL,
    ): Promise<OAuthTokens> {
      const before = store.lookupRefreshToken(opts.db, refreshToken, now);
      if (!before) throw new InvalidGrantError("invalid or expired refresh token");
      if (before.clientId !== client.client_id) throw new InvalidGrantError("client mismatch");
      if (resource && before.resource && resource.toString() !== before.resource)
        throw new InvalidTargetError("resource mismatch");

      const newRefresh = randomToken();
      const rotated = store.rotateRefreshToken(opts.db, refreshToken, newRefresh, now);
      if (!rotated) throw new InvalidGrantError("refresh token rotation failed");

      const accessToken = randomToken();
      const ts = now();
      store.insertAccessToken(
        opts.db,
        {
          token: accessToken,
          clientId: client.client_id,
          accountId: rotated.accountId,
          scopes: rotated.scopes,
          resource: rotated.resource,
          expiresAt: ts + ACCESS_TTL_MS,
        },
        now,
      );
      return {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: Math.floor(ACCESS_TTL_MS / 1000),
        refresh_token: newRefresh,
        scope: rotated.scopes?.join(" "),
      } satisfies OAuthTokens;
    },

    async verifyAccessToken(token: string): Promise<AuthInfo> {
      const row = store.validateAccessToken(opts.db, token, now);
      if (!row) throw new InvalidTokenError("invalid or expired access token");
      return {
        token,
        clientId: row.clientId,
        scopes: row.scopes ?? [],
        expiresAt: Math.floor(row.expiresAt / 1000),
        resource: row.resource ? new URL(row.resource) : undefined,
        extra: { accountId: row.accountId },
      };
    },

    async revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest) {
      if (request.token_type_hint === "refresh_token") {
        store.revokeRefreshToken(opts.db, request.token);
      } else {
        store.revokeAccessToken(opts.db, request.token);
      }
    },
  };
};
