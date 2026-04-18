import type { Database } from "bun:sqlite";

export type Migration = { version: number; up: string };

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE oauth_clients (
        client_id TEXT PRIMARY KEY,
        client_name TEXT,
        redirect_uris TEXT NOT NULL,
        scope TEXT,
        client_uri TEXT,
        logo_uri TEXT,
        token_endpoint_auth_method TEXT,
        grant_types TEXT,
        response_types TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE caldav_accounts (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        server_url TEXT NOT NULL,
        encrypted_password BLOB NOT NULL,
        nonce BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (username, server_url)
      );

      CREATE TABLE auth_codes (
        code TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        code_challenge TEXT NOT NULL,
        resource TEXT,
        scopes TEXT,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE access_tokens (
        token_hash TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        resource TEXT,
        scopes TEXT,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE refresh_tokens (
        token_hash TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        resource TEXT,
        scopes TEXT,
        expires_at INTEGER NOT NULL,
        rotated_from TEXT
      );

      CREATE INDEX idx_auth_codes_expires ON auth_codes(expires_at);
      CREATE INDEX idx_access_tokens_expires ON access_tokens(expires_at);
      CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);
    `,
  },
];

export const applyMigrations = (db: Database): void => {
  db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);
  const applied = new Set(
    db
      .query<{ version: number }, []>("SELECT version FROM schema_migrations")
      .all()
      .map((r) => r.version),
  );
  const insert = db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)");
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      db.run(m.up);
      insert.run(m.version, Date.now());
    })();
  }
};
