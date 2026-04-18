import { test, expect } from "bun:test";
import { parseStdioConfig, parseHttpConfig } from "./config";

test("parseStdioConfig returns values from env", () => {
  const cfg = parseStdioConfig({
    CALDAV_SERVER_URL: "https://caldav.fastmail.com/",
    CALDAV_USERNAME: "user@fastmail.com",
    CALDAV_APP_PASSWORD: "abc",
  });
  expect(cfg.serverUrl).toBe("https://caldav.fastmail.com/");
  expect(cfg.username).toBe("user@fastmail.com");
  expect(cfg.password).toBe("abc");
});

test("parseStdioConfig throws on missing vars", () => {
  expect(() => parseStdioConfig({})).toThrow(/CALDAV_SERVER_URL/);
});

test("parseHttpConfig returns defaults and requires PUBLIC_URL + ENCRYPTION_KEY", () => {
  const cfg = parseHttpConfig({
    CALDAV_MCP_PUBLIC_URL: "https://caldav-mcp.example.com",
    CALDAV_MCP_ENCRYPTION_KEY: "aGVsbG9oZWxsb2hlbGxvaGVsbG9oZWxsb2hlbGxvaGU=",
  });
  expect(cfg.publicUrl).toBe("https://caldav-mcp.example.com");
  expect(cfg.port).toBe(3000);
  expect(cfg.host).toBe("0.0.0.0");
  expect(cfg.dbPath).toBe("/data/caldav-mcp.sqlite");
  expect(cfg.defaultServerUrl).toBe("https://caldav.fastmail.com/");
  expect(cfg.allowedUsernames).toEqual([]);
});

test("parseHttpConfig rejects non-HTTPS public URL unless localhost", () => {
  expect(() =>
    parseHttpConfig({
      CALDAV_MCP_PUBLIC_URL: "http://example.com",
      CALDAV_MCP_ENCRYPTION_KEY: "aGVsbG9oZWxsb2hlbGxvaGVsbG9oZWxsb2hlbGxvaGU=",
    }),
  ).toThrow(/HTTPS/);
});

test("parseHttpConfig rejects encryption key that is not 32 decoded bytes", () => {
  expect(() =>
    parseHttpConfig({
      CALDAV_MCP_PUBLIC_URL: "https://example.com",
      CALDAV_MCP_ENCRYPTION_KEY: "aGVsbG8=",
    }),
  ).toThrow(/32 bytes/);
});

test("parseHttpConfig parses allowed usernames CSV", () => {
  const cfg = parseHttpConfig({
    CALDAV_MCP_PUBLIC_URL: "https://example.com",
    CALDAV_MCP_ENCRYPTION_KEY: "aGVsbG9oZWxsb2hlbGxvaGVsbG9oZWxsb2hlbGxvaGU=",
    CALDAV_MCP_ALLOWED_USERNAMES: "a@x.com, b@y.com",
  });
  expect(cfg.allowedUsernames).toEqual(["a@x.com", "b@y.com"]);
});
