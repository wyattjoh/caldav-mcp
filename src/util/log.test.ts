import { test, expect } from "bun:test";
import express from "express";
import request from "supertest";
import { requestLogger, errorLogger } from "./log";

const captureStderr = async (fn: () => Promise<void>): Promise<string> => {
  const chunks: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  }) as typeof process.stderr.write;
  try {
    await fn();
  } finally {
    process.stderr.write = original;
  }
  return chunks.join("");
};

test("requestLogger writes method, path, status, duration to stderr", async () => {
  const app = express();
  app.use(requestLogger());
  app.get("/ping", (_req, res) => res.status(200).send("ok"));

  const out = await captureStderr(async () => {
    await request(app).get("/ping");
  });

  expect(out).toMatch(/caldav-mcp: GET \/ping -> 200 \(\d+ms\)/);
});

test("requestLogger redacts OAuth code and token query params", async () => {
  const app = express();
  app.use(requestLogger());
  app.get("/authorize", (_req, res) => res.status(302).send());

  const out = await captureStderr(async () => {
    await request(app).get("/authorize?client_id=abc&code=SECRET123&access_token=TOP&state=x");
  });

  expect(out).not.toContain("SECRET123");
  expect(out).not.toContain("TOP");
  expect(out).toContain("code=<redacted>");
  expect(out).toContain("access_token=<redacted>");
  expect(out).toContain("client_id=abc");
});

test("errorLogger writes stack and responds with 500 JSON instead of Express's default HTML", async () => {
  const app = express();
  app.use(requestLogger());
  app.get("/boom", (_req, _res, next) => {
    next(new Error("kaboom"));
  });
  app.use(errorLogger());

  let res: request.Response;
  const out = await captureStderr(async () => {
    res = await request(app).get("/boom");
  });

  expect(out).toMatch(/caldav-mcp: error GET \/boom: .*kaboom/);
  expect(res!.status).toBe(500);
  expect(res!.headers["content-type"]).toMatch(/application\/json/);
  expect(res!.body).toEqual({ error: "server_error" });
});
