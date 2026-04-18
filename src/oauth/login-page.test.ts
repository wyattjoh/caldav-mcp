import { test, expect } from "bun:test";
import { signFlowState, verifyFlowState, renderLoginPage } from "./login-page";

const KEY = new Uint8Array(32).fill(1);
const payload = {
  clientId: "c",
  redirectUri: "https://app/cb",
  codeChallenge: "cc",
  resource: "https://mcp.test",
  scopes: ["caldav"],
  state: "s",
};

test("signFlowState + verifyFlowState round trip", () => {
  const token = signFlowState(payload, KEY);
  expect(verifyFlowState(token, KEY)).toEqual(payload);
});

test("tampered flow_state fails verification", () => {
  const token = signFlowState(payload, KEY);
  expect(verifyFlowState(token + "x", KEY)).toBeUndefined();
});

test("expired flow_state fails verification", () => {
  const token = signFlowState(payload, KEY, -1000);
  expect(verifyFlowState(token, KEY)).toBeUndefined();
});

test("wrong key fails verification", () => {
  const token = signFlowState(payload, KEY);
  const bad = new Uint8Array(32).fill(9);
  expect(verifyFlowState(token, bad)).toBeUndefined();
});

test("renderLoginPage escapes the server URL and includes flow_state", () => {
  const html = renderLoginPage({
    flowState: "fs",
    defaultServerUrl: 'https://evil.com/"><script>alert(1)</script>',
  });
  expect(html).toContain('name="flow_state" value="fs"');
  expect(html).not.toContain("<script>alert(1)</script>");
  expect(html).toContain("&lt;script&gt;");
});

test("renderLoginPage includes an error message when provided", () => {
  const html = renderLoginPage({
    flowState: "fs",
    defaultServerUrl: "https://caldav.fastmail.com/",
    error: "Login failed.",
  });
  expect(html).toContain("Login failed.");
});
