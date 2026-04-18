import { test, expect } from "bun:test";
import { createHash } from "node:crypto";
import request from "supertest";
import { buildHttpApp } from "./http";

const challengeFor = (v: string) => createHash("sha256").update(v).digest("base64url");

const defaultOpts = () => ({
  publicUrl: "http://localhost:3000",
  defaultServerUrl: "https://caldav.fastmail.com/",
  encryptionKey: new Uint8Array(32).fill(7),
  allowedUsernames: [],
  dbPath: ":memory:",
  verifyLogin: async () => {},
});

test("trusts a single upstream proxy so X-Forwarded-For is honored by express-rate-limit", () => {
  const { app } = buildHttpApp(defaultOpts());
  expect(app.get("trust proxy")).toBe(1);
});

test("unauthenticated POST /mcp returns 401 + WWW-Authenticate", async () => {
  const { app } = buildHttpApp(defaultOpts());
  const res = await request(app)
    .post("/mcp")
    .set("content-type", "application/json")
    .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  expect(res.status).toBe(401);
  expect(res.headers["www-authenticate"]).toMatch(/resource_metadata=/);
});

test("unauthenticated POST / returns 401 so Claude.ai root-path clients get a proper challenge", async () => {
  const { app } = buildHttpApp(defaultOpts());
  const res = await request(app)
    .post("/")
    .set("content-type", "application/json")
    .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  expect(res.status).toBe(401);
  expect(res.headers["www-authenticate"]).toMatch(/resource_metadata=/);
});

test("GET /.well-known/oauth-protected-resource returns metadata", async () => {
  const { app } = buildHttpApp(defaultOpts());
  const res = await request(app).get("/.well-known/oauth-protected-resource");
  expect(res.status).toBe(200);
  expect(res.body.resource).toBeDefined();
});

test("GET /.well-known/oauth-authorization-server returns metadata", async () => {
  const { app } = buildHttpApp(defaultOpts());
  const res = await request(app).get("/.well-known/oauth-authorization-server");
  expect(res.status).toBe(200);
  expect(res.body.code_challenge_methods_supported).toContain("S256");
});

test("GET /health returns ok", async () => {
  const { app } = buildHttpApp(defaultOpts());
  const res = await request(app).get("/health");
  expect(res.status).toBe(200);
  expect(res.body.status).toBe("ok");
});

test("end-to-end: DCR -> authorize -> token -> tools/list", async () => {
  const { app } = buildHttpApp(defaultOpts());

  // Dynamic Client Registration
  const reg = await request(app)
    .post("/register")
    .set("content-type", "application/json")
    .send({
      client_name: "claude",
      redirect_uris: ["https://app/cb"],
    });
  expect(reg.status).toBeLessThan(300);
  const clientId: string = reg.body.client_id;
  expect(clientId).toBeTruthy();

  const verifier = "v".repeat(43);
  const challenge = challengeFor(verifier);

  // GET /authorize — renders login form, extracts flow_state
  const getRes = await request(app).get("/authorize").query({
    response_type: "code",
    client_id: clientId,
    redirect_uri: "https://app/cb",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: "http://localhost:3000",
    state: "s",
  });
  expect(getRes.status).toBe(200);
  const flowStateMatch = /name="flow_state" value="([^"]+)"/.exec(getRes.text);
  expect(flowStateMatch).not.toBeNull();
  const flowState = flowStateMatch![1];

  // POST /authorize — submit credentials (stub verifyLogin always accepts).
  // The SDK's authorize handler validates client_id, redirect_uri, response_type,
  // code_challenge, and code_challenge_method from the POST body before calling
  // provider.authorize, so they must be included alongside our custom fields.
  const postRes = await request(app).post("/authorize").type("form").send({
    client_id: clientId,
    redirect_uri: "https://app/cb",
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: "http://localhost:3000",
    state: "s",
    flow_state: flowState,
    server_url: "https://caldav.fastmail.com/",
    username: "u@x.com",
    password: "p",
  });
  expect(postRes.status).toBe(302);
  const location = new URL(postRes.headers["location"] as string);
  const code = location.searchParams.get("code");
  expect(code).toBeTruthy();
  expect(location.searchParams.get("state")).toBe("s");

  // POST /token — exchange code for access token
  const tokenRes = await request(app).post("/token").type("form").send({
    grant_type: "authorization_code",
    code: code!,
    client_id: clientId,
    redirect_uri: "https://app/cb",
    code_verifier: verifier,
    resource: "http://localhost:3000",
  });
  expect(tokenRes.status).toBe(200);
  const accessToken: string = tokenRes.body.access_token;
  expect(accessToken).toBeTruthy();

  // POST /mcp with valid bearer token — should return tools list
  const mcpRes = await request(app)
    .post("/mcp")
    .set("authorization", `Bearer ${accessToken}`)
    .set("content-type", "application/json")
    .set("accept", "application/json, text/event-stream")
    .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });

  expect(mcpRes.status).toBe(200);
  // Streamable HTTP may respond with SSE or JSON body — check either
  const bodyString =
    typeof mcpRes.text === "string" && mcpRes.text.length > 0
      ? mcpRes.text
      : JSON.stringify(mcpRes.body);
  expect(bodyString).toContain("caldav_list_calendars");
});
