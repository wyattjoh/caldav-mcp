FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine
LABEL org.opencontainers.image.title="caldav-mcp" \
      org.opencontainers.image.description="MCP server for CalDAV calendars (Fastmail-tested) with OAuth 2.1 HTTP transport" \
      org.opencontainers.image.source="https://github.com/wyattjoh/caldav-mcp" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
ENV NODE_ENV=production
ENV CALDAV_MCP_HOST=0.0.0.0
ENV CALDAV_MCP_PORT=3000
ENV CALDAV_MCP_DB_PATH=/data/caldav-mcp.sqlite
EXPOSE 3000
VOLUME ["/data"]
USER bun
CMD ["bun", "run", "src/index.ts", "--http"]
