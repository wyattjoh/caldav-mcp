import type { RequestHandler, ErrorRequestHandler } from "express";
import { formatError } from "./errors";

const redactPath = (url: string): string =>
  url.replace(
    /([?&](?:code|token|refresh_token|access_token|client_secret)=)[^&]+/gi,
    "$1<redacted>",
  );

const sanitizeRegistrationValue = (value: unknown): unknown => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeRegistrationValue(item));
  if (typeof value === "object") return "[object]";
  return `[${typeof value}]`;
};

export const summarizeClientRegistration = (body: unknown): string => {
  if (typeof body !== "object" || body === null) return formatError(body);

  const input = body as Record<string, unknown>;
  const summary: Record<string, unknown> = {};

  for (const key of [
    "client_name",
    "redirect_uris",
    "grant_types",
    "response_types",
    "token_endpoint_auth_method",
    "scope",
    "client_uri",
    "logo_uri",
  ]) {
    if (key in input) {
      summary[key] = sanitizeRegistrationValue(input[key]);
    }
  }

  if (Object.keys(summary).length === 0) {
    summary.keys = Object.keys(input).sort();
  }

  return JSON.stringify(summary);
};

export const requestLogger = (): RequestHandler => (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    const ip = req.ip ?? req.socket.remoteAddress ?? "?";
    process.stderr.write(
      `caldav-mcp: ${req.method} ${redactPath(req.originalUrl)} -> ${res.statusCode} (${ms}ms) ip=${ip}\n`,
    );
  });
  next();
};

export const registrationLogger = (): RequestHandler => (req, _res, next) => {
  if (req.method === "POST" && req.path === "/register") {
    process.stderr.write(
      `caldav-mcp: register request ${summarizeClientRegistration(req.body)}\n`,
    );
  }
  next();
};

export const errorLogger = (): ErrorRequestHandler => (err, req, res, next) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`caldav-mcp: error ${req.method} ${redactPath(req.originalUrl)}: ${msg}\n`);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "server_error" });
};
