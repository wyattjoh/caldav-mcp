import { test, expect } from "bun:test";
import { createDb } from "./index";
import { applyMigrations } from "./migrations";

test("createDb applies migrations and creates all tables", () => {
  const db = createDb(":memory:");
  const tables = db
    .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all();
  const names = tables.map((t) => t.name);
  expect(names).toContain("oauth_clients");
  expect(names).toContain("caldav_accounts");
  expect(names).toContain("auth_codes");
  expect(names).toContain("access_tokens");
  expect(names).toContain("refresh_tokens");
  expect(names).toContain("schema_migrations");
});

test("oauth_clients has SDK-required columns", () => {
  const db = createDb(":memory:");
  const columns = db
    .query<{ name: string }, []>("PRAGMA table_info(oauth_clients)")
    .all()
    .map((c) => c.name);
  for (const c of [
    "client_id",
    "client_name",
    "redirect_uris",
    "scope",
    "client_uri",
    "logo_uri",
    "token_endpoint_auth_method",
    "grant_types",
    "response_types",
    "created_at",
  ]) {
    expect(columns).toContain(c);
  }
});

test("auth_codes.resource is nullable and codes carry scopes", () => {
  const db = createDb(":memory:");
  const info = db
    .query<{ name: string; notnull: number }, []>("PRAGMA table_info(auth_codes)")
    .all();
  const resource = info.find((c) => c.name === "resource");
  expect(resource).toBeDefined();
  expect(resource!.notnull).toBe(0);
  const scopes = info.find((c) => c.name === "scopes");
  expect(scopes).toBeDefined();
});

test("access_tokens and refresh_tokens have scopes columns", () => {
  const db = createDb(":memory:");
  for (const tbl of ["access_tokens", "refresh_tokens"]) {
    const info = db.query<{ name: string }, []>(`PRAGMA table_info(${tbl})`).all();
    expect(info.map((c) => c.name)).toContain("scopes");
  }
});

test("applying migrations is idempotent (re-run is a no-op)", () => {
  const db = createDb(":memory:");
  const first = db
    .query<{ version: number }, []>("SELECT version FROM schema_migrations ORDER BY version")
    .all()
    .map((r) => r.version);
  // re-applying should not add duplicates or throw
  applyMigrations(db);
  const second = db
    .query<{ version: number }, []>("SELECT version FROM schema_migrations ORDER BY version")
    .all()
    .map((r) => r.version);
  expect(second).toEqual(first);
});
