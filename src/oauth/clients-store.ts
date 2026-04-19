import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { randomUUID } from "node:crypto";
import type { Database } from "bun:sqlite";
import * as store from "./db";
import { formatError } from "../util/errors";
import { summarizeClientRegistration } from "../util/log";

const isValidRedirect = (uri: string): boolean => {
  try {
    const u = new URL(uri);
    const localhost =
      u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:") return localhost;

    // Native app OAuth callbacks commonly use custom URI schemes such as raycast://oauth.
    return !["data:", "file:", "javascript:"].includes(u.protocol);
  } catch {
    return false;
  }
};

export const createClientsStore = (
  db: Database,
  now: () => number = () => Date.now(),
): OAuthRegisteredClientsStore => ({
  async getClient(clientId) {
    const row = store.getClient(db, clientId);
    if (!row) return undefined;
    return {
      client_id: row.clientId,
      client_name: row.clientName,
      redirect_uris: row.redirectUris,
      scope: row.scope,
      client_uri: row.clientUri ?? undefined,
      logo_uri: row.logoUri ?? undefined,
      token_endpoint_auth_method: row.tokenEndpointAuthMethod ?? "none",
      grant_types: row.grantTypes,
      response_types: row.responseTypes,
      client_id_issued_at: undefined,
      client_secret: undefined,
      client_secret_expires_at: undefined,
    } as OAuthClientInformationFull;
  },

  async registerClient(client) {
    const summary = summarizeClientRegistration(client);
    if (!Array.isArray(client.redirect_uris) || client.redirect_uris.length === 0) {
      const error = new Error("redirect_uris required");
      process.stderr.write(`caldav-mcp: register failed ${summary}: ${formatError(error)}\n`);
      throw error;
    }
    try {
      for (const uri of client.redirect_uris) {
        const uriStr = uri.toString();
        if (!isValidRedirect(uriStr)) throw new Error("invalid redirect_uri: " + uriStr);
      }
      const clientId = randomUUID();
      store.insertClient(
        db,
        {
          clientId,
          clientName: client.client_name,
          redirectUris: client.redirect_uris.map((u) => u.toString()),
          scope: client.scope,
          clientUri: client.client_uri,
          logoUri: client.logo_uri,
          tokenEndpointAuthMethod: client.token_endpoint_auth_method ?? "none",
          grantTypes: client.grant_types,
          responseTypes: client.response_types,
        },
        now,
      );
      return {
        ...client,
        client_id: clientId,
        client_id_issued_at: Math.floor(now() / 1000),
      } as OAuthClientInformationFull;
    } catch (error) {
      process.stderr.write(`caldav-mcp: register failed ${summary}: ${formatError(error)}\n`);
      throw error;
    }
  },
});
