export type StdioConfig = {
  serverUrl: string;
  username: string;
  password: string;
};

export type HttpConfig = {
  publicUrl: string;
  encryptionKey: Uint8Array;
  dbPath: string;
  port: number;
  host: string;
  allowedUsernames: string[];
  defaultServerUrl: string;
};

const required = (env: Record<string, string | undefined>, key: string): string => {
  const v = env[key];
  if (!v) throw new Error(`Missing required env var ${key}`);
  return v;
};

export const parseStdioConfig = (env: Record<string, string | undefined>): StdioConfig => ({
  serverUrl: required(env, "CALDAV_SERVER_URL"),
  username: required(env, "CALDAV_USERNAME"),
  password: required(env, "CALDAV_APP_PASSWORD"),
});

const decodeKey = (b64: string): Uint8Array => {
  const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  if (bytes.length !== 32) {
    throw new Error(`CALDAV_MCP_ENCRYPTION_KEY must decode to 32 bytes, got ${bytes.length}`);
  }
  return bytes;
};

const isLocalhost = (u: URL): boolean =>
  u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";

export const normalizeUsername = (s: string): string => s.trim().toLowerCase();

export const parseHttpConfig = (env: Record<string, string | undefined>): HttpConfig => {
  const publicUrlStr = required(env, "CALDAV_MCP_PUBLIC_URL").replace(/\/$/, "");
  const url = new URL(publicUrlStr);
  if (url.protocol !== "https:" && !isLocalhost(url)) {
    throw new Error("CALDAV_MCP_PUBLIC_URL must use HTTPS (or be localhost for dev)");
  }
  const encryptionKey = decodeKey(required(env, "CALDAV_MCP_ENCRYPTION_KEY"));
  const allowedUsernames = (env.CALDAV_MCP_ALLOWED_USERNAMES ?? "")
    .split(",")
    .map(normalizeUsername)
    .filter(Boolean);
  if (allowedUsernames.length === 0) {
    throw new Error(
      "CALDAV_MCP_ALLOWED_USERNAMES must be set to a non-empty comma-separated list of usernames",
    );
  }
  return {
    publicUrl: publicUrlStr,
    encryptionKey,
    dbPath: env.CALDAV_MCP_DB_PATH ?? "/data/caldav-mcp.sqlite",
    port: Number(env.CALDAV_MCP_PORT ?? "3000"),
    host: env.CALDAV_MCP_HOST ?? "0.0.0.0",
    allowedUsernames,
    defaultServerUrl: env.CALDAV_MCP_DEFAULT_SERVER_URL ?? "https://caldav.fastmail.com/",
  };
};
