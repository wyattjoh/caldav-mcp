import type { RequestHandler, ErrorRequestHandler } from "express";

const redactPath = (url: string): string =>
  url.replace(
    /([?&](?:code|token|refresh_token|access_token|client_secret)=)[^&]+/gi,
    "$1<redacted>",
  );

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

export const errorLogger = (): ErrorRequestHandler => (err, req, res, next) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`caldav-mcp: error ${req.method} ${redactPath(req.originalUrl)}: ${msg}\n`);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "server_error" });
};
